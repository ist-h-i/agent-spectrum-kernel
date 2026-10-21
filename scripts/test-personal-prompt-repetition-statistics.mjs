import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizePromptRepetitions,promptRepetitionInterval} from './ask-personal-prompt-repetition-statistics.mjs';
const fixtureIds=['a','b'];
function fixture(change=()=>{}){
 const cells=[];for(let repeat=0;repeat<3;repeat++)for(const id of fixtureIds)for(const role of ['baseline','challenger'])cells.push({repeat,fixture_id:id,role,quality:role==='baseline'?0.5:0.6,safety:'pass',mandatory_failure:false,active_file:id==='a'?'AGENTS.md':'CLAUDE.md',resources_complete:true,tokens:100,duration_ms:100});
 const auxiliary={cells:cells.map(c=>({repeat:c.repeat,fixture_id:c.fixture_id,role:c.role,rubric:{status:'complete',violations:0,severe:false},monetary_cost:{status:'known',value:100}})),overhead:{status:'known',tokens:0,duration_ms:0,cost_microunits:0}};
 change(cells,auxiliary);return summarizePromptRepetitions({fixtureIds,repetitions:3,cells,auxiliary});
}
test('fixed task weighting, scale, intervals and mode scope',()=>{
 const r=fixture();assert.equal(r.quality.conclusion,'improved');assert.ok(Math.abs(r.quality.interval.mean-10)<1e-10);assert.equal(r.quality.interval.units,2);assert.equal(r.quality.modes['CLAUDE.md'].scope,'sole_task_repeats_only');assert.equal(r.cost.conclusion,'retained');assert.equal(r.mechanism.conclusion,'retained');assert.deepEqual(r.coverage,{planned_cells:12,scored_cells:12,complete_pairs:6});
 assert.deepEqual(promptRepetitionInterval([1,1,1]),{mean:1,lower:1,upper:1,units:3,df:2});
});
test('neutral, harmful, overlapping, safety and mandatory results stay distinct',()=>{
 assert.equal(fixture(cs=>cs.forEach(c=>c.quality=0.5)).quality.conclusion,'retained');
 assert.equal(fixture(cs=>cs.filter(c=>c.role==='challenger').forEach(c=>c.quality=0.4)).quality.conclusion,'regressed');
 assert.equal(fixture(cs=>cs.filter(c=>c.role==='challenger').forEach(c=>c.quality=c.repeat===0?0.1:0.9)).quality.conclusion,'observed');
 assert.equal(fixture(cs=>{cs[1].safety='fail';}).safety.conclusion,'unsafe');
 assert.equal(fixture(cs=>{cs[1].mandatory_failure=true;}).quality.conclusion,'contradicted');
 assert.equal(fixture((cs,a)=>{a.cells[1].rubric.severe=true;}).safety.conclusion,'unsafe');
 assert.equal(fixture((cs,a)=>{a.cells[1].rubric.violations=1;}).mechanism.conclusion,'regressed');
 const totals=fixture((cs,a)=>{a.cells[0].rubric.violations=2;a.cells[3].rubric.violations=1;});assert.equal(totals.mechanism.conclusion,'retained');assert.deepEqual(totals.mechanism.violations,{baseline:2,challenger:1});
});
test('incomplete pairs preserve known partial denominator and never impute zero',()=>{
 const r=fixture(cs=>{cs[1].quality=null;cs[1].safety='unknown';});assert.deepEqual(r.coverage,{planned_cells:12,scored_cells:11,complete_pairs:5});assert.equal(r.quality.conclusion,'unknown');assert.equal(r.quality.interval,null);assert.equal(r.safety.conclusion,'unknown');
});
test('all attempted resources, uncertainty, zero and declared tolerance',()=>{
 assert.equal(fixture(cs=>cs.filter(c=>c.role==='challenger').forEach(c=>c.tokens=111)).cost.conclusion,'regressed');
 assert.equal(fixture(cs=>cs.filter(c=>c.role==='challenger').forEach(c=>c.tokens=110)).cost.conclusion,'retained');
 assert.equal(fixture(cs=>{cs[0].resources_complete=false;cs[0].tokens=null;}).cost.conclusion,'unknown');
 assert.equal(fixture(cs=>cs.filter(c=>c.role==='baseline').forEach(c=>c.tokens=0)).cost.conclusion,'unknown');
 assert.equal(fixture(cs=>cs.filter(c=>c.role==='challenger').forEach(c=>c.tokens=0)).cost.conclusion,'unknown');
 assert.equal(fixture((cs,a)=>a.cells.forEach(c=>{if(c.role==='challenger')c.monetary_cost.value=0;})).cost.conclusion,'retained');
 assert.equal(fixture((cs,a)=>{a.overhead.status='unknown';}).cost.conclusion,'unknown');
 assert.equal(fixture((cs,a)=>{a.cells[0].monetary_cost.status='unknown';}).cost.conclusion,'unknown');
});

test('24-task denominator uses24 task means, never72 independent tasks',()=>{
 const fixtureIds=Array.from({length:24},(_,i)=>`synthetic-task-${i}`),cells=[];
 for(let repeat=0;repeat<3;repeat++)for(const id of fixtureIds)for(const role of ['baseline','challenger'])cells.push({repeat,fixture_id:id,role,quality:role==='baseline'?0.5:0.6,safety:'pass',mandatory_failure:false,active_file:'skill-implement.md',resources_complete:false,tokens:null,duration_ms:null});
 let r=summarizePromptRepetitions({fixtureIds,repetitions:3,cells,auxiliary:null});assert.deepEqual(r.coverage,{planned_cells:144,scored_cells:144,complete_pairs:72});assert.equal(r.quality.interval.units,24);assert.equal(r.quality.interval.df,23);assert.equal(r.cost.conclusion,'unknown');
 cells[1].quality=null;r=summarizePromptRepetitions({fixtureIds,repetitions:3,cells,auxiliary:null});assert.deepEqual(r.coverage,{planned_cells:144,scored_cells:143,complete_pairs:71});assert.equal(r.quality.conclusion,'unknown');assert.equal(r.quality.interval,null);
});
