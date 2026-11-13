// Evidence calculator, not a UI runner or a semantic truth verifier.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const keys=(o,expected)=>{assert.ok(o&&typeof o==='object'&&!Array.isArray(o),'object required');assert.deepEqual(Object.keys(o).sort(),[...expected].sort(),'unexpected or missing assessment keys');};
const nonempty=s=>assert.ok(typeof s==='string'&&s.trim(),'nonempty evidence text required');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`rubric weights changed: ${a} != ${b}`);
// Normalize only numerical noise at exact maximum totals; never round item evidence.
const atMaximum=(value,maximum)=>Math.abs(value-maximum)<1e-9?maximum:value;
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const rubricDigest=r=> 'sha256:'+createHash('sha256').update(JSON.stringify(canonical(r))).digest('hex');
function evidence(rows){
 assert.ok(Array.isArray(rows)&&rows.length>0,'observed decisions require evidence');
 for(const row of rows){keys(row,['artifact','observation']);nonempty(row.artifact);nonempty(row.observation);}
}
function validateRubric(r){
 assert.equal(r.kind,'ch08_semantic_rubric_v2');assert.equal(r.version,'2.0.0');assert.equal(r.maximum,100);
 assert.deepEqual(r.categories,{functional:40,ux:60});
 assert.ok(Array.isArray(r.requirements)&&r.requirements.length===18,'18 requirements required');
 const fWeights=[8,8,10,5,10,10,5,6,4,4].map(n=>n*40/70),uWeights=[8,10,6,6,7,8,8,7],uCounts=[4,5,5,4,5,6,5,6];
 const ids=new Set(),checkIds=new Set();
 for(const spec of r.requirements){
  assert.ok(!ids.has(spec.id),'duplicate rubric requirement');ids.add(spec.id);
  const match=/^([FU])(\d{2})$/.exec(spec.id);assert.ok(match,'unknown rubric requirement');
  const i=Number(match[2])-1,ux=match[1]==='U';assert.ok(i>=0&&i<(ux?8:10),'unknown rubric requirement');
  assert.equal(spec.category,ux?'ux':'functional');assert.ok(Number.isFinite(spec.weight)&&spec.weight>0);close(spec.weight,(ux?uWeights:fWeights)[i]);
  assert.ok(Array.isArray(spec.checks));assert.equal(spec.checks.length,ux?uCounts[i]:4);
  const expected=new Set(spec.checks.map((_,j)=>`${spec.id}.${j+1}`));
  for(const c of spec.checks){assert.ok(expected.has(c.id)&&!checkIds.has(c.id),'unknown/duplicate rubric checkpoint');checkIds.add(c.id);}
 }
 close(r.requirements.reduce((s,v)=>s+v.weight,0),100);
 for(const [id,max] of Object.entries(r.categories))close(r.requirements.filter(v=>v.category===id).reduce((s,v)=>s+v.weight,0),max);
 assert.ok(Array.isArray(r.task_na));const na=new Set(r.task_na);assert.equal(na.size,r.task_na.length,'duplicate task NA');
 for(const id of na)assert.ok(checkIds.has(id)&&id.startsWith('U'),'NA requires a known UX checkpoint');
 const blockers=['data_loss','unapproved_judgment','external_dependency','unsafe_export','unsaved_input_loss','misleading_state'];
 assert.deepEqual(Object.keys(r.release_blocker_rules).sort(),blockers.sort(),'blocker rules changed');
 for(const value of Object.values(r.release_blocker_rules))nonempty(value);
 return na;
}
export function score(rubric,assessment){
 const na=validateRubric(rubric);
 keys(assessment,['kind','meta','requirements','release_blockers']);assert.equal(assessment.kind,'ch08_assessor_decisions_v2');
 keys(assessment.meta,['candidate_id','assessment_mode','rubric_version']);nonempty(assessment.meta.candidate_id);assert.ok(['prospective','retrospective'].includes(assessment.meta.assessment_mode));assert.equal(assessment.meta.rubric_version,rubric.version,'rubric version mismatch');
 assert.ok(Array.isArray(assessment.requirements));assert.equal(assessment.requirements.length,rubric.requirements.length,'all rubric items required');
 const decisions=new Map();for(const row of assessment.requirements){keys(row,['id','checks']);assert.ok(!decisions.has(row.id),'duplicate requirement');decisions.set(row.id,row);}
 const categories=Object.fromEntries(Object.entries(rubric.categories).map(([id,maximum])=>[id,{maximum,known_points:0,missing_weight:0,score:null}]));
 const requirements=rubric.requirements.map(spec=>{
  const row=decisions.get(spec.id);assert.ok(row,'missing/unknown requirement');assert.ok(Array.isArray(row.checks));assert.equal(row.checks.length,spec.checks.length,'all checkpoints required');
  const applicable=spec.checks.filter(c=>!na.has(c.id)).length;
  const each=applicable?spec.weight/applicable:0;
  let points=0,missing=applicable?0:spec.weight;const seen=new Set();
  for(const c of row.checks){
   assert.ok(spec.checks.some(s=>s.id===c.id)&&!seen.has(c.id),'unknown/duplicate checkpoint');seen.add(c.id);
   assert.ok(['pass','partial','fail','unknown','na'].includes(c.status),'invalid checkpoint status');
   assert.equal(c.status==='na',na.has(c.id),'NA must match the comparison-wide task declaration');
   if(c.status==='na'){keys(c,['id','status','reason','evidence']);nonempty(c.reason);evidence(c.evidence);}
   else if(c.status==='unknown'){keys(c,['id','status','missing','next_check']);nonempty(c.missing);nonempty(c.next_check);missing+=each;}
   else if(c.status==='partial'){assert.equal(spec.category,'ux','partial is UX-only');keys(c,['id','status','limitation','evidence']);nonempty(c.limitation);evidence(c.evidence);points+=each*.5;}
   else{keys(c,['id','status','evidence']);evidence(c.evidence);if(c.status==='pass')points+=each;}
  }
  const cat=categories[spec.category];cat.known_points+=points;cat.missing_weight+=missing;
  return {id:spec.id,category:spec.category,maximum:spec.weight,applicable_checks:applicable,na_checks:spec.checks.length-applicable,status:!applicable?'not_applicable':missing?'unknown':Math.abs(points-spec.weight)<1e-9?'met':points?'partial':'unmet',points,missing_weight:missing};
 });
 for(const cat of Object.values(categories)){cat.known_points=atMaximum(cat.known_points,cat.maximum);cat.score=cat.missing_weight?null:cat.known_points;}
 assert.ok(Array.isArray(assessment.release_blockers));const rules=Object.keys(rubric.release_blocker_rules),seen=new Set();assert.equal(assessment.release_blockers.length,rules.length,'all blocker observations required');
 for(const row of assessment.release_blockers){
  assert.ok(rules.includes(row.id)&&!seen.has(row.id),'unknown/duplicate blocker');seen.add(row.id);assert.ok(['observed','clear','unknown'].includes(row.status),'invalid blocker status');
  if(row.status==='unknown'){keys(row,['id','status','missing','next_check']);nonempty(row.missing);nonempty(row.next_check);}
  else{keys(row,['id','status','evidence']);evidence(row.evidence);}
 }
 const known_points=atMaximum(requirements.reduce((s,r)=>s+r.points,0),rubric.maximum),missing_weight=requirements.reduce((s,r)=>s+r.missing_weight,0);
 const blocked=assessment.release_blockers.some(r=>r.status==='observed'),unknownBlocker=assessment.release_blockers.some(r=>r.status==='unknown');
 return {kind:'ch08_score_v2',rubric_version:rubric.version,rubric_digest:rubricDigest(rubric),meta:{...assessment.meta},known_points,missing_weight,quality_score:missing_weight?null:known_points,categories,requirements,release_blockers:assessment.release_blockers,
  release_status:blocked?'blocked':unknownBlocker?'unknown':'no_observed_blockers',blocker_gate_passed:blocked?false:unknownBlocker||missing_weight?null:true,semantic_truth_verified_by_calculator:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const [,,rubric,assessment]=process.argv;assert.ok(rubric&&assessment,'usage: node score.mjs RUBRIC ASSESSMENT');console.log(JSON.stringify(score(JSON.parse(readFileSync(rubric)),JSON.parse(readFileSync(assessment))),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
