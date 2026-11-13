import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {score,rubricDigest} from '../evaluator-v2/score.mjs';
const clone=x=>structuredClone(x);
const ev=[{artifact:'synthetic/check',observation:'Calculator test only, not a rendered UI or model result.'}];
function fixture(){
 const functional=[8,8,10,5,10,10,5,6,4,4].map((weight,i)=>({id:`F${String(i+1).padStart(2,'0')}`,category:'functional',weight:weight*40/70,checks:Array.from({length:4},(_,j)=>({id:`F${String(i+1).padStart(2,'0')}.${j+1}`}))}));
 const ux=[8,10,6,6,7,8,8,7].map((weight,i)=>({id:`U${String(i+1).padStart(2,'0')}`,category:'ux',weight,checks:Array.from({length:[4,5,5,4,5,6,5,6][i]},(_,j)=>({id:`U${String(i+1).padStart(2,'0')}.${j+1}`}))}));
 const rubric={kind:'ch08_semantic_rubric_v2',version:'2.0.0',maximum:100,categories:{functional:40,ux:60},requirements:[...functional,...ux],task_na:[],release_blocker_rules:Object.fromEntries(['data_loss','unapproved_judgment','external_dependency','unsafe_export','unsaved_input_loss','misleading_state'].map(id=>[id,'Synthetic rule']))};
 const assessment={kind:'ch08_assessor_decisions_v2',meta:{candidate_id:'synthetic',assessment_mode:'retrospective',rubric_version:'2.0.0'},requirements:rubric.requirements.map(r=>({id:r.id,checks:r.checks.map(c=>({id:c.id,status:'pass',evidence:clone(ev)}))})),release_blockers:Object.keys(rubric.release_blocker_rules).map(id=>({id,status:'clear',evidence:clone(ev)}))};
 return {rubric,assessment};
}
const check=(a,id)=>a.requirements.flatMap(r=>r.checks).find(c=>c.id===id);
const near=(a,b)=>assert.ok(Math.abs(a-Number(b.toFixed(6)))<1e-9,`${a} != ${b} at six-decimal output precision`);
test('v2 all pass and all fail keep 40/60, provenance and no semantic certification',()=>{
 const {rubric,assessment}=fixture(),r=score(rubric,assessment);near(r.quality_score,100);near(r.categories.functional.score,40);near(r.categories.ux.score,60);assert.equal(r.blocker_gate_passed,true);assert.equal(r.semantic_truth_verified_by_calculator,false);assert.equal(r.meta.assessment_mode,'retrospective');assert.equal(r.rubric_digest,rubricDigest(rubric));
 for(const c of assessment.requirements.flatMap(x=>x.checks))c.status='fail';near(score(rubric,assessment).quality_score,0);
});
test('each checkpoint changes arithmetic, including all forty UX criteria',()=>{
 const {rubric}=fixture();assert.equal(rubric.requirements.filter(r=>r.category==='ux').reduce((n,r)=>n+r.checks.length,0),40);
 for(const r of rubric.requirements)for(const c of r.checks){const {assessment}=fixture();check(assessment,c.id).status='fail';near(score(rubric,assessment).quality_score,100-r.weight/r.checks.length);}
});
test('UX partial requires confirmed limitation; functional partial and evidence-free claims rejected',()=>{
 const {rubric,assessment}=fixture();Object.assign(check(assessment,'U01.1'),{status:'partial',limitation:'Confirmed friction in synthetic input'});near(score(rubric,assessment).quality_score,99);
 delete check(assessment,'U01.1').limitation;assert.throws(()=>score(rubric,assessment));
 const f=fixture();Object.assign(check(f.assessment,'F01.1'),{status:'partial',limitation:'test'});assert.throws(()=>score(f.rubric,f.assessment),/UX-only/);
 const p=fixture();check(p.assessment,'U01.1').evidence=[];assert.throws(()=>score(p.rubric,p.assessment),/evidence/);
});
test('unknown remains denominator weight and total is null, not a partial pass',()=>{
 const {rubric,assessment}=fixture();Object.assign(check(assessment,'U01.1'),{status:'unknown',missing:'No state observation',next_check:'Observe state'});delete check(assessment,'U01.1').evidence;
 const r=score(rubric,assessment);assert.equal(r.quality_score,null);near(r.known_points,98);assert.equal(r.missing_weight,2);assert.equal(r.categories.ux.score,null);assert.equal(r.blocker_gate_passed,null);assert.equal(r.categories.functional.missing_weight,0);
});
test('NA is common task declaration only and reweights inside the same domain',()=>{
 const {rubric,assessment}=fixture();const c=check(assessment,'U01.1');Object.assign(c,{status:'na',reason:'No applicable task requirement'});assert.throws(()=>score(rubric,assessment),/NA/);
 rubric.task_na=['U01.1'];near(score(rubric,assessment).quality_score,100);
 check(assessment,'U01.2').status='fail';near(score(rubric,assessment).quality_score,100-8/3);
 const other=fixture().assessment;assert.throws(()=>score(rubric,other),/NA/);
 rubric.task_na.push('F01.1');assert.throws(()=>score(rubric,assessment),/UX/);
});
test('all NA domain is unscored, never free points or cross-domain redistribution',()=>{
 const {rubric,assessment}=fixture();rubric.task_na=['U01.1','U01.2','U01.3','U01.4'];for(const id of rubric.task_na)Object.assign(check(assessment,id),{status:'na',reason:'Synthetic whole domain not applicable'});
 const r=score(rubric,assessment);assert.equal(r.quality_score,null);near(r.known_points,92);assert.equal(r.missing_weight,8);assert.equal(r.requirements.find(x=>x.id==='U01').status,'not_applicable');near(r.categories.functional.score,40);assert.equal(r.blocker_gate_passed,null);
});
test('observed blockers override points; unknown blocks positive blocker gate',()=>{
 const {rubric,assessment}=fixture();assessment.release_blockers[0].status='observed';let r=score(rubric,assessment);near(r.quality_score,100);assert.equal(r.blocker_gate_passed,false);assert.equal(r.release_status,'blocked');
 assessment.release_blockers[0]={id:'data_loss',status:'unknown',missing:'No observation',next_check:'Exercise persistence'};r=score(rubric,assessment);assert.equal(r.release_status,'unknown');assert.equal(r.blocker_gate_passed,null);
 assessment.release_blockers[1].status='observed';assert.equal(score(rubric,assessment).blocker_gate_passed,false);
});
test('strict schemas reject extra, missing, duplicate, unknown IDs, malformed weights and nonfinite values',()=>{
 for(const mutate of [
  (r,a)=>a.requirements.push(clone(a.requirements[0])),(r,a)=>a.requirements[1].id='F01',(r,a)=>a.requirements[0].checks[1].id='F01.1',
  (r,a)=>a.requirements[0].checks[0].id='F99.1',(r,a)=>a.requirements[0].checks[0].points=1,(r,a)=>a.release_blockers.pop(),
  (r,a)=>a.release_blockers[1].id='data_loss',(r,a)=>a.meta.extra=true,(r,a)=>a.meta.assessment_mode='invented',
  (r)=>r.requirements[0].weight=NaN,(r)=>r.requirements[0].weight=Infinity,(r)=>r.requirements[0].weight=0,
  (r)=>r.requirements[0].weight+=1,(r)=>r.requirements[0].id='F99',(r)=>r.requirements[1].id='F01',
  (r)=>r.requirements[0].checks[0].id='F99.1',(r)=>r.task_na=['U01.1','U01.1'],(r)=>r.release_blocker_rules.extra='No',
 ]){const {rubric,assessment}=fixture();mutate(rubric,assessment);assert.throws(()=>score(rubric,assessment));}
});
test('version boundaries reject legacy inputs and mismatched version',()=>{
 const {rubric,assessment}=fixture();assessment.kind='ch08_assessor_decisions_v1';assert.throws(()=>score(rubric,assessment));assessment.kind='ch08_assessor_decisions_v2';assessment.meta.rubric_version='1.0.0';assert.throws(()=>score(rubric,assessment),/version/);assessment.meta.rubric_version='2.0.0';rubric.kind='ch08_semantic_rubric_v1';assert.throws(()=>score(rubric,assessment));
});
test('canonical digest is order independent and changes for criteria changes',()=>{
 const {rubric}=fixture();assert.equal(rubricDigest(rubric),rubricDigest(Object.fromEntries(Object.entries(rubric).reverse())));const changed=clone(rubric);changed.requirements[0].checks[0].acceptance='changed';assert.notEqual(rubricDigest(rubric),rubricDigest(changed));
});

