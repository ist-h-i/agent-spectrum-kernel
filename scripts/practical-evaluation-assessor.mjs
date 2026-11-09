#!/usr/bin/env node
import {readInstructionLoopJson,readInstructionLoopBytes,INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES} from './instruction-loop-artifact.mjs';
// Optional automatic AI port. The current host AI may instead submit the same
// assessment through the CLI, without adding a third human approval gate.
import assert from 'node:assert/strict';
import {mkdirSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalDigest,readStableBytes,writeCanonicalJsonNoReplace,parseJsonRejectDuplicateKeys,DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {executeCodexSession} from './codex-exec-runner.mjs';
import {validateInstructionRecoveryContext} from './instruction-evaluation-recovery.mjs';
function retainExecutionObservation({session,settings,job,prompt,response:r}){
  const artifacts=[];
  function retain(path,bytes){const fd=openSync(join(session,path),'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}artifacts.push({path,digest:hash(bytes)});}
  for(const [path,data]of [['stdout.jsonl',r.stdout??Buffer.alloc(0)],['stderr.log',r.stderr??Buffer.alloc(0)]]){
    retain(path,Buffer.from(data));
  }
  const final=join(session,'answer.json');let answerIssue=null,answerBytes=null;
  if(existsSync(final))try{answerBytes=readStableBytes(final,'retained AI recovery answer',INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES);retain('captured-answer.json',answerBytes);}
  catch(error){answerIssue=String(error.message).slice(0,2048);}
  const clean=r.spawnObserved===true&&r.terminationConfirmed===true&&r.exitCode===0&&!r.error&&!r.timedOut&&!r.interrupted&&!r.outputLimited;
  const noSpawn=r.spawnObserved===false&&r.terminationConfirmed===true;
  const path=join(session,'execution-observation.json');
  writeCanonicalJsonNoReplace({outputPath:path,artifact:{kind:'practical_assessor_execution_observation_v1',request_digest:canonicalDigest(job),
    settings_digest:canonicalDigest(settings),prompt_digest:hash(Buffer.from(prompt)),
    local:{spawn_observed:r.spawnObserved??null,termination_confirmed:r.terminationConfirmed??null,pid:r.pid??null,exit_code:r.exitCode??null,signal:r.signal??null,
      error:r.error??null,cleanup_error:r.cleanupError??null,timed_out:r.timedOut??null,interrupted:r.interrupted??null,output_limited:r.outputLimited??null},
    duration_ms:r.durationMs??null,provider_terminal_confirmed:clean||noSpawn?true:null,
    closure_scope:clean?'synchronous_cli_completion':noSpawn?'positive_local_no_spawn':'unconfirmed',
    model_calls:null,model_calls_status:'not_observed',usage:null,usage_status:'not_collected',replay_authorized:false,
    artifacts,answer_observation_issue:answerIssue},label:'AI recovery execution observation'});
  return {reference:{path,digest:hash(readStableBytes(path,'AI recovery execution observation'))},answerBytes,answerIssue};
}
export function buildPracticalEvaluationAssessmentPrompt(job){
  const {packet,goal,...current}=job.input;
  if(current.current_context!==undefined)validateInstructionRecoveryContext(current.current_context,{packet,evaluation_decision:current.evaluation_decision});
  return 'grading_diagnostics are unconfirmed caller-reported item states and incidents, never fixed points, passes or independent agreement. Preserve these as partial references; do not repeat a Task merely to complete a grading structure.\n'+
    'Judge this evaluation irregularity against the practical goal, using available evidence. Prefer useful partial/reference results or exclusion when another run has little value. Retry one trial or the whole case only to repair a failure, missing evidence or an unfair comparison within the given budget. Never optimize selection for a better score. Preserve original outcomes. Process closure and allowed actions are enforced by the runner. Return only JSON {packet_digest,action,reason,selection_basis,retry_scope,used_dimensions,comparison_limits}. used_dimensions and comparison_limits must be arrays of strings, for example used_dimensions:["execution","duration"] and comparison_limits:["quality remains unknown"]. retry_scope is trial or case only for retry, otherwise null. selection_basis is execution_failure, missing_evidence, environment_mismatch, fair_comparison, practical_reference or no_value_in_more_runs.\n'+
    'Current stage is evaluation recovery, not candidate authoring. evaluation_decision, when supplied, is the persisted human case decision; this context does not grant execution or application authority and cannot widen the packet actions or budgets. improvement_context preserves the plan objective, which can include earlier authoring-stage instructions and previous-cycle evidence: use its practical objective, but do not apply earlier stage restrictions to this stage, and previous-run observations are not facts about the current attempt. Base current-state claims on the current packet and its evidence. Missing current evidence remains unknown.\n'+
    'current_context, when present, is the runner snapshot for this assessment: use its current approval and remaining budgets, including queued peer retries. Assessment packet slots are not measured physical model calls. A missing context in an older job is Unknown, not a new permission. Earlier preparation prohibitions remain historical; only the persisted approval and enforced packet constrain this stage.\n'+
    JSON.stringify({...current,packet,packet_digest:canonicalDigest(packet),improvement_context:goal??null});
}
export async function assessPracticalEvaluation(settings,job,resultPath){
  assert.equal(job.kind,'assess');const packet=job.input.packet;let assessment,shapeRepair=null,execution={kind:'model_free_fixture',duration_ms:null,usage:null,model_calls:0};
  if(settings.kind==='fixture')assessment={...settings.assessment,packet_digest:canonicalDigest(packet)};
  else{
    assert.equal(settings.kind,'codex');assert.equal(process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED,'1','AI recovery model call not authorized');
    if(settings.executableDigest!==undefined){
      assert.equal(resolve(settings.executable),settings.executable,'absolute pinned recovery executable required');
      assert.match(settings.executableDigest,/^sha256:[a-f0-9]{64}$/u);
      assert.equal(hash(readStableBytes(settings.executable,'pinned recovery executable',16*1024*1024)),settings.executableDigest,'recovery executable drift');
    }
    const session=join(dirname(resultPath),'assessment-session');mkdirSync(session,{mode:0o700});
    const final=join(session,'answer.json');
    const prompt=buildPracticalEvaluationAssessmentPrompt(job);
    let r;
    try{r=await executeCodexSession({executable:settings.executable,argv:['exec','--json','--skip-git-repo-check','--sandbox','read-only','-o',final,...(settings.model?['--model',settings.model]:[]),'-'],
      cwd:session,input:prompt,timeoutMs:settings.timeout_ms,terminationScope:'direct_child'});}
    catch(error){r={error:{message:String(error.message).slice(0,2048)},spawnObserved:null,terminationConfirmed:null};}
    // Save what the bounded executor actually observed before any success or
    // response-shape assertion. Failure diagnostics do not prove remote closure.
    const captured=retainExecutionObservation({session,settings,job,prompt,response:r}),executionObservation=captured.reference;
    assert.ok(r.spawnObserved&&r.terminationConfirmed&&r.exitCode===0&&!r.error&&!r.timedOut&&!r.interrupted&&!r.outputLimited,'assessment incomplete; inspect saved session, do not replay automatically');
    assert.ok(captured.answerBytes!==null&&!captured.answerIssue,'AI recovery answer was not captured: '+(captured.answerIssue??'missing answer'));
    assert.ok(captured.answerBytes.length<=DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES,'AI recovery assessment exceeds the byte limit');
    assessment=parseJsonRejectDuplicateKeys(captured.answerBytes,'AI recovery assessment');
    // A model may express one comparison limit as a scalar. Preserve its text
    // and decision, record the exact shape repair, and leave admission to the
    // runner's unchanged full packet/action/dimension/budget validator.
    if(typeof assessment?.comparison_limits==='string'&&assessment.comparison_limits.trim()&&assessment.comparison_limits.length<=2048){
      const original=assessment;assessment={...original,comparison_limits:[original.comparison_limits]};
      const typed=join(session,'typed-assessment.json'),receipt=join(session,'assessment-shape-repair.json');
      writeCanonicalJsonNoReplace({outputPath:typed,artifact:assessment,label:'typed AI recovery assessment'});
      writeCanonicalJsonNoReplace({outputPath:receipt,artifact:{kind:'ai_recovery_shape_repair_v1',packet_digest:canonicalDigest(packet),
        original_response:{path:join(session,'captured-answer.json'),digest:hash(captured.answerBytes)},original_assessment_digest:canonicalDigest(original),
        repaired_response:{path:typed,digest:hash(readStableBytes(typed,'typed AI recovery answer'))},repaired_assessment_digest:canonicalDigest(assessment),
        change:'comparison_limits nonempty string to singleton array; no text or other field changes',additional_model_calls:0},label:'AI recovery shape repair receipt'});
      shapeRepair={path:receipt,digest:hash(readStableBytes(receipt,'AI recovery shape repair receipt'))};
    }
    execution={kind:'codex',duration_ms:r.durationMs??null,usage:null,model_calls:1,usage_status:'not_collected',process_lifetime_scope:'direct_child',execution_observation:executionObservation,...(shapeRepair?{output_shape_repair:shapeRepair}:{})};
  }
  return {request_digest:canonicalDigest(job),status:'completed',output:{assessment,
    assessment_execution:execution,assessment_usage_not_trial_usage:true,ambient_context:'Unknown',formal_admission_implied:false}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [settingsPath,settingsDigest,requestPath,resultPath]=process.argv.slice(2);
  try{assert.equal(hash(readInstructionLoopBytes(settingsPath,'recovery provider settings')),settingsDigest);
    const result=await assessPracticalEvaluation(readInstructionLoopJson(settingsPath),readInstructionLoopJson(requestPath),resultPath);
    writeCanonicalJsonNoReplace({outputPath:resultPath,artifact:result,label:'AI evaluation recovery result',maximumBytes:INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES});
  }catch(error){console.error(String(error.message));process.exitCode=1;}
}
