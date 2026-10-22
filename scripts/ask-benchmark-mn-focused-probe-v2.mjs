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

// Controller-joined version. Private recipe values come only from the pinned
// private source. This code neither evaluates that source nor issues authority.
export const MN_FOCUSED_CONTROLLER_VERSION='focused-controller-observation-v3';
const digest=value=>'sha256:'+hash(value);
function privateLiteral(text){
  if(/^"(?:[^"\\]|\\.)*"$/u.test(text)){const value=JSON.parse(text);if(typeof value==='string')return value;}
  if(/^'[^'\\\r\n]*'$/u.test(text))return text.slice(1,-1);
  throw refusal('focused_private_literal_invalid');
}
function parseControllerPlan(source){
  const header=source.match(/^function run\(([^\n]*)\)\{/mu);
  const defaultMatch=header?.[1].match(/,([A-Za-z_$][\w$]*)=((?:'[^'\\\r\n]*')|(?:"[^"\\\r\n]*"))$/u);
  const transform=source.match(/const weakened=source\.replace\(((?:'[^'\\\r\n]*')|(?:"[^"\\\r\n]*")),((?:'[^'\\\r\n]*')|(?:"[^"\\\r\n]*"))\)/u);
  const start=source.indexOf('function existingObservableCoverage('),middle=source.indexOf('function focusedEvaluate(',start),end=source.indexOf('export async function evaluateLegacyCandidateSafe(',middle);
  if(!defaultMatch||!transform||start<0||middle<0||end<0)throw refusal('focused_private_plan_shape_invalid');
  const existing=source.slice(start,middle),focused=source.slice(middle,end);
  const loop=existing.match(/for\(const ([A-Za-z_$][\w$]*) of (\[[^\]\r\n]*\])\)\{/u);
  const control=existing.match(/if\(([A-Za-z_$][\w$]*)\.status!==((?:'[^'\\\r\n]*')|(?:"[^"\\\r\n]*"))\)return/u);
  const calibration=existing.match(/if\(([A-Za-z_$][\w$]*)\.status!==((?:'[^'\\\r\n]*')|(?:"[^"\\\r\n]*"))\|\|!([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\)/u);
  if(!loop||!control||!calibration||calibration[1]!==calibration[3]||calibration[4]!=='assertion_failure')throw refusal('focused_private_plan_guard_invalid');
  const tokens=loop[2].slice(1,-1).split(',');if(tokens.length!==3)throw refusal('focused_private_plan_shape_invalid');
  const variants=tokens.map(privateLiteral),defaultVariant=privateLiteral(defaultMatch[2]);
  const calls=region=>[...region.matchAll(/\brun\(([^()\n]*)\)/gu)].map(match=>match[1].split(','));
  const e=calls(existing),f=calls(focused);
  if(e.length!==6||f.length!==5||[...e,...f].some(args=>args.length<3||args.length>4||args.some(x=>!/^[$A-Za-z_][\w$]*$/u.test(x))))throw refusal('focused_private_plan_calls_invalid');
  const steps=[];
  const add=(args,site,context,requires=[])=>{
    if(!['source','weakened'].includes(args[0])||!['oldTest','test'].includes(args[1])||args[2]!=='loader'||(args[3]!==undefined&&args[3]!==loop[1]))throw refusal('focused_private_plan_selector_invalid');
    const step={step_id:'s'+steps.length,site,loop_context:context,source_selector:args[0],test_selector:args[1],variant:args[3]===undefined?defaultVariant:context,requires};steps.push(step);return step.step_id;
  };
  f.forEach((args,index)=>add(args,index+6,null));
  const controlStep=add(e[0],0,null);
  for(const variant of variants){
    const controlGuard=[{step_id:controlStep,field:'status',equals:privateLiteral(control[2])}];
    const calibrationStep=add(e[1],1,variant,controlGuard);
    const guards=[...controlGuard,{step_id:calibrationStep,field:'status',equals:privateLiteral(calibration[2])},{step_id:calibrationStep,field:calibration[4],equals:true}];
    e.slice(2).forEach((args,index)=>add(args,index+2,variant,guards));
  }
  if(steps.length!==21)throw refusal('focused_private_plan_size_invalid');
  return {version:MN_FOCUSED_CONTROLLER_VERSION,legacy_source_digest:digest(source),default_variant:defaultVariant,source_transform:{kind:'replace_once',needle:privateLiteral(transform[1]),replacement:privateLiteral(transform[2])},steps};
}
export function buildMnFocusedControllerPlanV3({legacySource}){return parseControllerPlan(legacyText(legacySource));}
/** Fabricated text only; never qualifies its plan or observations. */
export function buildMnFocusedControllerPlanForTest({legacySource}){return parseControllerPlan(legacyText(legacySource,true));}
function focusedBindingFields(plan,candidateDigest,normalizedResultDigest,ownerBinding){
  return {probe_version:MN_FOCUSED_CONTROLLER_VERSION,candidate_source_digest:candidateDigest,legacy_source_digest:plan.legacy_source_digest,plan_digest:digest(JSON.stringify(plan)),normalized_result_digest:normalizedResultDigest,owner_binding:ownerBinding};
}
function focusedRequestDigest(step,source,test,loader){
  return digest(JSON.stringify({site:step.site,loop_context:step.loop_context,source_digest:digest(source),test_digest:digest(test),loader_digest:digest(loader),variant:step.variant}));
}
export function buildMnFocusedRequestBindingsV3({plan,source,oldTest,test,loader,normalizedResultDigest,ownerBinding}){
  if(plan?.version!==MN_FOCUSED_CONTROLLER_VERSION||!Array.isArray(plan.steps)||plan.steps.length!==21||[source,oldTest,test,loader,normalizedResultDigest,ownerBinding].some(x=>typeof x!=='string')||plan.source_transform?.kind!=='replace_once'||!/^sha256:[a-f0-9]{64}$/u.test(normalizedResultDigest)||!/^sha256:[a-f0-9]{64}$/u.test(ownerBinding))throw refusal('focused_controller_bindings_invalid');
  const fields=focusedBindingFields(plan,digest(test),normalizedResultDigest,ownerBinding),weakened=source.replace(plan.source_transform.needle,plan.source_transform.replacement);
  const requests=plan.steps.map(step=>{const requestSource=step.source_selector==='source'?source:step.source_selector==='weakened'?weakened:null,requestTest=step.test_selector==='test'?test:step.test_selector==='oldTest'?oldTest:null;if(requestSource===null||requestTest===null)throw refusal('focused_controller_bindings_invalid');return {...step,source:requestSource,test:requestTest,loader,request_digest:focusedRequestDigest(step,requestSource,requestTest,loader)};});
  return {...fields,binding_digest:digest(JSON.stringify(fields)),requests};
}
function focusedClosed(value,fields){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===fields;}
function focusedFiniteResult(value){
  if(!focusedClosed(value,'assertion_failure,authenticated_mixed_boundary,exit_code,observed,requests,status')||!['succeeded','failed','unavailable'].includes(value.status)
    ||[value.observed,value.assertion_failure,value.authenticated_mixed_boundary].some(x=>typeof x!=='boolean')||!Number.isInteger(value.requests)||value.requests<0||value.requests>1000
    ||(value.exit_code!==null&&(!Number.isInteger(value.exit_code)||value.exit_code<0||value.exit_code>255))
    ||value.authenticated_mixed_boundary!==value.observed||value.status==='succeeded'&&value.exit_code!==0||value.status==='failed'&&!(value.exit_code>0))return false;
  return true;
}
function validateFocusedPacket(packet,bindings){
  if(!focusedClosed(packet,'binding_digest,candidate_source_digest,legacy_source_digest,normalized_result_digest,observations,owner_binding,plan_digest,probe_version')||!Array.isArray(packet.observations))throw refusal('focused_controller_packet_invalid');
  for(const field of ['probe_version','candidate_source_digest','legacy_source_digest','plan_digest','normalized_result_digest','owner_binding','binding_digest'])if(packet[field]!==bindings[field])throw refusal('focused_controller_packet_binding_invalid');
  const rows=new Map();let stopped=false;
  for(const row of packet.observations){
    if(!focusedClosed(row,'loop_context,receipt_digest,request_digest,result,site,step_id')||!/^sha256:[a-f0-9]{64}$/u.test(row.receipt_digest)||!focusedFiniteResult(row.result)||rows.has(row.step_id))throw refusal('focused_controller_packet_invalid');rows.set(row.step_id,row);
  }
  let executedIndex=0;
  for(const step of bindings.requests){
    const enabled=!stopped&&step.requires.every(guard=>rows.has(guard.step_id)&&rows.get(guard.step_id).result[guard.field]===guard.equals),row=rows.get(step.step_id);
    if(enabled!==Boolean(row))throw refusal('focused_controller_packet_recipe_invalid');
    if(!row)continue;
    if(packet.observations[executedIndex++]!==row)throw refusal('focused_controller_packet_order_invalid');
    if(row.site!==step.site||row.loop_context!==step.loop_context||row.request_digest!==step.request_digest)throw refusal('focused_controller_packet_binding_invalid');
    if(row.result.status==='unavailable')stopped=true;
  }
  if([...rows.keys()].some(key=>!bindings.requests.some(step=>step.step_id===key)))throw refusal('focused_controller_packet_invalid');
  return packet;
}
export function createMnFocusedControllerPacketV3({bindings,observations}){
  const packet=Object.fromEntries(['probe_version','candidate_source_digest','legacy_source_digest','plan_digest','normalized_result_digest','owner_binding','binding_digest'].map(key=>[key,bindings[key]]));packet.observations=observations;
  validateFocusedPacket(packet,bindings);return JSON.parse(JSON.stringify(packet));
}
export function inspectMnFocusedControllerPacketV3({bindings,packet}){validateFocusedPacket(packet,bindings);return {valid:true,observations:packet.observations.length,authority:false,quality:null};}
function focusedControllerInitialize(c,source,oldTest,test,loader){
  const state=focusedV2Sequences.get(c);if(!state)throw refusal('focused_controller_sequence_inactive');
  try{
    const bindings=buildMnFocusedRequestBindingsV3({plan:FOCUSED_CONTROLLER_PLAN,source,oldTest,test,loader,normalizedResultDigest:c.normalizedResult?.normalized_result_digest,ownerBinding:c.privateNativeProbeBinding});
    const packet=validateFocusedPacket(c.privateFocusedProbe,bindings);state.packet=JSON.parse(JSON.stringify(packet));state.bindings=bindings;state.consumed=new Set();
  }catch{state.stopped=true;}
}
function focusedControllerFinalize(c){
  const state=focusedV2Sequences.get(c);
  try{if(state?.packet&&state.consumed.size!==state.packet.observations.length)throw refusal('focused_controller_observations_unconsumed');}
  finally{focusedV2Sequences.delete(c);}
}
function controllerBodyV3(source,synthetic){
  const plan=parseControllerPlan(source),loop=source.match(/for\(const ([A-Za-z_$][\w$]*) of (\[[^\]\r\n]*\])\)\{/u)[1];
  let body=evaluatorSourceV2(source,synthetic);
  body=body.replace(/^export const nativeProbeVersion=[^\n]*\n/u,'export const nativeProbeVersion='+JSON.stringify(synthetic?'synthetic-focused-controller-v3':MN_FOCUSED_CONTROLLER_VERSION)+';\nconst FOCUSED_CONTROLLER_PLAN='+JSON.stringify(plan)+';\n');
  const header=source.match(/^function run\(([^\n]*)\)\{/mu)[1];
  const helpers=[focusedBindingFields,focusedRequestDigest,buildMnFocusedRequestBindingsV3,focusedClosed,focusedFiniteResult,validateFocusedPacket,focusedControllerInitialize,focusedControllerFinalize].map(fn=>fn.toString().replace(/^export /u,'')).join('\n');
  const bridge=`const MN_FOCUSED_CONTROLLER_VERSION=${JSON.stringify(MN_FOCUSED_CONTROLLER_VERSION)};
const refusal=code=>Object.assign(new Error(code),{code});
${helpers}
const focusedV2Sequences=new WeakMap();
async function run(c,site,loopContext,${header}){
 const state=focusedV2Sequences.get(c);if(!state||state.stopped||!state.bindings)return {status:'unavailable'};
 try{
  const step=state.bindings.requests.find(item=>item.site===site&&item.loop_context===loopContext);
  if(!step||state.consumed.has(step.step_id)||step.request_digest!==focusedRequestDigest({...step,variant:existingBehaviorVariant},source,test,loader))throw Error();
  const row=state.packet.observations.find(item=>item.step_id===step.step_id);if(!row)throw Error();
  state.consumed.add(step.step_id);if(row.result.status==='unavailable')state.stopped=true;return {...row.result};
 }catch{state.stopped=true;return {status:'unavailable'};}
}
`;
  const start=body.indexOf('const focusedV2Sequences='),end=body.indexOf('// Proof of preserved frozen-suite',start);if(start<0||end<0)throw refusal('focused_controller_body_shape_invalid');body=body.slice(0,start)+bridge+body.slice(end);
  const regionStart=body.indexOf('async function existingObservableCoverage('),regionEnd=body.indexOf('export async function evaluateLegacyCandidateSafe(',regionStart);
  let count=0,region=body.slice(regionStart,regionEnd).replace(/await run\(c,([^()\n]*)\)/gu,(_match,args)=>{const site=count++;return 'await run(c,'+site+','+(site>=1&&site<=5?loop:'null')+','+args+')';});
  if(count!==11&&!synthetic)throw refusal('focused_controller_body_shape_invalid');
  region=replaceOnce(region,' const baseline=',' focusedControllerInitialize(c,source,oldTest,test,loader);\n const baseline=');
  region=replaceOnce(region,'}finally{focusedV2Sequences.delete(c); }','}finally{focusedControllerFinalize(c); }');
  body=body.slice(0,regionStart)+region+body.slice(regionEnd);return body;
}
export function buildMnFocusedControllerEvaluatorSourceV3({legacySource,probeVersion}){
  if(probeVersion!==MN_FOCUSED_CONTROLLER_VERSION)throw refusal('focused_controller_explicit_version_required');return controllerBodyV3(legacyText(legacySource),false);
}
export function buildMnFocusedControllerEvaluatorSourceForTest({legacySource}){return controllerBodyV3(legacyText(legacySource,true),true);}
// Filled from the exact private pin by pure transformation, never by execution.
export const MN_FOCUSED_CONTROLLER_BODY_SHA256='4362dbe89544af88f527e1f276bc635e0fabea0a59d2d4467cbc4a8ab8dcd4e7';
export function inspectMnFocusedControllerRouteV3({bodySource}){
  const bytes=Buffer.isBuffer(bodySource)?bodySource:Buffer.from(bodySource??'');if(hash(bytes)!==MN_FOCUSED_CONTROLLER_BODY_SHA256)throw refusal('focused_controller_body_pin_invalid');
  const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes),line=source.split('\n').find(x=>x.startsWith('const FOCUSED_CONTROLLER_PLAN='));if(!line?.endsWith(';'))throw refusal('focused_controller_body_shape_invalid');
  const plan=JSON.parse(line.slice('const FOCUSED_CONTROLLER_PLAN='.length,-1));if(plan.version!==MN_FOCUSED_CONTROLLER_VERSION||plan.legacy_source_digest!=='sha256:'+MN_FOCUSED_LEGACY_BODY_SHA256)throw refusal('focused_controller_body_pin_invalid');
  return {version:MN_FOCUSED_CONTROLLER_VERSION,plan,parentSource:parentLiteral(source).value,body_digest:digest(bytes),authority:false};
}
