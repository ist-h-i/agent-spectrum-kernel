import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import * as challenge from './practical-challenge-evaluation.mjs';
import {createPracticalEvaluationCommandRuntime} from './instruction-loop-command-runtime.mjs';
import {advancePracticalEvaluation} from './practical-evaluation-runner.mjs';
const id='rc01-shared-review-platform',read=p=>JSON.parse(readFileSync(p));
function tmp(t){const root=realpathSync(mkdtempSync(join(tmpdir(),'challenge-worker-')));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}

test('pinned supplements preserve declared Full context and reject missing, duplicate or drifted extras',t=>{
 const root=tmp(t),overlay=join(root,'overlay');mkdirSync(overlay);mkdirSync(join(overlay,'docs'));writeFileSync(join(overlay,'docs','contract.md'),'public instruction');
 const f={path:'docs/contract.md',digest:hash(Buffer.from('public instruction'))};
 const config={id,root:join(root,'run'),instructionsRoot:overlay,instructionsSupplements:[f],evidenceKind:'synthetic',options:{executable:realpathSync('/bin/echo'),model:'synthetic',reasoning:'low',task_file:'task.md',timeout_ms:1000},toolchainRoots:['/usr']};
 assert.equal(challenge.preparePracticalChallenge(config).status,'prepared');
 assert.deepEqual(read(join(config.root,'manifest.json')).instruction_supplements,[f]);
 assert.throws(()=>challenge.preparePracticalChallenge({...config,root:join(root,'no'),instructionsSupplements:[]}),/instruction-only/);
 assert.throws(()=>challenge.preparePracticalChallenge({...config,root:join(root,'dupe'),instructionsSupplements:[f,f]}),/duplicate/);
 assert.throws(()=>challenge.preparePracticalChallenge({...config,root:join(root,'drift'),instructionsSupplements:[{...f,digest:'sha256:'+'0'.repeat(64)}]}),/missing or changed/);
});

test('a standard staged trial dispatches exactly two linked turns; inspect and failed reassessment never replay',async t=>{
 const root=tmp(t);let handoffs=0,calls=0;
 t.mock.module('./practical-challenge-evaluation.mjs',{namedExports:{...challenge,preparePracticalChallengeScoreHandoff:()=>{handoffs++;return {semantic_assessment_required:true};}}});
 const worker=await import('./practical-challenge-worker.mjs?staged-test');
 const files=worker.registeredChallengeFiles(id),pub=canonicalDigest(files.map(({target,digest})=>({target,digest})));
 const settings={evidence_kind:'synthetic',cases:{[id]:{files,challenge:{id,toolchainRoots:['/usr']}}},conditions:{baseline:{files:[],codex:{executable:realpathSync('/bin/echo'),model:'synthetic',reasoning:'low',task_file:'task.md',timeout_ms:1000}}}};
 const job={kind:'trial',key:'synthetic',input:{row:{case_id:id,condition:'baseline',public_input_digest:pub}}};
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';t.after(()=>{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;});
 const session=async request=>{calls++;const resume=request.argv[1]==='resume';if(resume)assert.ok(request.argv.includes('synthetic-session'));
  for(const name of resume?['REASSESSMENT.md']:['INITIAL.md','REVIEW.md'])writeFileSync(join(request.cwd,name),'Synthetic '+name);
  return {spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:12,stdout:Buffer.from([{type:'thread.started',thread_id:'synthetic-session'},{type:'turn.completed',usage:{input_tokens:10,output_tokens:2,cached_input_tokens:0}}].map(JSON.stringify).join('\n')+'\n'),stderr:Buffer.alloc(0)};
 };
 const result=await worker.executeChallengeEvaluationWorker(settings,job,join(root,'result.json'),{session});
 assert.equal(calls,2);assert.equal(handoffs,1);assert.equal(result.status,'completed');assert.equal(result.output.semantic_assessment_required,true);assert.equal(result.output.cli_seconds,.024);
 assert.equal(result.output.notes.metrics.input_tokens,null,'missing hierarchy is not reported as complete root-only cost');
 await worker.inspectChallengeEvaluationWorker(settings,job,root);await worker.inspectChallengeEvaluationWorker(settings,job,root);assert.equal(calls,2);
 await assert.rejects(worker.executeChallengeEvaluationWorker(settings,job,join(root,'result.json'),{session}),/consumed/);assert.equal(calls,2);
 const bad=join(root,'failed');mkdirSync(bad);let failcalls=0;
 await worker.executeChallengeEvaluationWorker(settings,job,join(bad,'result.json'),{session:async request=>{failcalls++;if(failcalls===1)return session(request);return {spawnObserved:false,terminationConfirmed:true,exitCode:null,error:{message:'test failure'},stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};}});
 const failed=await worker.inspectChallengeEvaluationWorker(settings,job,bad);assert.equal(failed.status,'failed');assert.equal(failcalls,2);assert.equal(handoffs,1);
});

