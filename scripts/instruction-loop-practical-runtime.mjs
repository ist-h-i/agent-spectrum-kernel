import {readInstructionLoopJson} from './instruction-loop-artifact.mjs';
// Existing Full generation/Registry/normal-owner lifecycle, with the practical
// Eval engine in place of a private fixed-catalog grading dependency.
import assert from 'node:assert/strict';
import {inspectInstructionLoopProviderSelection} from './instruction-loop-provider-policy.mjs';
import {createCodexPracticalCommand,validatePracticalModelConditions} from './practical-codex-adapter.mjs';
import {existsSync,mkdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash,verifyInstructionEnvironment,instructionEnvironmentTrustOptions} from './instruction-environment.mjs';
import {executeNativeInstructionLoopStage} from './instruction-loop-native-host.mjs';
import {fullInstructionInventory,compareFullInstructionContext} from './instruction-loop-full-candidate.mjs';
import {selectInstructionLoopCases} from './instruction-loop-case-selection.mjs';
import {projectInstructionLoopObservation} from './instruction-loop-feedback.mjs';
import {createPracticalEvaluationCommandRuntime} from './instruction-loop-command-runtime.mjs';
import {advancePracticalEvaluation,inspectPracticalEvaluation} from './practical-evaluation-runner.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';

const stages=['generate','register','select','plan','apply','version','cleanup','restore'];
const sourceNames=['practical-grade-supplement.mjs','practical-grade-source-binding.mjs','instruction-loop-host-scoring.mjs','instruction-loop-reference-scoring-runtime.mjs','instruction-loop-artifact.mjs','instruction-loop-fixed-scoring.mjs','instruction-loop-fixed-scoring.py','instruction-loop-provider-policy.mjs','instruction-loop-practical-runtime.mjs','instruction-loop-native-host.mjs','instruction-loop-full-candidate.mjs','instruction-loop-retained-authoring.mjs','ask-benchmark-stable-file.mjs','ask-benchmark-atomic-publication.mjs','practical-codex-adapter.mjs','ask-user-comparison.mjs',
  'instruction-loop-feedback.mjs','ask-personal-evolution-observation.mjs','instruction-loop-case-selection.mjs','instruction-loop-normal-owner-worker.mjs',
  'instruction-loop-assets.mjs','instruction-loop-source-binding.mjs','instruction-environment.mjs','instruction-environment-compiler.mjs',
  'practical-evaluation-runner.mjs','practical-quality-observation.mjs','practical-evaluation-worker.mjs','practical-evaluation-assessor.mjs','instruction-evaluation-recovery.mjs',
  'instruction-loop-command-runtime.mjs','instruction-run-journal.mjs','ask-pragmatic-evaluation-report.mjs','content-addressed-store.mjs','asset-registry.mjs','codex-exec-runner.mjs'];
