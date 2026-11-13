#!/usr/bin/env node
// Standard practical trial port for registered staged challenges. A trial is
// consumed once; an inspector only reads completed stages and new grade evidence.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {preparePracticalChallenge,inspectPracticalChallenge,startPracticalChallenge,preparePracticalChallengeScoreHandoff,inspectPracticalChallengeScoreHandoff,listPracticalChallenges} from './practical-challenge-evaluation.mjs';
import {executePracticalEvaluationWorker} from './practical-evaluation-worker.mjs';
import {validatePracticalQualityObservation} from './practical-quality-observation.mjs';
const save=(path,value)=>writeCanonicalJsonNoReplace({outputPath:path,artifact:value,label:'challenge loop evidence',maximumBytes:16*1024*1024});
const read=p=>readJsonFileStrict(p,'challenge loop input',16*1024*1024);
const filePin=p=>({path:p,digest:hash(readStableBytes(p,'challenge loop pin',16*1024*1024))});
const relativePin=(root,p)=>({path:p,digest:filePin(join(root,p)).digest});
const safe=p=>assert.ok(typeof p==='string'&&p&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..'),'safe relative path required');
export function createPracticalChallengeCommandDefinition(settingsPath){
 settingsPath=resolve(settingsPath);
 const worker=join(import.meta.dirname,'practical-challenge-worker.mjs');
 const names=['practical-challenge-worker.mjs','practical-challenge-evaluation.mjs','practical-session-usage.mjs','practical-codex-adapter.mjs','practical-evaluation-worker.mjs','practical-quality-observation.mjs','instruction-loop-fixed-scoring.mjs','instruction-loop-artifact.mjs','instruction-projection-paths.mjs','codex-exec-runner.mjs','ask-user-comparison.mjs','content-addressed-store.mjs','instruction-environment.mjs','ask-benchmark-stable-file.mjs'];
 const settingsPin=filePin(settingsPath);
 return {argv:[process.execPath,worker,settingsPath,settingsPin.digest,'execute'],inspect_argv:[process.execPath,worker,settingsPath,settingsPin.digest,'inspect'],refresh_inspection:true,pins:[settingsPin,...names.map(n=>filePin(join(import.meta.dirname,n))),filePin(join(import.meta.dirname,'../benchmarks/practical-challenges.json'))],model_calls:true};
}
export function registeredChallengeFiles(id){
 const c=listPracticalChallenges().find(c=>c.id===id);assert.ok(c,'unknown registered challenge');
 const root=resolve(import.meta.dirname,'..'),manifestPath=join(root,c.input_manifest.path);
 assert.equal(filePin(manifestPath).digest,c.input_manifest.digest,'challenge catalog input drift');
 return read(manifestPath).files.map(f=>({source:join(root,c.workspace,f.path),target:f.path,digest:'sha256:'+f.sha256}));
}
function checked(settings,job){
 const row=job.input.row,spec=settings.cases[row.case_id],condition=settings.conditions[row.condition];assert.ok(spec&&condition,'unknown challenge case/condition');
 assert.equal(job.kind,'trial');assert.equal(canonicalDigest(spec.files.map(({target,digest})=>({target,digest}))),row.public_input_digest,'approved public input changed');
 if(spec.challenge){
  assert.equal(spec.challenge.id,row.case_id);assert.ok(!spec.grader,'challenge semantic grading must use its bound handoff');
  assert.deepEqual(spec.files.map(({target,digest})=>({target,digest})),registeredChallengeFiles(spec.challenge.id).map(({target,digest})=>({target,digest})),'registered challenge differs from approved case');
 }
 return {spec,condition};
}
function bind(root,job){const ref=read(join(root,'loop-job.json'));assert.equal(ref.request_digest,canonicalDigest(job),'challenge job transplant');return ref;}
function prepare(settings,job,directory){
 const {spec,condition}=checked(settings,job);assert.ok(spec.challenge);assert.ok(condition.codex,'challenge needs the standard Codex adapter');
 const overlay=join(directory,'instructions');assert.ok(!existsSync(overlay));mkdirSync(overlay,{mode:0o700});
 for(const f of condition.files){safe(f.target);const b=readStableBytes(f.source,'pinned challenge instruction');assert.equal(hash(b),f.digest,'instruction projection changed');const p=join(overlay,f.target);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,b,{flag:'wx',mode:f.mode??0o600});}
 const config={...spec.challenge,root:join(directory,'challenge'),options:condition.codex,instructionsRoot:overlay,instructionsSupplements:condition.instructionsSupplements??[],evidenceKind:settings.evidence_kind??'observed'};
 const result=preparePracticalChallenge(config);save(join(config.root,'loop-job.json'),{request_digest:canonicalDigest(job),manifest_digest:result.manifest_digest,condition:job.input.row.condition});return result;
}
export async function executeChallengeEvaluationWorker(settings,job,resultPath,{session}={}){
 const {spec}=checked(settings,job);if(!spec.challenge){const result=await executePracticalEvaluationWorker(settings,job,resultPath);save(join(dirname(resultPath),'local-completion.json'),result);return result;}
 const directory=dirname(resultPath),root=join(directory,'challenge');assert.ok(!existsSync(root),'trial already consumed; inspect instead of replay');
 const ready=prepare(settings,job,directory);
 let state=await startPracticalChallenge(root,ready.manifest_digest,{allowModelCalls:true,stage:'initial',session});
 if(state.status==='awaiting_resume_confirmation')state=await startPracticalChallenge(root,ready.manifest_digest,{allowModelCalls:true,stage:'reassessment',session});
 if(state.status==='awaiting_semantic_assessment')preparePracticalChallengeScoreHandoff(root);
 return inspectChallengeEvaluationWorker(settings,job,directory);
}
function fraction(n){assert.ok(Number.isFinite(n)&&n>=0);const text=String(n);assert.match(text,/^\d{1,12}(?:\.\d{1,6})?$/u,'bounded decimal points required');const [a,b='']=text.split('.');return b?a+b+'/'+String(10**b.length):a;}
async function grade(root){
 const path=join(root,'semantic-assessment.json');if(!existsSync(path))return null;
 const artifact=read(path),m=read(join(root,'manifest.json')),handoff=inspectPracticalChallengeScoreHandoff(root);
 assert.equal(artifact.manifest_digest,canonicalDigest(m),'assessment manifest mismatch');assert.equal(artifact.handoff_digest,canonicalDigest(handoff),'assessment handoff mismatch');
 for(const stage of handoff.stages){for(const a of stage.outputs)assert.equal(filePin(join(root,'workspace',a.path)).digest,a.digest,'graded answer changed');for(const p of [stage.receipt,stage.usage_snapshot])assert.equal(filePin(p.path).digest,p.digest);}
 for(const f of [...m.files,...(m.instructions?.files??[])])assert.equal(filePin(join(root,'workspace',f.path)).digest,f.digest,'graded frozen input changed');
 const evaluator=handoff.evaluator;for(const f of evaluator.files)assert.equal(filePin(join(evaluator.root,f.path)).digest,f.digest,'private evaluator drift');
 const {score}=await import(pathToFileURL(join(evaluator.root,'score.mjs')).href);
 const result=score(read(join(evaluator.root,'rubric.json')),artifact.assessment);assert.deepEqual(result,artifact.result,'assessment calculator result drift');
 return artifact;
}
export async function importChallengeSemanticAssessment(root,input){
 root=resolve(root);assertNoSymlinkPathSegments(root,'challenge assessment');
 const state=inspectPracticalChallenge(root);assert.equal(state.status,'awaiting_semantic_assessment','both stages must complete before grading');
 // This reruns complete frozen input/answer/receipt validation, without replacing
 // the original handoff or dispatching a solver.
 const handoff=inspectPracticalChallengeScoreHandoff(root),m=read(join(root,'manifest.json'));
 assert.equal(input.kind,'practical_challenge_assessment_input_v1');assert.equal(input.manifest_digest,state.manifest_digest);assert.equal(input.handoff_digest,canonicalDigest(handoff));
 for(const stage of handoff.stages){for(const a of stage.outputs)assert.equal(filePin(join(root,'workspace',a.path)).digest,a.digest,'graded answer changed');for(const p of [stage.receipt,stage.usage_snapshot])assert.equal(filePin(p.path).digest,p.digest);}
 for(const f of m.files)assert.equal(filePin(join(root,'workspace',f.path)).digest,f.digest,'graded public input changed');
 const answers=handoff.stages.flatMap(s=>s.outputs).map(a=>({digest:a.digest.slice(7),text:readFileSync(join(root,'workspace',a.path),'utf8')}));
 for(const item of input.assessment.requirements??[])for(const e of item.evidence??[]){
  if(e.answer_quote)assert.ok(answers.some(a=>a.text.includes(e.answer_quote)),'assessment quote absent from frozen answer');
  if(e.answer_absent)assert.ok(answers.some(a=>a.digest===e.inspected_answer_sha256),'absence claim bound to wrong answer');
 }
 for(const f of handoff.evaluator.files)assert.equal(filePin(join(handoff.evaluator.root,f.path)).digest,f.digest,'evaluator input changed');
 const {score}=await import(pathToFileURL(join(handoff.evaluator.root,'score.mjs')).href);
 const result=score(read(join(handoff.evaluator.root,'rubric.json')),input.assessment);
 fraction(result.known_points);fraction(result.known_points+result.missing_weight);
 const output={kind:'practical_challenge_assessment_v1',manifest_digest:state.manifest_digest,handoff_digest:canonicalDigest(handoff),assessment:input.assessment,result,grading_metrics:input.grading_metrics??null,semantic_truth_verified_by_calculator:false};
 save(join(root,'semantic-assessment.json'),output);return output;
}
export async function inspectChallengeEvaluationWorker(settings,job,directory){
 const {spec}=checked(settings,job),root=join(directory,'challenge');
 if(!spec.challenge){const p=join(directory,'local-completion.json');return existsSync(p)?read(p):{request_digest:canonicalDigest(job),status:'unknown'};}
 if(!existsSync(join(root,'manifest.json')))return {request_digest:canonicalDigest(job),status:'unknown',output:{ready_for_next_root:false}};
 bind(root,job);const state=inspectPracticalChallenge(root),stages=Object.values(state.stages).filter(Boolean);
 const completed=state.status==='awaiting_semantic_assessment';
 // A successful initial turn still requires reassessment. Missing results for
 // required or allocated stages never prove closure of the whole worker.
 const closureStages=['initial'];
 if(state.stages.initial?.completed||state.stages.reassessment||existsSync(join(root,'reassessment')))closureStages.push('reassessment');
 const closed=closureStages.every(stage=>state.stages[stage]?.terminal===true);
 const durations=stages.map(s=>s.receipt.observation.provider_duration_ms),duration=durations.every(v=>Number.isFinite(v)&&v>=0)?durations.reduce((a,b)=>a+b,0):null;
 const latest=state.stages.reassessment??state.stages.initial;
 const usage=latest?.usage_snapshot?read(join(root,state.stages.reassessment?'reassessment':'initial',latest.usage_snapshot.path)):null;
 const observed=usage?.aggregate_observed??{},metrics={duration_ms:duration,input_tokens:observed.input_tokens??null,output_tokens:observed.output_tokens??null,cached_tokens:observed.cached_input_tokens??null};
 // The hierarchy is cumulative. Never sum phase snapshots, nor silently label a
 // root-only fallback as the complete parent+child cost.
 const assessment=completed?await grade(root):null;let quality=null,gradeRecord=null;
 const artifacts=assessment?[relativePin(directory,'challenge/semantic-assessment.json'),relativePin(directory,'challenge/score-handoff.json')]:[];
 if(assessment){const s=assessment.result;const fixed={kind:'fixed_point_reference_summary_v1',exact_lower:fraction(s.known_points),exact_upper:fraction(s.known_points+s.missing_weight),scale_maximum:'100',mandatory_compliance:null,observation_completeness_reported:s.missing_weight===0,runtime_acceptance_verified:null,critical_status:'undetermined',partial_items:s.requirements.filter(r=>r.status==='partial').length,undetermined_items:s.requirements.filter(r=>r.status==='unknown').length,formal_admission:false,evidence_truth_checked:false,capture_complete:false};
  quality={kind:'practical_quality_observation_v1',scope:'caller_criteria',outcome:s.quality_score===null?'unknown':s.quality_score===100?'pass':'fail',evidence_refs:artifacts,fixed_reference:fixed};validatePracticalQualityObservation(quality,artifacts);
  gradeRecord={exit_code:0,timed_out:false,signal:null,duration_ms:assessment.grading_metrics?.duration_ms??null,provider_observation:{artifacts,metrics:assessment.grading_metrics??{}}};
 }
 return {request_digest:canonicalDigest(job),status:completed?'completed':stages.length?'failed':'unknown',output:{ready_for_next_root:closed,execution_completed:completed,context_integrity:completed?'preserved':'unverified',grading_execution_state:assessment?'completed':'not_started',quality_observation:quality,grade:gradeRecord,challenge_root:root,challenge_status:state.status,semantic_assessment_required:completed&&!assessment,cli_seconds:duration===null?null:duration/1000,root_usage:null,usage_hierarchy:usage,metrics_scope:'observed linked root and descendant records; completeness unknown; cumulative latest snapshot only',notes:{outcome:quality?.outcome??'unknown',evidence_refs:stages.flatMap((s,i)=>s.outputs.map(o=>'challenge/workspace/'+o.path)),metrics}}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [settingsPath,digest,action,requestPath,resultPath]=process.argv.slice(2);
 try{assert.equal(filePin(settingsPath).digest,digest,'challenge worker settings drift');const settings=read(settingsPath),job=read(requestPath),directory=dirname(requestPath);
  const value=action==='execute'?await executeChallengeEvaluationWorker(settings,job,join(directory,'result.json')):action==='inspect'?await inspectChallengeEvaluationWorker(settings,job,directory):assert.fail('unknown challenge worker action');save(resultPath,value);
 }catch(error){console.error(error.stack??error);process.exitCode=1;}
}
