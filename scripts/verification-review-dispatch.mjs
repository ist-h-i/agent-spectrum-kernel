// Common installed-ASK review dispatch. Material is read from the bound Git trees,
// supplied only to an explicitly trusted reviewer, and never saved in the result.
import {randomUUID} from 'node:crypto';
import { captureReviewFindings } from './finding-intake.mjs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { canonicalDigest, parseJsonRejectDuplicateKeys, stableCanonicalJson } from './content-addressed-store.mjs';
import { prepareVerificationCompletion } from './verification-reuse-completion.mjs';
import { dependencyInventory, VERIFICATION_SCOPED_REQUIREMENTS_PATH } from './verification-scoped-reuse.mjs';
import { closedObject } from './verification-decision-core.mjs';
const LIMIT=1024*1024, DEADLINE=300000;
const equal=(a,b)=>stableCanonicalJson(a)===stableCanonicalJson(b);
function git(root,args){
  const r=spawnSync('git',['--no-replace-objects','-C',root,...args],{encoding:null,maxBuffer:LIMIT,timeout:10000});
  if(r.error||r.status!==0)throw new Error('git unavailable');return r.stdout;
}
function current(root,revision){
  if(!/^[a-f0-9]{40}$/u.test(revision)||git(root,['rev-parse','HEAD']).toString().trim()!==revision
    ||git(root,['status','--porcelain=v1','--untracked-files=all']).length)throw new Error('target is not clean current HEAD');
  if(git(root,['ls-files','-v','-z']).toString().split('\0').some(x=>/^[a-zS]/u.test(x)))throw new Error('hidden index flags');
}
function inventory(root,revision,review){
  try{
    const entries=dependencyInventory({repositoryRoot:root,revision,selectors:review.surface_selectors.map(s=>({...s,evidence_kind:'file'}))}).entries;
    if(entries.some(e=>e.type!=='blob'||!['100644','100755'].includes(e.mode)))throw new Error('unsupported review surface');return entries;
  }catch(e){if(e.message==='dependency selectors matched no Git inputs')return [];throw e;}
}
function requestFor(options,plan){
  const {repositoryRoot:root,targetRevision}=options, selected=plan.review_request;
  if(selected.status==='blocked_unbounded_or_unknown')throw new Error('unknown review scope');
  const req=parseJsonRejectDuplicateKeys(git(root,['show',`${targetRevision}:${VERIFICATION_SCOPED_REQUIREMENTS_PATH}`]),'requirements');
  const paths=new Set(selected.affected_paths), obligations=new Map(), entries=new Map();
  for(const judgment of selected.required_judgment_refs){
    const match=/^(gate|delta):(.+)$/u.exec(judgment);
    const gate=match&&req.required_gates.find(g=>g.gate_id===match[2]);
    if(!gate?.delta_review)throw new Error('independent judgment has no bounded review scope');
    const before=inventory(root,plan.base_revision,gate.delta_review), after=inventory(root,targetRevision,gate.delta_review);
    const surface=[...new Set([...before,...after].map(e=>e.path))].sort();
    const scope=match[1]==='gate'?surface:surface.filter(p=>paths.has(p));
    if(!scope.length||!gate.delta_review.obligation_refs.length)throw new Error('empty review scope');
    for(const path of scope){
      paths.add(path);entries.set(path,{before:before.find(e=>e.path===path),after:after.find(e=>e.path===path)});
    }
    for(const ref of gate.delta_review.obligation_refs){
      if(!obligations.has(ref))obligations.set(ref,new Set());
      for(const path of scope)obligations.get(ref).add(path);
    }
  }
  if(paths.size>256||obligations.size>256||[...paths].some(p=>!entries.has(p))
    ||selected.obligation_refs.some(ref=>!obligations.has(ref)))throw new Error('uncovered review scope');
  let bytes=0;
  function content(revision,path,entry){
    if(!entry)return null;
    const data=git(root,['show',`${revision}:${path}`]);bytes+=data.length;
    if(bytes>LIMIT||data.includes(0))throw new Error('review material exceeds text bound');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(data);return text;
  }
  const material=[...paths].sort().map(path=>({path,before:content(plan.base_revision,path,entries.get(path).before),after:content(targetRevision,path,entries.get(path).after)}));
  const body={schema_version:'1.0.0',repository_id:plan.repository_id,base_revision:plan.base_revision,target_revision:targetRevision,
    completion_plan_digest:plan.artifact_digest,paths:[...paths].sort(),
    obligations:[...obligations].sort(([a],[b])=>a.localeCompare(b)).map(([ref,values])=>({ref,paths:[...values].sort()})),
    judgment_refs:[...selected.required_judgment_refs],
    prior_review_refs:[...selected.prior_review_refs],prior_finding_refs:[...selected.prior_finding_refs],
    verified_evidence_refs:structuredClone(selected.verified_evidence_refs),prior_review_authority:'baseline_reference_only',material};
  return {...body,request_digest:canonicalDigest(body)};
}
function completeSet(value,expected){
  if(!Array.isArray(value)||value.length!==expected.length||new Set(value).size!==value.length
    ||value.some(v=>!expected.includes(v)))throw new Error('review coverage incomplete');
}
function validateResponse(response,request){
  if(response&&Object.hasOwn(response,'usage'))closedObject(response,['result','usage'],'review response');
  else closedObject(response,['result'],'review response');
  const result=response.result;
  closedObject(result,['request_digest','target_revision','reviewed_paths','reviewed_obligations','judgment_refs','findings','decision'],'review result');
  if(result.request_digest!==request.request_digest||result.target_revision!==request.target_revision)throw new Error('review transplant');
  completeSet(result.reviewed_paths,request.paths);completeSet(result.reviewed_obligations,request.obligations.map(o=>o.ref));completeSet(result.judgment_refs,request.judgment_refs);
  if(!Array.isArray(result.findings)||result.findings.length>32||!['pass','block'].includes(result.decision))throw new Error('invalid review result');
  const seen=new Set();
  for(const finding of result.findings){
    closedObject(finding,['path','obligation_ref','severity'],'finding');
    if(!request.obligations.find(o=>o.ref===finding.obligation_ref)?.paths.includes(finding.path)
      ||!['blocker','major','minor'].includes(finding.severity))throw new Error('finding outside scope');
    const key=`${finding.path}\0${finding.obligation_ref}`;if(seen.has(key))throw new Error('duplicate finding');seen.add(key);
    if(finding.severity!=='minor'&&result.decision!=='block')throw new Error('inconsistent review decision');
  }
  return {result:structuredClone(result),usage:validateUsage(response.usage)};
}
function validateUsage(raw){
  const usage={input_tokens:null,cached_input_tokens:null,output_tokens:null};
  if(raw!==undefined&&raw!==null){
    closedObject(raw,Object.keys(usage),'usage');
    for(const key of Object.keys(usage)){
      const n=raw[key];if(n!==null&&(!Number.isSafeInteger(n)||n<0))throw new Error('invalid usage');usage[key]=n;
    }
    if(usage.cached_input_tokens!==null&&(usage.input_tokens===null||usage.cached_input_tokens>usage.input_tokens))throw new Error('invalid cached usage');
  }
  return usage;
}