test('refreshable standard command inspection retains prior result and resumes grade-only recovery without solver replay',async t=>{
 const root=tmp(t),script=join(root,'fixture.mjs'),grade=join(root,'grade.json'),calls=join(root,'calls.txt');
 writeFileSync(script,`import{writeFileSync,readFileSync,existsSync,appendFileSync}from'node:fs';import{createHash}from'node:crypto';
import{canonicalDigest}from ${JSON.stringify(new URL('./content-addressed-store.mjs',import.meta.url).href)};
const[action,request,result]=process.argv.slice(2),job=JSON.parse(readFileSync(request));if(action==='execute')appendFileSync(${JSON.stringify(calls)},'x');
const graded=existsSync(${JSON.stringify(grade)});writeFileSync(result,JSON.stringify({request_digest:canonicalDigest(job),status:'completed',output:{ready_for_next_root:true,execution_completed:true,context_integrity:'preserved',notes:{outcome:graded?'pass':'unknown',evidence_refs:['fixture.log'],metrics:{duration_ms:12,input_tokens:10,output_tokens:2,cached_tokens:0}}}}),{flag:'wx'});`);
 const definition={commands:{trial:{argv:[process.execPath,script,'execute'],inspect_argv:[process.execPath,script,'inspect'],refresh_inspection:true,pins:[{path:script,digest:hash(readFileSync(script))}],model_calls:false}}},runtime=createPracticalEvaluationCommandRuntime({definition});
 const context={cli_version:'test',model:'synthetic',reasoning:'low',platform:'test',global_context_ref:null};
 const plan={kind:'practical_evaluation_plan_v1',id:'challenge-refresh',goal:'test pending grade continuation',runtime_digest:runtime.digest,evidence_kind:'synthetic',conditions:['baseline','candidate'].map(id=>({id,context})),cases:[{id:'public',task_ref:'task',input_ref:'input',success_criteria_ref:'rubric',public_input_digest:'sha256:'+'1'.repeat(64)}],repetitions:1,recovery:{max_extra_trials:0,max_retries_per_row:0,allow_reference:true,allow_exclusion:true,required_dimensions:['execution','quality','duration','usage']},global_context:{ask_presence:'observed',change_status:'observed'}};
 const evaluation=join(root,'evaluation'),run=extra=>advancePracticalEvaluation({root:evaluation,plan,runtime,...extra});
 let state=await run();assert.equal(state.status,'awaiting_evaluation_approval');assert.equal(existsSync(calls),false);
 state=await run({decision:{disposition:'approved',packet_digest:canonicalDigest(state.pending_gate),reason:'synthetic case approval'}});assert.equal(state.status,'awaiting_ai_recovery');assert.equal(readFileSync(calls,'utf8'),'x');
 state=await run();assert.equal(readFileSync(calls,'utf8'),'x');
 writeFileSync(grade,'{}');state=await run();assert.equal(state.status,'completed');assert.equal(readFileSync(calls,'utf8'),'xx');assert.equal(state.report.all_attempts.length,2);assert.equal(state.report.extra_trials,0);assert.equal(state.report.all_attempts[0].result_observation_history.length,1);
});

