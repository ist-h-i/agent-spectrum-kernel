#!/usr/bin/env node
// Reference worker for caller-owned public tasks/checks. No private ASK grader
// or built-in quality score is needed. Model/provider adapters can also implement
// the same durable trial/inspect protocol using their own closure receipts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync,openSync,closeSync,lstatSync,chmodSync,readdirSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace } from './content-addressed-store.mjs';
import { instructionPath } from './instruction-projection-paths.mjs';
import { instructionBytesDigest as hash } from './instruction-environment.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';

function providerObservation(receipt,controlRoot){
 const o=receipt.observation;if(o===undefined)return null;
 assert.equal(o.kind,'provider_observation_v1');assert.ok(typeof o.scope==='string'&&o.scope.length<=256);
 assert.ok(o.metrics&&typeof o.metrics==='object');const invalid_fields=[];
 const metrics=Object.fromEntries(['input_tokens','output_tokens','cached_tokens'].map(k=>{
  const v=o.metrics[k];if(v!==null&&v!==undefined&&(!Number.isSafeInteger(v)||v<0))invalid_fields.push(k);
  return [k,Number.isSafeInteger(v)&&v>=0?v:null];
 }));
 if(metrics.cached_tokens!==null&&metrics.input_tokens!==null&&metrics.cached_tokens>metrics.input_tokens){metrics.cached_tokens=null;invalid_fields.push('cached_tokens');}
 assert.ok(Array.isArray(o.artifacts)&&o.artifacts.length<=16);
 for(const a of o.artifacts){instructionPath(a.path);assert.equal(hash(readStableFile(join(controlRoot,a.path),'provider observation artifact',10*1024*1024).bytes),a.digest,'provider observation artifact changed');}
 return {...o,metrics,invalid_fields};
}

function instructionDiscovery(root){
  const inventory=[];let count=0,complete=true;
  const walk=(relative='')=>{
    let entries;try{entries=readdirSync(join(root,relative),{withFileTypes:true});}catch{complete=false;return;}
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
      if(++count>20000){complete=false;return;}
      if(['.git','node_modules','.tmp'].includes(entry.name))continue;
      const path=relative?relative+'/'+entry.name:entry.name;
      if(/^(?:\.agents\/(?:runs|worktrees)|\.claude\/(?:projects|debug))(?:\/|$)/u.test(path))continue;
      const instruction=/^(?:\.agents\/(?:skills|prompts|commands)|\.claude\/(?:skills|commands|agents))(?:\/|$)/u.test(path)
        ||/^(?:\.agents|\.claude)\/settings(?:\.local)?\.json$/u.test(path)||/^(?:AGENTS|CLAUDE)\.md$/iu.test(entry.name);
      if(entry.isSymbolicLink()){if(instruction||['.agents','.claude'].includes(path))inventory.push({path,symlink:true});continue;}
      if(entry.isDirectory())walk(path);
      else if(instruction&&entry.isFile()){
        try{inventory.push({path,digest:hash(readStableBytes(join(root,path),'local instruction discovery')),mode:lstatSync(join(root,path)).mode&0o777});}
        catch{complete=false;inventory.push({path,unavailable:true});}
      }
      if(!complete&&count>20000)return;
    }
  };
  walk();return {inventory,complete};
}