export async function dispatchVerificationReview({repositoryRoot,storeRoot,targetRevision,reviewer}){
  const executionId=randomUUID(), started=performance.now(), options={repositoryRoot,storeRoot,targetRevision};
  let request=null, plan=null, calls=0, timer, observedUsage=validateUsage(null);
  const finish=(status,extra={})=>{
    const body={schema_version:'1.0.0',program:'ask_verification_review_dispatch',execution_id:executionId,status,target_revision:typeof targetRevision==='string'&&/^[a-f0-9]{40}$/u.test(targetRevision)?targetRevision:null,
      completion_plan_digest:plan?.artifact_digest??null,request_digest:request?.request_digest??null,
      scope:request?{paths:request.paths,obligations:request.obligations,judgment_refs:request.judgment_refs}:null,
      reviewer_calls:calls,elapsed_ms:Math.max(0,Math.round(performance.now()-started)),usage:observedUsage,
      authorizes_action:false,historical_state_is_current:false,...extra};
    return {...body,artifact_digest:canonicalDigest(body)};
  };
  const controller=new AbortController();
  try{
    current(repositoryRoot,targetRevision);plan=prepareVerificationCompletion(options);
    // A delta review relies on the baseline binding. Changed inputs can require
    // new gate execution, but missing/invalid source evidence is not that case.
    if(plan.dispositions.some(d=>['current_evidence_or_dependency_invalid','source_evidence_conflicting_or_invalid'].includes(d.reason_code)))throw new Error('baseline evidence unavailable');
    if(plan.review_request.status==='not_required'){
      current(repositoryRoot,targetRevision);
      if(!equal(plan,prepareVerificationCompletion(options)))throw new Error('decision inputs changed');
      return finish('not_required');
    }
    request=requestFor(options,plan);
    if(typeof reviewer!=='function')return finish('blocked',{reason_code:'reviewer_unavailable'});
    current(repositoryRoot,targetRevision);
    if(!equal(plan,prepareVerificationCompletion(options)))throw new Error('decision inputs changed before dispatch');
    const pending=Promise.resolve().then(()=>{calls++;return reviewer(Object.freeze(structuredClone(request)),{signal:controller.signal});});
    const response=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('deadline'));},DEADLINE);})]);
    // Consumed work remains accounted for even if the review or target is later
    // rejected. Invalid telemetry is never converted into zero.
    observedUsage=validateUsage(response?.usage);
    const checked=validateResponse(response,request);
    current(repositoryRoot,targetRevision);
    const confirmed=prepareVerificationCompletion(options);
    if(!equal(plan,confirmed)||!equal(request,requestFor(options,confirmed))||performance.now()-started>DEADLINE)throw new Error('decision inputs changed');
    let finding_capture;
    try{finding_capture=captureReviewFindings(repositoryRoot,checked.result,executionId);}
    catch{finding_capture={status:'failed',reason_code:'finding_capture_failed',events:[]};}
    // Persistence failures must be visible without discarding or rerunning a valid review.
    return finish('reviewed',{...checked,finding_capture});
  }catch{
    return finish('blocked',{reason_code:'review_scope_state_or_response_invalid'});
  }finally{clearTimeout(timer);controller.abort();}
}
