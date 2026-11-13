// Validates and totals an independent assessor's observations. Never runs a UI,
// a submission, a model, or a keyword-based semantic grader.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const keys=(o,expected)=>assert.deepEqual(Object.keys(o).sort(),[...expected].sort(),'unexpected or missing assessment keys');
const nonempty=s=>assert.ok(typeof s==='string'&&s.trim(),'nonempty evidence text required');
function evidence(rows){
 assert.ok(Array.isArray(rows)&&rows.length>0,'observed decisions require evidence');
 for(const row of rows){keys(row,['artifact','observation']);nonempty(row.artifact);nonempty(row.observation);}
}
export function score(rubric,assessment){
 assert.equal(rubric.kind,'ch08_semantic_rubric_v1');assert.equal(rubric.maximum,100);
 keys(assessment,['kind','requirements','release_blockers']);assert.equal(assessment.kind,'ch08_assessor_decisions_v1');
 assert.ok(Array.isArray(assessment.requirements));assert.equal(assessment.requirements.length,rubric.requirements.length,'all rubric items required');
 const decisions=new Map();
 for(const item of assessment.requirements){keys(item,['id','checks']);assert.ok(!decisions.has(item.id),'duplicate requirement');decisions.set(item.id,item);}
 const categories=Object.fromEntries(Object.entries(rubric.categories).map(([id,maximum])=>[id,{maximum,known_points:0,missing_weight:0,score:null}]));
 const requirements=rubric.requirements.map(spec=>{
  const row=decisions.get(spec.id);assert.ok(row,'missing/unknown requirement');assert.equal(row.checks.length,spec.checks.length,'all checkpoints required');
  const seen=new Set();let points=0,missing=0,passed=0;
  for(const c of row.checks){
   assert.ok(spec.checks.some(s=>s.id===c.id)&&!seen.has(c.id),'unknown/duplicate checkpoint');seen.add(c.id);
   assert.ok(['pass','fail','unknown'].includes(c.status),'invalid checkpoint status');
   if(c.status==='unknown'){keys(c,['id','status','missing','next_check']);nonempty(c.missing);nonempty(c.next_check);missing+=spec.weight/spec.checks.length;}
   else{keys(c,['id','status','evidence']);evidence(c.evidence);if(c.status==='pass'){points+=spec.weight/spec.checks.length;passed++;}}
  }
  const cat=categories[spec.category];assert.ok(cat);cat.known_points+=points;cat.missing_weight+=missing;
  return {id:spec.id,category:spec.category,status:missing?'unknown':passed===spec.checks.length?'met':passed?'partial':'unmet',points,missing_weight:missing};
 });
 assert.equal(rubric.requirements.reduce((s,r)=>s+r.weight,0),100,'rubric weights changed');
 for(const [id,cat] of Object.entries(categories)){assert.equal(rubric.requirements.filter(r=>r.category===id).reduce((s,r)=>s+r.weight,0),cat.maximum);cat.score=cat.missing_weight?null:cat.known_points;}
 assert.ok(Array.isArray(assessment.release_blockers));const rules=Object.keys(rubric.release_blocker_rules),seen=new Set();
 assert.equal(assessment.release_blockers.length,rules.length,'all blocker observations required');
 for(const row of assessment.release_blockers){
  assert.ok(rules.includes(row.id)&&!seen.has(row.id),'unknown/duplicate blocker');seen.add(row.id);
  assert.ok(['observed','clear','unknown'].includes(row.status));
  if(row.status==='unknown'){keys(row,['id','status','missing','next_check']);nonempty(row.missing);nonempty(row.next_check);}
  else{keys(row,['id','status','evidence']);evidence(row.evidence);}
 }
 const known_points=requirements.reduce((s,r)=>s+r.points,0),missing_weight=requirements.reduce((s,r)=>s+r.missing_weight,0);
 return {kind:'ch08_score_v1',known_points,missing_weight,quality_score:missing_weight?null:known_points,categories,requirements,
  release_blockers:assessment.release_blockers,release_status:assessment.release_blockers.some(r=>r.status==='observed')?'blocked':assessment.release_blockers.some(r=>r.status==='unknown')?'unknown':'no_observed_blockers',
  semantic_truth_verified_by_calculator:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const [, ,rubric,assessment]=process.argv;assert.ok(rubric&&assessment,'usage: node score.mjs RUBRIC ASSESSMENT');console.log(JSON.stringify(score(JSON.parse(readFileSync(rubric)),JSON.parse(readFileSync(assessment))),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
