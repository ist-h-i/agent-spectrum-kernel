#!/usr/bin/env node
import {readInstructionLoopJson,readInstructionLoopBytes,INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES} from './instruction-loop-artifact.mjs';
// Optional automatic AI port. The current host AI may instead submit the same
// assessment through the CLI, without adding a third human approval gate.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {executeCodexSession} from './codex-exec-runner.mjs';
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
    const prompt='Judge this evaluation irregularity against the practical goal, using available evidence. Prefer useful partial/reference results or exclusion when another run has little value. Retry one trial or the whole case only to repair a failure, missing evidence or an unfair comparison within the given budget. Never optimize selection for a better score. Preserve original outcomes. Process closure and allowed actions are enforced by the runner. Return only JSON {packet_digest,action,reason,selection_basis,retry_scope,used_dimensions,comparison_limits}. used_dimensions and comparison_limits must be arrays of strings, for example used_dimensions:["execution","duration"] and comparison_limits:["quality remains unknown"]. retry_scope is trial or case only for retry, otherwise null. selection_basis is execution_failure, missing_evidence, environment_mismatch, fair_comparison, practical_reference or no_value_in_more_runs.\n'+JSON.stringify({...job.input,packet_digest:canonicalDigest(packet)});
    const r=await executeCodexSession({executable:settings.executable,argv:['exec','--json','--skip-git-repo-check','--sandbox','read-only','-o',final,...(settings.model?['--model',settings.model]:[]),'-'],
      cwd:session,input:prompt,timeoutMs:settings.timeout_ms,terminationScope:'direct_child'});
    assert.ok(r.spawnObserved&&r.terminationConfirmed&&r.exitCode===0&&!r.error&&!r.timedOut&&!r.interrupted&&!r.outputLimited,'assessment incomplete; inspect saved session, do not replay automatically');
    assessment=readJsonFileStrict(final,'AI recovery assessment');
    // A model may express one comparison limit as a scalar. Preserve its text
    // and decision, record the exact shape repair, and leave admission to the
    // runner's unchanged full packet/action/dimension/budget validator.
    if(typeof assessment?.comparison_limits==='string'&&assessment.comparison_limits.trim()&&assessment.comparison_limits.length<=2048){
      const original=assessment;assessment={...original,comparison_limits:[original.comparison_limits]};
      const typed=join(session,'typed-assessment.json'),receipt=join(session,'assessment-shape-repair.json');
      writeCanonicalJsonNoReplace({outputPath:typed,artifact:assessment,label:'typed AI recovery assessment'});
      writeCanonicalJsonNoReplace({outputPath:receipt,artifact:{kind:'ai_recovery_shape_repair_v1',packet_digest:canonicalDigest(packet),
        original_response:{path:final,digest:hash(readStableBytes(final,'original AI recovery answer'))},original_assessment_digest:canonicalDigest(original),
        repaired_response:{path:typed,digest:hash(readStableBytes(typed,'typed AI recovery answer'))},repaired_assessment_digest:canonicalDigest(assessment),
        change:'comparison_limits nonempty string to singleton array; no text or other field changes',additional_model_calls:0},label:'AI recovery shape repair receipt'});
      shapeRepair={path:receipt,digest:hash(readStableBytes(receipt,'AI recovery shape repair receipt'))};
    }
    execution={kind:'codex',duration_ms:r.durationMs??null,usage:null,model_calls:1,usage_status:'not_collected',process_lifetime_scope:'direct_child',...(shapeRepair?{output_shape_repair:shapeRepair}:{})};
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