test('semantic import binds a partial 100-point score to answers, handoff and evaluator; inspection rejects later drift',async t=>{
 const directory=tmp(t),root=join(directory,'challenge'),workspace=join(root,'workspace'),evaluator=join(directory,'private');mkdirSync(workspace,{recursive:true});mkdirSync(evaluator);
 writeFileSync(join(workspace,'REVIEW.md'),'Observed verified behavior and missing failure recovery.');
 writeFileSync(join(workspace,'task.md'),'public input');
 writeFileSync(join(evaluator,'rubric.json'),'[{"id":"a","points":50},{"id":"b","points":50}]');
 // Synthetic calculator contract only. No private RC01 defect inventory in tests.
 writeFileSync(join(evaluator,'score.mjs'),`export function score(rubric,a){if(a.requirements.length!==2)throw Error('coverage');const unknown=a.requirements.filter(r=>r.status==='unknown').length;const known=a.requirements.reduce((n,r)=>n+(r.earned??0),0);return{quality_score:unknown?null:known,known_points:known,missing_weight:unknown*50,requirements:a.requirements,semantic_truth_verified_by_calculator:false};}`);
 const pin=p=>({path:p,digest:hash(readFileSync(p))});
 const m={root,files:[{path:'task.md',digest:pin(join(workspace,'task.md')).digest}],instructions:null};writeFileSync(join(root,'manifest.json'),JSON.stringify(m));
 const receipt=join(root,'receipt.json'),usage=join(root,'usage.json');writeFileSync(receipt,'{}');writeFileSync(usage,'{}');
 const handoff={manifest_digest:canonicalDigest(m),evaluator:{root:evaluator,files:['rubric.json','score.mjs'].map(path=>({path,digest:pin(join(evaluator,path)).digest}))},stages:[{id:'initial',outputs:[{path:'REVIEW.md',digest:pin(join(workspace,'REVIEW.md')).digest}],receipt:pin(receipt),usage_snapshot:pin(usage)}]};writeFileSync(join(root,'score-handoff.json'),JSON.stringify(handoff));
 const status=()=>({status:'awaiting_semantic_assessment',manifest_digest:canonicalDigest(m),stages:{initial:{terminal:true,receipt:{observation:{provider_duration_ms:12}},outputs:handoff.stages[0].outputs},reassessment:null}});
 t.mock.module('./practical-challenge-evaluation.mjs',{namedExports:{...challenge,inspectPracticalChallenge:status,inspectPracticalChallengeScoreHandoff:()=>read(join(root,'score-handoff.json'))}});
 const worker=await import('./practical-challenge-worker.mjs?grade-test');
 const input={kind:'practical_challenge_assessment_input_v1',manifest_digest:canonicalDigest(m),handoff_digest:canonicalDigest(handoff),assessment:{requirements:[{id:'a',status:'pass',earned:50,evidence:[{answer_quote:'Observed verified behavior'}]},{id:'b',status:'unknown',earned:null,evidence:[]}]}};
 await assert.rejects(worker.importChallengeSemanticAssessment(root,{...input,handoff_digest:'sha256:'+'0'.repeat(64)}));
 const wrong=structuredClone(input);wrong.assessment.requirements[0].evidence[0].answer_quote='unwritten evidence';await assert.rejects(worker.importChallengeSemanticAssessment(root,wrong),/quote absent/);
 const result=await worker.importChallengeSemanticAssessment(root,input);assert.equal(result.result.quality_score,null);assert.equal(result.result.known_points,50);assert.equal(result.result.missing_weight,50);
 assert.deepEqual(await worker.importChallengeSemanticAssessment(root,input),result,'identical import is idempotent');
 const changed=structuredClone(input);changed.assessment.requirements[0].earned=49;await assert.rejects(worker.importChallengeSemanticAssessment(root,changed),/exist|different|conflict|match/i);
 const files=worker.registeredChallengeFiles(id),job={kind:'trial',input:{row:{case_id:id,condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};writeFileSync(join(root,'loop-job.json'),JSON.stringify({request_digest:canonicalDigest(job)}));
 const settings={cases:{[id]:{files,challenge:{id}}},conditions:{baseline:{}}};
 let observation=await worker.inspectChallengeEvaluationWorker(settings,job,directory);assert.equal(observation.output.quality_observation.fixed_reference.exact_lower,'50');assert.equal(observation.output.quality_observation.fixed_reference.exact_upper,'100');assert.equal(observation.output.quality_observation.outcome,'unknown');
 writeFileSync(join(workspace,'REVIEW.md'),'changed later');await assert.rejects(worker.inspectChallengeEvaluationWorker(settings,job,directory),/graded answer changed/);
});

test('mixed-route ordinary tasks retain their terminal receipt across refresh inspection',async t=>{
 const root=tmp(t),worker=await import('./practical-challenge-worker.mjs?ordinary-test'),task=join(root,'task.mjs');writeFileSync(task,'console.log("verified ordinary task");');
 const files=[{source:task,target:'task.mjs',digest:hash(readFileSync(task))}],settings={cases:{ordinary:{files}},conditions:{baseline:{files:[],command_role:'check',command:{argv:[process.execPath,'task.mjs'],pins:[{path:task,digest:hash(readFileSync(task))}],timeout_ms:1000,model_calls:false}}}};
 const job={kind:'trial',input:{row:{case_id:'ordinary',condition:'baseline',public_input_digest:canonicalDigest(files.map(({target,digest})=>({target,digest})))}}};
 const result=await worker.executeChallengeEvaluationWorker(settings,job,join(root,'result.json'));assert.equal(result.status,'completed');assert.equal(result.output.notes.outcome,'pass');assert.equal(existsSync(join(root,'local-completion.json')),true);
 assert.deepEqual(await worker.inspectChallengeEvaluationWorker(settings,job,root),result);assert.deepEqual(await worker.inspectChallengeEvaluationWorker(settings,job,root),result);
});