test('published v2 rubric integrates with the calculator',()=>{
 const rubric=JSON.parse(readFileSync(new URL('../evaluator-v2/rubric.json',import.meta.url)));const {assessment}=fixture();const r=score(rubric,assessment);near(r.quality_score,100);assert.equal(r.requirements.length,18);assert.equal(r.requirements.reduce((n,x)=>n+x.applicable_checks,0),80);
});

test('requirement order preserves exact all-pass maxima for strict downstream comparisons',()=>{
 const {rubric,assessment}=fixture();rubric.requirements.reverse();assessment.requirements.reverse();const r=score(rubric,assessment);assert.equal(r.quality_score,100);assert.equal(r.known_points,100);assert.equal(r.categories.functional.score,40);assert.equal(r.categories.functional.known_points,40);assert.equal(r.categories.ux.score,60);assert.equal(r.categories.ux.known_points,60);
});
test('clear blocker gate at zero points is not an adoption or release approval',()=>{
 const {rubric,assessment}=fixture();for(const c of assessment.requirements.flatMap(x=>x.checks))c.status='fail';const r=score(rubric,assessment);assert.equal(r.quality_score,0);assert.equal(r.blocker_gate_passed,true);assert.equal(Object.hasOwn(r,'release_eligible'),false);assert.equal(r.release_status,'no_observed_blockers');
});

test('fractional functional failures serialize bounded decimals for the standard importer',()=>{
 const {rubric,assessment}=fixture();check(assessment,'F01.1').status='fail';const r=score(rubric,assessment);assert.equal(r.known_points,98.857143);assert.equal(r.quality_score,98.857143);assert.equal(r.categories.functional.score,38.857143);assert.match(String(r.known_points),/^\d{1,12}(?:\.\d{1,6})?$/u);
});
test('output quantization is final-only; unknown weights remain missing and total null',()=>{
 const {rubric,assessment}=fixture();for(const id of ['F03.1','F03.2','F03.3']){const c=check(assessment,id);c.status='unknown';delete c.evidence;Object.assign(c,{missing:'No observed branch',next_check:'Exercise branch'});}
 const r=score(rubric,assessment);assert.equal(r.missing_weight,4.285714);assert.notEqual(r.missing_weight,3*Number((rubric.requirements[2].weight/4).toFixed(6)));assert.equal(r.quality_score,null);
 const walk=x=>{if(typeof x==='number')assert.match(String(x),/^\d{1,12}(?:\.\d{1,6})?$/u);else if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')Object.values(x).forEach(walk);};walk(r);
});
