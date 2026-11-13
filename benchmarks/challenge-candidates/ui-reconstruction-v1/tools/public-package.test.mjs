import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync,writeFileSync,mkdirSync,cpSync,existsSync,symlinkSync,truncateSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {seal,root,id,source,inventory} from './manifest.mjs';
import {score} from '../evaluator/score.mjs';
import {score as scoreV2} from '../evaluator-v2/score.mjs';
import {preparePracticalChallenge,startPracticalChallenge,preparePracticalChallengeScoreHandoff,inspectPracticalChallengeScoreHandoff} from '../../../../scripts/practical-challenge-evaluation.mjs';
import {importChallengeSemanticAssessment,registeredChallengeFiles} from '../../../../scripts/practical-challenge-worker.mjs';
import {canonicalDigest} from '../../../../scripts/content-addressed-store.mjs';
import {runtimePackageFiles} from '../../../../scripts/build-npm-package.mjs';
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const rubric=read('evaluator/rubric.json');
const activeRubric=read('evaluator-v2/rubric.json');
function decisionsV2(){return {kind:'ch08_assessor_decisions_v2',meta:{candidate_id:'synthetic',assessment_mode:'prospective',rubric_version:'2.0.0'},requirements:activeRubric.requirements.map(r=>({id:r.id,checks:r.checks.map(c=>({id:c.id,status:'pass',evidence:[{artifact:'synthetic/'+c.id,observation:'Synthetic calculator input only'}]}))})),release_blockers:Object.keys(activeRubric.release_blocker_rules).map(id=>({id,status:'clear',evidence:[{artifact:'synthetic/'+id,observation:'Synthetic only'}]}))};}
function decisions(status='pass'){
 return {kind:'ch08_assessor_decisions_v1',requirements:rubric.requirements.map(r=>({id:r.id,checks:r.checks.map(c=>({id:c.id,status,evidence:[{artifact:'synthetic/check/'+c.id,observation:'Artificial calculator input; no UI or model executed.'}]}))})),release_blockers:Object.keys(rubric.release_blocker_rules).map(id=>({id,status:'clear',evidence:[{artifact:'synthetic/blocker/'+id,observation:'Artificial clear observation; not a readiness claim.'}]}))};
}
function fixture(t){
 const base=realpathSync(mkdtempSync(join(tmpdir(),'ch08-contract-')));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const evaluator=join(base,'evaluator');cpSync(join(root,'evaluator-v2'),evaluator,{recursive:true});
 const run=join(base,'run'),ready=preparePracticalChallenge({id,root:run,evidenceKind:'synthetic',evaluatorRoot:evaluator,options:{executable:realpathSync('/bin/echo'),model:'synthetic-not-a-model',reasoning:'low',task_file:'task.md',timeout_ms:1000},toolchainRoots:['/usr']});
 let calls=0;
 const session=async request=>{
  calls++;const resume=request.argv[1]==='resume';
  if(resume)writeFileSync(join(request.cwd,'REASSESSMENT.md'),'Synthetic inspection only. No browser or model was used.');
  else{mkdirSync(join(request.cwd,'app'));writeFileSync(join(request.cwd,'app/index.html'),'<!doctype html><title>Synthetic transport sentinel</title>');writeFileSync(join(request.cwd,'DELIVERY.md'),'Synthetic transport sentinel, not a solution.');}
  return {spawnObserved:true,terminationConfirmed:true,exitCode:0,durationMs:12,stdout:Buffer.from([{type:'thread.started',thread_id:'synthetic-ch08'}, {type:'turn.completed',usage:{input_tokens:9,cached_input_tokens:2,output_tokens:4}}].map(JSON.stringify).join('\n')+'\n'),stderr:Buffer.alloc(0)};
 };
 const old=process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED='1';
 t.after(()=>{if(old===undefined)delete process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED;else process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED=old;});
 return {base,run,ready,evaluator,session,calls:()=>calls,start:(stage,injected=session)=>startPracticalChallenge(run,ready.manifest_digest,{allowModelCalls:true,stage,session:injected})};
}
test('sealed public inputs, public rubric and scenarios are complete and consistently registered',()=>{
 assert.equal(seal().files,13);assert.deepEqual(read('workspace/brief/rubric.json'),activeRubric);
 const scenarios=read('workspace/brief/scenarios.json').scenarios;
 assert.equal(scenarios.length,14);assert.equal(new Set(scenarios.map(s=>s.id)).size,14);
 for(const s of scenarios){assert.ok(s.steps.length&&s.positive.length&&s.negative.length);for(const ref of s.spec_refs)assert.match(ref,/^S[1-8]$/);}
 for(const r of rubric.requirements){assert.equal(r.checks.length,4);assert.ok(r.scenarios.every(id=>scenarios.some(s=>s.id===id)));}
 assert.equal(registeredChallengeFiles(id).length,13);
});
test('positive and negative JSON examples exercise request binding, plan constraints, evidence and references',()=>{
 const seed=read('workspace/fixtures/seed.json');
 const req=seed.requests.find(r=>r.id==='plan-1');
 const validatePlan=response=>{
  assert.equal(response.request_id,req.id,'wrong request');assert.equal(response.goal_id,req.goal_id);assert.equal(response.goal_revision,req.goal_revision);
  for(const c of req.snapshot.constraints){const actual=response.payload.goal[c.field];if(c.mode==='fixed')assert.deepEqual(actual,c.value);if(c.mode==='maximum')assert.ok(actual<=c.value,'over maximum');}
  const cs=new Set(response.payload.conditions.map(c=>c.id));for(const a of response.payload.actions)assert.ok(a.condition_ids.every(id=>cs.has(id)));
 };
 validatePlan(read('workspace/fixtures/plan-valid.json'));
 assert.throws(()=>validatePlan(read('workspace/fixtures/plan-over-limit.json')),/over maximum/);
 assert.throws(()=>validatePlan(read('workspace/fixtures/plan-wrong-request.json')),/wrong request/);
 const validateEvidence=response=>{
  for(const r of response.payload.results)for(const e of r.evidence){
   const record=seed.records.find(x=>x.id===e.record_id);assert.ok(record&&!record.voided);assert.equal(record.revision,e.revision);
   const related=r.target_type==='condition'?record.condition_ids.includes(r.target_id)||record.action_ids.some(id=>seed.actions.find(a=>a.id===id).condition_ids.includes(r.target_id)):record.action_ids.includes(r.target_id);
   assert.ok(related,'unrelated evidence');
  }
 };
 validateEvidence(read('workspace/fixtures/assessment-valid.json'));
 assert.throws(()=>validateEvidence(read('workspace/fixtures/assessment-wrong-evidence.json')),/unrelated evidence/);
 const validLinks=backup=>backup.records.every(r=>r.action_ids.every(id=>backup.actions.some(a=>a.id===id&&a.goal_id===r.goal_id)));
 assert.equal(validLinks(seed),true);assert.equal(validLinks(read('workspace/fixtures/backup-dangling.json')),false);
 const career=read('workspace/fixtures/career-valid.json').payload;
 for(const point of [career.current,career.after_goal,career.ideal]){assert.deepEqual(Object.keys(point.axes).sort(),['collaboration','delivery','design','leadership','learning']);assert.ok(Object.values(point.axes).every(n=>Number.isInteger(n)&&n>=1&&n<=5));assert.ok(point.uncertainty);}
 assert.ok(career.market_context);
});
test('synthetic full positive / negative scoring keeps functional and UX separate',()=>{
 const positive=score(rubric,decisions());assert.equal(positive.quality_score,100);assert.equal(positive.categories.functional.score,70);assert.equal(positive.categories.ux.score,30);
 const negative=score(rubric,decisions('fail'));assert.equal(negative.quality_score,0);assert.equal(negative.missing_weight,0);
 const partial=decisions();partial.requirements[0].checks[0].status='fail';
 assert.equal(score(rubric,partial).categories.functional.score,68);assert.equal(score(rubric,partial).categories.ux.score,30);
 partial.release_blockers[0].status='observed';assert.equal(score(rubric,partial).release_status,'blocked');assert.equal(score(rubric,partial).quality_score,98);
});
test('each published checkpoint changes arithmetic and unknowns preserve missing weight',()=>{
 for(let i=0;i<rubric.requirements.length;i++)for(let j=0;j<4;j++){
  const input=decisions();input.requirements[i].checks[j].status='fail';assert.equal(score(rubric,input).quality_score,100-rubric.requirements[i].weight/4);
 }
 const input=decisions();input.requirements[0].checks[0]={id:'F01.1',status:'unknown',missing:'No rendered app',next_check:'Run T01 in a browser'};
 const result=score(rubric,input);assert.equal(result.known_points,98);assert.equal(result.missing_weight,2);assert.equal(result.quality_score,null);assert.equal(result.categories.functional.score,null);assert.equal(result.categories.ux.score,30);
 input.release_blockers[0]={id:'data_loss',status:'unknown',missing:'No persistent store observed',next_check:'Run T11 to T13'};assert.equal(score(rubric,input).release_status,'unknown');
});
test('calculator rejects missing, duplicated or invented decisions and unsupported evidence',()=>{
 for(const mutate of [a=>a.requirements.pop(),a=>a.requirements[1]=a.requirements[0],a=>a.requirements[0].checks[0].id='secret-check',a=>a.requirements[0].checks[0].evidence=[],a=>a.requirements[0].points=8,a=>a.release_blockers.pop(),a=>a.requirements[0].checks[0].status='maybe']){
  const input=decisions();mutate(input);assert.throws(()=>score(rubric,input));
 }
});
test('standard preparation is model-free and distributes only public inputs',async t=>{
 const f=fixture(t);assert.equal(f.calls(),0);assert.equal(f.ready.status,'prepared');
 const files=inventory(join(f.run,'workspace')).map(f=>f.path);assert.deepEqual(files,inventory().map(f=>f.path));
 assert.equal(files.some(p=>/\.html$|score\.mjs|evaluator|REASSESSMENT|OPERATIONAL/.test(p)),false);
 await assert.rejects(startPracticalChallenge(f.run,f.ready.manifest_digest,{session:f.session}),/explicit authorization/);assert.equal(f.calls(),0);
});
test('synthetic staged delivery freezes app sources, binds handoff and imports separate quality',async t=>{
 const f=fixture(t);assert.equal((await f.start('initial')).status,'awaiting_resume_confirmation');
 const end=await f.start('reassessment');assert.equal(end.status,'awaiting_semantic_assessment');assert.equal(f.calls(),2);
 assert.ok(end.stages.initial.submission_files.some(f=>f.path==='app/index.html'));
 const handoff=preparePracticalChallengeScoreHandoff(f.run);const packet=inspectPracticalChallengeScoreHandoff(f.run);
 assert.ok(packet.stages[1].submission_files.some(f=>f.path==='app/index.html'));
 const result=await importChallengeSemanticAssessment(f.run,{kind:'practical_challenge_assessment_input_v1',manifest_digest:f.ready.manifest_digest,handoff_digest:handoff.digest,assessment:decisionsV2(),grading_metrics:{duration_ms:1,input_tokens:null,output_tokens:null,cached_tokens:null}});
 assert.equal(result.result.categories.functional.score,40);assert.equal(result.semantic_truth_verified_by_calculator,false);
 assert.equal(packet.manifest_digest,f.ready.manifest_digest);assert.equal(canonicalDigest(packet),handoff.digest);
 await assert.rejects(f.start('reassessment'),/consumed/);
});
test('app modification between stages is refused before another injected dispatch',async t=>{
 const f=fixture(t);await f.start('initial');writeFileSync(join(f.run,'workspace/app/index.html'),'changed');
 await assert.rejects(f.start('reassessment'),/drift/);assert.equal(f.calls(),1);
});
for(const stage of ['initial','reassessment'])for(const invalid of ['symlink','oversized'])test(`${stage} ${invalid} submission records an inspectable consumed integrity failure`,async t=>{
 const f=fixture(t);if(stage==='reassessment')await f.start('initial');
 const end=await f.start(stage,async request=>{
  const outcome=await f.session(request),path=join(request.cwd,'app/invalid');
  if(invalid==='symlink')symlinkSync('index.html',path);
  else{writeFileSync(path,'');truncateSync(path,16*1024*1024+1);}
  return outcome;
 });
 const record=end.stages[stage];assert.equal(end.status,stage+'_consumed_or_unknown');
 assert.equal(record.completed,false);assert.ok(record.integrity_error);assert.equal(record.receipt.session_id,'synthetic-ch08');
 assert.ok(existsSync(join(f.run,stage,'stage-result.json')));assert.ok(existsSync(join(f.run,stage,record.usage_snapshot.path)));
 assert.equal(record.receipt.observation.metrics.input_tokens,9);
 const calls=f.calls();await assert.rejects(f.start(stage),/consumed/);assert.equal(f.calls(),calls);
 assert.throws(()=>preparePracticalChallengeScoreHandoff(f.run));assert.equal(existsSync(join(f.run,'score-handoff.json')),false);
});
test('new files between stages are refused before reassessment and never become frozen answers',async t=>{
 const f=fixture(t);await f.start('initial');writeFileSync(join(f.run,'workspace/app/late.js'),'late');
 await assert.rejects(f.start('reassessment'),/inventory changed/);assert.equal(f.calls(),1);
});
test('app modification or added files after final stage invalidates semantic handoff',async t=>{
 const f=fixture(t);await f.start('initial');await f.start('reassessment');preparePracticalChallengeScoreHandoff(f.run);
 writeFileSync(join(f.run,'workspace/app/late.js'),'changed');assert.throws(()=>inspectPracticalChallengeScoreHandoff(f.run),/inventory changed/);
 rmSync(join(f.run,'workspace/app/late.js'));writeFileSync(join(f.run,'workspace/app/index.html'),'changed');assert.throws(()=>inspectPracticalChallengeScoreHandoff(f.run),/drift/);
});
test('npm runtime projection includes registration, public inputs and evaluator, never author reference HTML',()=>{
 const files=runtimePackageFiles(source);for(const path of ['benchmarks/practical-challenges.json',...inventory().map(f=>'benchmarks/challenge-candidates/ui-reconstruction-v1/workspace/'+f.path),'benchmarks/challenge-candidates/ui-reconstruction-v1/evaluator-v2/score.mjs'])assert.ok(files.includes(path),path);
 assert.equal(files.some(p=>/reference-private|成長マップ|library-helpers-private/.test(p)),false);
 assert.equal(existsSync(join(root,'workspace/app')),false);
});