async function command(definition,workspace,label,job,frozenFiles=[]){
  assert.ok(Object.keys(definition).every(k=>['argv','pins','timeout_ms','model_calls','model_terminal_contract','provider_closure_path'].includes(k)),'unsupported command option; use a pinned adapter for additional execution policy');
  assert.ok(Array.isArray(definition.argv)&&definition.argv.length&&definition.argv.every(v=>typeof v==='string'&&!v.includes('\0')));
  assert.equal(resolve(definition.argv[0]),definition.argv[0]);
  assert.ok(Array.isArray(definition.pins)&&definition.pins.length);
  for(const pin of definition.pins){
    assert.equal(hash(readStableBytes(pin.path,'practical command pin')),pin.digest,'practical command drift');
    // A pinned source may also be copied into the editable task workspace.
    // Verify that actual executable criterion, not just its untouched source.
    for(const file of frozenFiles.filter(file=>resolve(file.source)===resolve(pin.path))){
      const path=join(workspace,file.target);
      assert.equal(hash(readStableBytes(path,'workspace command pin')),pin.digest,'workspace command pin drift');
      assert.equal(lstatSync(path).mode&0o777,file.mode??0o600,'workspace command pin mode drift');
    }
  }
  if(definition.model_calls)assert.equal(process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED,'1','model calls are not authorized');
  assert.ok(definition.model_calls===undefined||typeof definition.model_calls==='boolean');
  if(definition.model_terminal_contract!==undefined)assert.equal(definition.model_terminal_contract,'synchronous_cli_completion');
  const providerPath=definition.provider_closure_path?.replaceAll('{evaluation_command_role}',label);
  if(providerPath){instructionPath(providerPath);assert.ok(!existsSync(join(dirname(workspace),providerPath)),'provider closure destination must be fresh for each command invocation');}
  assert.ok(Number.isSafeInteger(definition.timeout_ms)&&definition.timeout_ms>0&&definition.timeout_ms<=24*60*60*1000);
  const stdout=openSync(join(dirname(workspace),label+'.stdout.log'),'wx',0o600),stderr=openSync(join(dirname(workspace),label+'.stderr.log'),'wx',0o600);
  const started=Date.now();let child,closed;
  try{
    writeCanonicalJsonNoReplace({outputPath:join(dirname(workspace),label+'-started.json'),artifact:{command_digest:canonicalDigest(definition)},label:'practical command dispatch'});
    const invocation=canonicalDigest({request_digest:canonicalDigest(job),command_digest:canonicalDigest(definition),role:label});
    const values={evaluation_request_digest:canonicalDigest(job),evaluation_command_digest:canonicalDigest(definition),evaluation_control_root:dirname(workspace),evaluation_command_role:label,evaluation_invocation_digest:invocation};
    const argv=definition.argv.map(v=>v.replace(/\{(evaluation_request_digest|evaluation_command_digest|evaluation_control_root|evaluation_command_role|evaluation_invocation_digest)\}/gu,(_,key)=>values[key]));
    child=spawn(argv[0],argv.slice(1),{cwd:workspace,shell:false,detached:process.platform!=='win32',stdio:['ignore',stdout,stderr]});
    let timedOut=false,killTimer;
    const timer=setTimeout(()=>{timedOut=true;try{if(process.platform!=='win32')process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM');}catch{}
      killTimer=setTimeout(()=>{try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}},2000);},definition.timeout_ms);
    try{closed=await new Promise((done,fail)=>{child.once('error',fail);child.once('close',(exit_code,signal)=>done({exit_code,signal}));});}
    finally{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);}
    let groupClosed=false;
    if(process.platform!=='win32')try{process.kill(-child.pid,0);}catch(error){if(error.code==='ESRCH')groupClosed=true;}
    let providerClosed=!definition.model_calls;
    if(definition.model_calls&&definition.model_terminal_contract==='synchronous_cli_completion'&&closed.exit_code===0&&!closed.signal&&!timedOut)providerClosed=true;
    let providerEvidenceError=null,observation=null,observationIssue=null,observationReason=null;
    if(providerPath){
      const path=join(dirname(workspace),providerPath);
      if(existsSync(path))try{const receipt=readJsonFileStrict(path,'provider closure receipt');
        assert.equal(receipt.request_digest,canonicalDigest(job));assert.equal(receipt.command_digest,canonicalDigest(definition));
        assert.equal(receipt.invocation_digest,invocation);assert.ok(typeof receipt.terminal==='boolean');
        assert.ok(typeof receipt.provider_ref==='string'&&receipt.provider_ref.trim());providerClosed=receipt.terminal;
        if(!providerClosed)providerEvidenceError='provider_completion_not_confirmed';
        try{observation=providerObservation(receipt,dirname(workspace));}catch(error){observationIssue='provider_observation_invalid_or_unavailable';observationReason=String(error.message).slice(0,512);}
      }catch{providerClosed=false;providerEvidenceError='provider_receipt_invalid_or_unavailable';observationIssue=providerEvidenceError;}
      else{providerClosed=false;providerEvidenceError='provider_receipt_missing';observationIssue=providerEvidenceError;}
    }
    const result={...closed,timed_out:timedOut,duration_ms:Date.now()-started,process_group_closed:groupClosed,
      provider_terminal_confirmed:definition.model_calls?providerClosed:null,ready_for_next_root:groupClosed&&providerClosed,
      provider_evidence_error:providerEvidenceError,
      provider_observation:observation,provider_observation_issue:observationIssue,provider_observation_reason:observationReason,
      closure_scope:'local_owned_process_group_only; remote provider work is not inferred',stdout_ref:label+'.stdout.log',stderr_ref:label+'.stderr.log'};
    writeCanonicalJsonNoReplace({outputPath:join(dirname(workspace),label+'-completion.json'),artifact:result,label:'practical command closure'});
    return result;
  }finally{closeSync(stdout);closeSync(stderr);}
}
export async function executePracticalEvaluationWorker(settings,job,resultPath){
  const row=job.input.row,spec=settings.cases[row.case_id],condition=settings.conditions[row.condition];
  assert.ok(spec&&condition,'unknown local case or condition');
  assert.equal(canonicalDigest(spec.files.map(({target,digest})=>({target,digest}))),row.public_input_digest,'public task differs from approved case');
  const workspace=join(dirname(resultPath),'workspace');assert.ok(!existsSync(workspace),'fresh attempt workspace required');
  if(settings.observation_path)instructionPath(settings.observation_path);
  const files=[...spec.files,...(condition.files??[])],seen=new Set();
  // Validate every source/path before allocating the owned workspace.
  const frozen=files.map(f=>{instructionPath(f.target);assert.ok(!seen.has(f.target.toLowerCase()),'workspace file collision');seen.add(f.target.toLowerCase());
    const bytes=readStableBytes(f.source,'explicit local evaluation file');assert.equal(hash(bytes),f.digest,'local evaluation input drift');
    if(f.mode!==undefined){assert.ok(Number.isSafeInteger(f.mode)&&f.mode>=0&&f.mode<=0o777);assert.equal(lstatSync(f.source).mode&0o777,f.mode,'local evaluation input mode drift');}
    return {...f,bytes};});
  assert.ok(!frozen.some(a=>frozen.some(b=>b.target.startsWith(a.target+'/'))),'workspace file/directory collision');
  mkdirSync(workspace,{mode:0o700});
  for(const f of frozen){const path=join(workspace,f.target);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,f.bytes,{flag:'wx',mode:f.mode??0o600});if(f.mode!==undefined)chmodSync(path,f.mode);}
  const discoveryBefore=instructionDiscovery(workspace);
  const task=await command(condition.command,workspace,'task',job,frozen);
  let grade=null;
  if(task.ready_for_next_root&&task.exit_code===0&&!task.timed_out&&spec.grader)grade=await command(spec.grader,workspace,'grade',job,frozen);
  const closed=task.ready_for_next_root&&(!grade||grade.ready_for_next_root);
  const executed=(task.exit_code===0||condition.command_role==='check'&&task.exit_code===1)&&!task.timed_out&&!task.signal;
  const check=grade??(condition.command_role==='check'?task:null);
  const outcome=executed&&check&&!check.timed_out&&!check.signal&&[0,1].includes(check.exit_code)?(check.exit_code===0?'pass':'fail'):'unknown';
  let workspaceObservation=null,workspaceObservationIssue=null;
  if(!task.provider_observation&&!task.provider_observation_issue&&settings.observation_path&&existsSync(join(workspace,settings.observation_path))){
    try{workspaceObservation=readJsonFileStrict(join(workspace,instructionPath(settings.observation_path)));}
    catch{workspaceObservationIssue='caller_workspace_observation_invalid_or_unavailable';}
  }
  const observation=task.provider_observation?.metrics??(task.provider_observation_issue?null:workspaceObservation);
  const contextIntact=(condition.files??[]).every(f=>{try{return hash(readStableBytes(join(workspace,f.target),'post-trial instruction'))===f.digest
    &&(lstatSync(join(workspace,f.target)).mode&0o777)===(f.mode??0o600);}catch{return false;}});
  const discoveryAfter=instructionDiscovery(workspace),discoveryChanged=canonicalDigest(discoveryBefore.inventory)!==canonicalDigest(discoveryAfter.inventory);
  return {request_digest:canonicalDigest(job),status:executed?'completed':'failed',output:{ready_for_next_root:closed,execution_completed:executed,
    context_integrity:!contextIntact||discoveryChanged?'changed':discoveryBefore.complete&&discoveryAfter.complete?'preserved':'unverified',
    context_integrity_scope:'Declared condition files bytes/modes and bounded AGENTS/CLAUDE plus .agents/.claude instruction/settings inventory; runtime logs, .git/node_modules/.tmp and ambient/global inputs excluded.',
    grading_execution_state:grade?'completed':'not_started',
    evidence_root:dirname(resultPath),workspace_observation_issue:workspaceObservationIssue,metrics_source:task.provider_observation?'provider_closure_receipt':task.provider_observation_issue?'provider_observation_unusable':workspaceObservation?'caller_workspace_observation':workspaceObservationIssue?'caller_workspace_observation_unusable':'not_collected',
    cli_seconds:task.duration_ms/1000,root_usage:task.provider_observation?{input_tokens:observation.input_tokens,output_tokens:observation.output_tokens,cached_input_tokens:observation.cached_tokens}:null,task,grade,
    notes:{outcome,evidence_refs:[task.stdout_ref,task.stderr_ref,...(task.provider_observation?.artifacts??[]).map(a=>a.path),...(grade?[grade.stdout_ref,grade.stderr_ref,...(grade.provider_observation?.artifacts??[]).map(a=>a.path)]:[])],
      metrics:{duration_ms:task.duration_ms,human_review_minutes:null,rework_minutes:null,
        input_tokens:observation?.input_tokens??null,output_tokens:observation?.output_tokens??null,cached_tokens:observation?.cached_tokens??null}}}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [settingsPath,settingsDigest,action,requestPath,resultPath]=process.argv.slice(2);
  try{
    assert.equal(hash(readStableBytes(settingsPath,'practical worker settings')),settingsDigest);
    const job=readJsonFileStrict(requestPath),receipt=join(dirname(resultPath),'local-completion.json');
    if(action==='inspect'){
      if(existsSync(receipt)){const result=readJsonFileStrict(receipt);assert.equal(result.request_digest,canonicalDigest(job));
        writeCanonicalJsonNoReplace({outputPath:resultPath,artifact:result,label:'recovered practical worker result'});}
    }else{
      assert.equal(action,'execute');const result=await executePracticalEvaluationWorker(readJsonFileStrict(settingsPath),job,resultPath);
      writeCanonicalJsonNoReplace({outputPath:receipt,artifact:result,label:'practical command completion'});
      writeCanonicalJsonNoReplace({outputPath:resultPath,artifact:result,label:'practical worker result'});
    }
  }catch(error){
    // A pre-dispatch failure has positive local evidence of no command start.
    // Otherwise retain uncertainty; never infer closure from a worker exit.
    try{const job=readJsonFileStrict(requestPath),directory=dirname(resultPath),noStart=!existsSync(join(directory,'task-started.json'));
      const task=existsSync(join(directory,'task-completion.json'))?readJsonFileStrict(join(directory,'task-completion.json')):null;
      const gradeStarted=existsSync(join(directory,'grade-started.json')),grade=existsSync(join(directory,'grade-completion.json'))?readJsonFileStrict(join(directory,'grade-completion.json')):null;
      const closed=noStart||task?.ready_for_next_root===true&&(!gradeStarted||grade?.ready_for_next_root===true);
      const result={request_digest:canonicalDigest(job),status:'failed',output:{ready_for_next_root:closed,
        execution_completed:task?.exit_code===0&&!task?.signal&&!task?.timed_out,cli_seconds:task?task.duration_ms/1000:null,
        task,grade,context_integrity:'unverified',
        grading_execution_state:grade?'completed':gradeStarted?'unknown':'not_started',
        notes:{outcome:'unknown',evidence_refs:task?[task.stdout_ref,task.stderr_ref]:[],metrics:{duration_ms:task?.duration_ms??null}},
        failure_kind:noStart?'pre_dispatch_failure':closed?'closed_execution_with_harness_failure':'worker_or_command_uncertain',reason:String(error.message).slice(0,2048)}};
      writeCanonicalJsonNoReplace({outputPath:join(directory,'local-completion.json'),artifact:result,label:'practical failure receipt'});
      writeCanonicalJsonNoReplace({outputPath:resultPath,artifact:result,label:'practical failure result'});
    }catch{/* Preserve existing/partial evidence without replacing it. */}
    console.error(String(error.message));process.exitCode=1;
  }
}