const pin=path=>({path,digest:hash(readStableBytes(path,'practical runtime input',16*1024*1024))});
function validateProfilePaths(p){
  inspectInstructionLoopProviderSelection(p);
  validatePracticalModelConditions(p);
  instructionEnvironmentTrustOptions(p.practical.environmentTrust);
  const evaluation=resolve(p.practical.root);assert.equal(evaluation,p.practical.root,'absolute evaluation root required');
  assertNoSymlinkPathSegments(evaluation,'practical evaluation root',{allowMissingLeaf:true});
  for(const path of [p.storeRoot,p.stateRoot,p.practical.baselineRoot,p.generator.baselineSourceRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot,
    ...(p.normal.target===null?[]:[p.normal.target])]){
    assert.equal(resolve(path),path,'absolute host source/owner root required');
    assert.ok(evaluation!==path&&!evaluation.startsWith(path+'/')&&!path.startsWith(evaluation+'/'),'evaluation root overlaps source, Registry, lifecycle state or owner');
  }
  assert.ok(p.protectedRoot!==evaluation&&!p.protectedRoot.startsWith(evaluation+'/'),'evaluation root must not contain the protected host root');
}
export function createFullPracticalInstructionLoopConfiguration(profilePath){
  profilePath=resolve(profilePath);const p=readJsonFileStrict(profilePath,'Full practical profile',16*1024*1024);
  assert.equal(p.kind,'full_practical_instruction_loop_profile_v1');assert.equal(p.policy.evaluation_mode,'practical_v1');
  assert.equal(p.normal.target,p.policy.normal_target);
  validateProfilePaths(p);
  const runtime={kind:'full_practical_instruction_loop_runtime_v1',profile_path:profilePath,profile_digest:pin(profilePath).digest,
    source_pins:sourceNames.map(name=>pin(join(import.meta.dirname,name)))};
  return {policy:{...p.policy,runtime_digest:canonicalDigest(runtime)},runtime};
}
function checkedProfile(definition){
  assert.equal(definition.kind,'full_practical_instruction_loop_runtime_v1');
  for(const item of [...definition.source_pins,{path:definition.profile_path,digest:definition.profile_digest}])assert.equal(pin(item.path).digest,item.digest,'practical runtime source/profile drift');
  const p=readJsonFileStrict(definition.profile_path,'Full practical profile',16*1024*1024);validateProfilePaths(p);return p;
}
function save(path,value){writeCanonicalJsonNoReplace({outputPath:path,artifact:value,label:'Full practical lifecycle result',maximumBytes:16*1024*1024});}
function selectionPath(p){return join(p.stateRoot,'practical-selection.json');}
export function prepareFullPracticalInstructionSelection(p,job){
  const fairness=p.kind==='full_practical_instruction_loop_profile_v1'?compareFullInstructionContext({baselineRoot:p.practical.baselineRoot,candidateRoot:job.input.candidate.full_root,skills:p.generator.skills}):
    {comparison:'complete_declared_component_environments',ambient_context:'Unknown',per_asset_causality_implied:false};
  const feedback=projectInstructionLoopObservation(job.input.observation);
  const selected=selectInstructionLoopCases({...p.selection,catalog:job.input.catalog,changedTags:[...new Set([...(p.selection.changedTags??[]),...feedback.tags])]});
  const environments={baseline:{root:p.practical.baselineRoot,digest:p.baselineEnvironmentObjectDigest},candidate:{root:job.input.candidate.full_root,digest:job.input.candidate.environment_object_digest}};
  const conditions=Object.entries(environments).map(([id,source])=>{
    const {environment,files}=verifyInstructionEnvironment({storeRoot:p.storeRoot,environmentObjectDigest:source.digest,
      trustedAssetAuthorityContexts:p.generator?.trustedAuthorityContexts??p.environmentTrust?.trustedAssetAuthorityContexts??[],...instructionEnvironmentTrustOptions(p.practical.environmentTrust),...instructionEnvironmentTrustOptions(p.environmentTrust)});
    const inventory=fullInstructionInventory(source.root);
    assert.equal(canonicalDigest(inventory.map(f=>({path:f.path,raw_digest:f.sha256}))),canonicalDigest(files.map(f=>({path:f.path,raw_digest:f.raw_digest}))),'practical source projection drift');
    const configured=p.practical.conditions[id];assert.ok(configured,'both practical conditions required');
    return {id,context:{...configured.context,environment_ref:source.digest,projection_inventory_digest:canonicalDigest(inventory)},
      files:inventory.map(f=>({source:join(source.root,f.path),target:f.path,digest:f.sha256,mode:f.mode})),
      command:configured.codex?createCodexPracticalCommand({settingsPath:join(p.stateRoot,'codex-'+id+'-settings.json'),options:configured.codex,evidenceKind:p.practical.evidence_kind}):configured.command,
      command_role:configured.codex?'task':configured.command_role??'task',environment_id:environment.environment_id};
  });
  const cases=selected.case_ids.map(id=>{const spec=p.practical.cases.find(c=>c.id===id),catalog=job.input.catalog.find(c=>c.id===id);assert.ok(spec,'selected case missing public local configuration');
    assert.equal(canonicalDigest(spec.files.map(({target,digest})=>({target,digest}))),catalog.public_input_digest,'case file inventory differs from approved catalog');return spec;});
  const worker=join(import.meta.dirname,'practical-evaluation-worker.mjs'),settingsPath=join(p.stateRoot,'practical-worker-settings.json');
  const settings={cases:Object.fromEntries(cases.map(c=>[c.id,{files:c.files,...(c.grader?{grader:c.grader}:{})}])),
    conditions:Object.fromEntries(conditions.map(c=>[c.id,{files:c.files,command:c.command,command_role:c.command_role}])),
    ...(p.practical.observation_path===undefined?{}:{observation_path:p.practical.observation_path})};
  save(settingsPath,settings);const settingsPin=pin(settingsPath);
  const runtime={commands:{trial:{argv:[process.execPath,worker,settingsPath,settingsPin.digest,'execute'],inspect_argv:[process.execPath,worker,settingsPath,settingsPin.digest,'inspect'],
    pins:[settingsPin,pin(worker),pin(join(import.meta.dirname,'practical-quality-observation.mjs')),pin(join(import.meta.dirname,'instruction-loop-fixed-scoring.mjs'))],model_calls:conditions.some(c=>c.command.model_calls)||cases.some(c=>c.grader?.model_calls)}}};
  if(p.practical.assessor){const settings=join(p.stateRoot,'practical-assessor-settings.json'),providerPins=[];
    if(p.practical.assessor.kind==='codex'&&p.practical.assessor.executableDigest!==undefined){
      assert.equal(resolve(p.practical.assessor.executable),p.practical.assessor.executable,'absolute pinned recovery executable required');
      assert.match(p.practical.assessor.executableDigest,/^sha256:[a-f0-9]{64}$/u);
      const provider=pin(p.practical.assessor.executable);assert.equal(provider.digest,p.practical.assessor.executableDigest,'recovery executable drift');providerPins.push(provider);
    }
    save(settings,p.practical.assessor);
    const assessor=join(import.meta.dirname,'practical-evaluation-assessor.mjs'),settingsPin=pin(settings);
    runtime.commands.assess={argv:[process.execPath,assessor,settings,settingsPin.digest],pins:[settingsPin,pin(assessor),...providerPins],model_calls:p.practical.assessor.kind!=='fixture'};}
  const plan={kind:'practical_evaluation_plan_v1',id:p.policy.id,goal:feedback.goal,runtime_digest:canonicalDigest(runtime),evidence_kind:p.practical.evidence_kind,
    conditions:conditions.map(({id,context})=>({id,context})),cases:cases.map(({id,task_ref,input_ref,success_criteria_ref})=>({id,task_ref,input_ref,success_criteria_ref,
      public_input_digest:job.input.catalog.find(c=>c.id===id).public_input_digest})),repetitions:p.policy.repetitions,recovery:p.practical.recovery,global_context:p.practical.global_context};
  const value={...selected,source_request_digest:canonicalDigest(job),source_profile_digest:canonicalDigest(p),full_context_comparison:fairness,practical_plan:plan,practical_plan_digest:canonicalDigest(plan),
    practical_runtime:runtime,practical_root:p.practical.root,quality_plan:'User-owned public checks/rubrics; unavailable quality stays unknown. Not formal primary admission.'};
  save(selectionPath(p),value);return value;
}
function evaluationOutput(job,state){
  if(state.report)state={...state,report:{...state.report,measured_context:`Declared complete instruction projections and public tasks are frozen; actual use/effect requires the recorded case evidence. Candidate source ${job.input.candidate.source_revision??'Unknown'}.`}};
  return {request_digest:canonicalDigest(job),status:state.status==='completed'?'completed':'awaiting_ai_recovery',output:state.status==='completed'?
    {practical_status:'completed',report:state.report,trials:state.report.all_attempts.map(a=>({...a.original_result.output,row:a.row,status:a.original_result.status})),formal_admission_implied:false}:
    {practical_status:state.status,pending_recovery:state.pending_recovery,pending_recovery_digest:state.pending_recovery_digest}};
}
export function createFullPracticalInstructionLoopRuntime({definition,modelCallsAuthorized=false}){
  return createPracticalLifecycleRuntime({definition,modelCallsAuthorized,readProfile:()=>checkedProfile(definition),executeStage:executeNativeInstructionLoopStage,
    validateCoordinatorRoot(root,p){
      for(const path of [p.practical.root,p.storeRoot,p.stateRoot,p.practical.baselineRoot,p.generator.baselineSourceRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot,
        ...(p.normal.target===null?[]:[p.normal.target])])assert.ok(root!==path&&!root.startsWith(path+'/')&&!path.startsWith(root+'/'),'coordinator overlaps evaluation, source, state or owner');
    }});
}
export function createPracticalLifecycleRuntime({definition,modelCallsAuthorized=false,readProfile,executeStage,validateCoordinatorRoot,inspectStage=null}){
  const p=readProfile(),digest=canonicalDigest(definition);
  const stageResult=(job,output)=>({request_digest:canonicalDigest(job),status:output?.kind==='component_authoring_pending_v1'?'awaiting_authoring':'completed',output});
  const folder=job=>join(p.stateRoot,'stages',canonicalDigest(job).slice(7)),resultPath=job=>join(folder(job),'result.json');
  const handoffPath=job=>join(folder(job),'authoring-prepared.json');
  const prepared=job=>{const stored=readJsonFileStrict(selectionPath(p),'practical selection',16*1024*1024);assert.equal(canonicalDigest(stored),canonicalDigest(job.input.selection),'approved practical selection drift');return stored;};
  const allocate=(job,resumable=false)=>{assertNoSymlinkPathSegments(folder(job),'practical lifecycle stage',{allowMissingLeaf:true});
    mkdirSync(dirname(folder(job)),{recursive:true,mode:0o700});
    if(!existsSync(folder(job)))mkdirSync(folder(job),{mode:0o700});else assert.ok(resumable,'stage already allocated; inspect instead of replay');
    save(join(folder(job),'request.json'),job);};
  const evaluate=async(job,{root,assessment=null})=>{
    readProfile();allocate(job,true);const selection=prepared(job),runtime=createPracticalEvaluationCommandRuntime({definition:selection.practical_runtime,modelCallsAuthorized});
    const state=await advancePracticalEvaluation({root:selection.practical_root,plan:selection.practical_plan,runtime,assessment,
      inheritedApproval:{root,job_digest:canonicalDigest(job)}});
    const result=evaluationOutput(job,state);if(result.status==='completed')save(resultPath(job),result);return result;
  };
  const runtime={digest,evaluate,resumeEvaluation:evaluate,
    validateCoordinatorRoot(root){validateCoordinatorRoot(root,p);},
    async inspect(job,context={}){readProfile();if(existsSync(resultPath(job)))return readJsonFileStrict(resultPath(job),'lifecycle result',16*1024*1024);
      if(job.kind==='evaluate'){
        const selection=prepared(job);
        if(existsSync(selection.practical_root)){
          const state=inspectPracticalEvaluation(selection.practical_root);
          if(state.status==='completed'){const result=evaluationOutput(job,state);save(resultPath(job),result);return result;}
          if(['awaiting_ai_recovery','ai_assessment_uncertain'].includes(state.status))return evaluationOutput(job,state);
        }
        return {request_digest:canonicalDigest(job),status:'resumable'};
      }
      if(inspectStage)try{
        let preparedHandoffDigest;
        if(job.kind==='generate'&&existsSync(handoffPath(job))){const receipt=readInstructionLoopJson(handoffPath(job),'prepared host handoff');
          assert.equal(receipt.request_digest,canonicalDigest(job));assert.equal(receipt.status,'awaiting_authoring');assert.equal(receipt.output.kind,'component_authoring_pending_v1');preparedHandoffDigest=receipt.output.handoff_digest;}
        const output=await inspectStage(p,job,{...context,preparedHandoffDigest});
        if(output!==null){const result={...stageResult(job,output),inspection:{recovered_from_owned_evidence:true}};if(result.status==='completed')save(resultPath(job),result);return result;}
      }catch(error){
        const issue={request_digest:canonicalDigest(job),reason:String(error.message).slice(0,2048)};
        save(join(folder(job),'inspection-'+canonicalDigest(issue).slice(7)+'.json'),issue);
        return {request_digest:canonicalDigest(job),status:'unknown',inspection_issue:issue};
      }
      return {request_digest:canonicalDigest(job),status:'unknown'};},
    async preflight(job){readProfile();assert.ok(!existsSync(folder(job)),'stage already allocated; inspect instead of replay');
      if(job.kind==='generate'&&(p.generator?.provider.kind==='codex'||p.candidate?.authoring?.provider.kind==='codex'))assert.equal(modelCallsAuthorized,true,'generation model calls not authorized');
      assertNoSymlinkPathSegments(folder(job),'practical lifecycle stage',{allowMissingLeaf:true});}
  };
  for(const kind of stages)runtime[kind]=async(job,context={})=>{
    readProfile();allocate(job);const output=kind==='select'?prepareFullPracticalInstructionSelection(p,job):await executeStage(p,job,{...context,modelCallsAuthorized});
    const result=stageResult(job,output);if(result.status==='completed')save(resultPath(job),result);else save(handoffPath(job),result);return result;};
  return runtime;
}
