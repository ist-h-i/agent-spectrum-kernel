// Evaluation summaries of original scores; never a raw task scorer or authority.
import assert from 'node:assert/strict';
export const PROMPT_REPETITION_POLICY=Object.freeze({kind:'personal_prompt_repetition_policy_v1',quality_scale:100,gain_min:2,loss_margin:2,resource_ratio_max:1.10,epsilon:1e-12,
 interval:'approximate_two_sided_t95_task_cluster',resources:'all_attempted_P_K_F_plus_measured_shared_evaluation_overhead',role_order:'baseline_all_then_challenger_all',causal_claim:'not_claimed'});
const T={1:12.706,2:4.303,3:3.182,4:2.776,5:2.571,6:2.447,7:2.365,8:2.306,9:2.262,10:2.228,11:2.201,12:2.179,13:2.160,14:2.145,15:2.131,16:2.120,17:2.110,18:2.101,19:2.093,20:2.086,21:2.080,22:2.074,23:2.069};
const le=(a,b)=>a<=b+1e-12,lt=(a,b)=>a<b-1e-12;
export function promptRepetitionInterval(values){assert.ok(values.length>=2&&values.length<=24&&values.every(Number.isFinite));const n=values.length,mean=values.reduce((a,b)=>a+b,0)/n;const sd=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(n-1));const w=T[n-1]*sd/Math.sqrt(n);return{mean,lower:mean-w,upper:mean+w,units:n,df:n-1};}
export function summarizePromptRepetitions({fixtureIds,repetitions,cells,auxiliary}){
 assert.ok(Array.isArray(fixtureIds)&&fixtureIds.length>=1&&fixtureIds.length<=24&&new Set(fixtureIds).size===fixtureIds.length);assert.ok(Number.isSafeInteger(repetitions)&&repetitions>=2&&repetitions<=8);assert.equal(cells.length,fixtureIds.length*repetitions*2,'exact full planned denominator required');
 const by=new Map(cells.map(c=>[`${c.repeat}:${c.fixture_id}:${c.role}`,c]));assert.equal(by.size,cells.length,'duplicate matrix cell');
 const qualityRows=[],modeRows=new Map();let completePairs=0,complete=true,safetyComplete=true,unsafe=false,mandatory=false;
 for(const id of fixtureIds){const deltas=[];let mode=null;
  for(let repeat=0;repeat<repetitions;repeat++){
   const a=by.get(`${repeat}:${id}:baseline`),b=by.get(`${repeat}:${id}:challenger`);assert.ok(a&&b,'full planned denominator required');
   for(const c of [a,b]){if(c.safety!=='pass')safetyComplete=false;if(c.role==='challenger'&&c.safety==='fail')unsafe=true;if(c.role==='challenger'&&c.mandatory_failure)mandatory=true;}
   if(a.quality===null||b.quality===null){complete=false;continue;}
   assert.ok([a.quality,b.quality].every(x=>Number.isFinite(x)&&x>=0&&x<=1),'invalid original normalized quality');
   completePairs++;assert.equal(a.active_file,b.active_file,'role mode mismatch');mode=b.active_file;deltas.push((b.quality-a.quality)*100);
  }
  if(deltas.length===repetitions){const row={fixture_id:id,mean:deltas.reduce((a,b)=>a+b,0)/repetitions,deltas};qualityRows.push(row);if(!modeRows.has(mode))modeRows.set(mode,[]);modeRows.get(mode).push(row);}
 }
 const main=complete?promptRepetitionInterval(fixtureIds.length>1?qualityRows.map(x=>x.mean):qualityRows[0].deltas):null;
 const modes=complete?Object.fromEntries([...modeRows].map(([mode,rows])=>[mode,{...promptRepetitionInterval(rows.length>1?rows.map(x=>x.mean):rows[0].deltas),scope:rows.length>1?'finite_task_means':'sole_task_repeats_only'}])):{};
 const qualityHarm=main&&(lt(main.upper,0)||Object.values(modes).some(x=>lt(x.upper,-2)));
 const modeClosed=main&&Object.values(modes).every(x=>le(-2,x.lower));
 const quality=mandatory?'contradicted':!complete?'unknown':qualityHarm?'regressed':modeClosed&&le(2,main.mean)&&lt(0,main.lower)?'improved':modeClosed&&le(-2,main.lower)&&le(main.upper,2)?'retained':'observed';
 let resourceIntervals=null,resourceComplete=Boolean(auxiliary?.overhead?.status==='known');
 const ratios={tokens:[],duration_ms:[],cost_microunits:[]};
 if(resourceComplete)for(const id of fixtureIds){const totals={baseline:{tokens:0,duration_ms:0,cost_microunits:0},challenger:{tokens:0,duration_ms:0,cost_microunits:0}};
  for(let repeat=0;repeat<repetitions;repeat++)for(const role of ['baseline','challenger']){
   const cell=by.get(`${repeat}:${id}:${role}`),aux=auxiliary.cells.find(x=>x.repeat===repeat&&x.fixture_id===id&&x.role===role);
   if(!cell.resources_complete||aux?.monetary_cost?.status!=='known'){resourceComplete=false;continue;}
   totals[role].tokens+=cell.tokens;totals[role].duration_ms+=cell.duration_ms;totals[role].cost_microunits+=aux.monetary_cost.value;
  }
  for(const k of Object.keys(ratios))for(const role of ['baseline','challenger'])totals[role][k]+=auxiliary.overhead[k]/(2*fixtureIds.length);
  for(const k of Object.keys(ratios)){if(totals.baseline[k]<=0||(k!=='cost_microunits'&&totals.challenger[k]<=0)){resourceComplete=false;continue;}ratios[k].push(totals.challenger[k]/totals.baseline[k]);}
 }
 // A one-task scope uses per-repeat ratios; no generalization to other tasks.
 if(resourceComplete&&fixtureIds.length===1){for(const k of Object.keys(ratios))ratios[k]=[];for(let repeat=0;repeat<repetitions;repeat++){
  const totals={};for(const role of ['baseline','challenger']){const c=by.get(`${repeat}:${fixtureIds[0]}:${role}`),a=auxiliary.cells.find(x=>x.repeat===repeat&&x.fixture_id===fixtureIds[0]&&x.role===role);totals[role]={tokens:c.tokens,duration_ms:c.duration_ms,cost_microunits:a.monetary_cost.value};for(const k of Object.keys(ratios))totals[role][k]+=auxiliary.overhead[k]/(2*repetitions);}
  for(const k of Object.keys(ratios)){if(totals.baseline[k]<=0||(k!=='cost_microunits'&&totals.challenger[k]<=0)){resourceComplete=false;continue;}ratios[k].push(totals.challenger[k]/totals.baseline[k]);}
 }}
 if(resourceComplete)resourceIntervals=Object.fromEntries(Object.entries(ratios).map(([k,v])=>[k,promptRepetitionInterval(v)]));
 const resourceHarm=resourceComplete&&Object.values(resourceIntervals).some(x=>lt(1.10,x.lower));
 const cost=resourceHarm?'regressed':resourceComplete&&Object.values(resourceIntervals).every(x=>le(x.upper,1.10))?'retained':resourceComplete?'observed':'unknown';
 let rubricComplete=Boolean(auxiliary),rubricHarm=false,rubricSevere=false,rubricUnknown=0;const violations={baseline:0,challenger:0};
 if(auxiliary)for(const row of auxiliary.cells){if(row.rubric.status!=='complete'){rubricComplete=false;rubricUnknown++;}else violations[row.role]+=row.rubric.violations;if(row.role==='challenger'&&row.rubric.severe)rubricSevere=true;}
 if(rubricComplete)rubricHarm=violations.challenger>violations.baseline;
 return {coverage:{planned_cells:fixtureIds.length*repetitions*2,scored_cells:cells.filter(c=>c.quality!==null).length,complete_pairs:completePairs},quality:{status:mandatory||complete?'complete':'insufficient_evidence',conclusion:quality,interval:main,modes},
 safety:{status:unsafe||rubricSevere||safetyComplete?'complete':'insufficient_evidence',conclusion:unsafe||rubricSevere?'unsafe':safetyComplete?'observed':'unknown'},
 cost:{status:resourceComplete?'complete':'insufficient_evidence',conclusion:cost,intervals:resourceIntervals},variance:{status:complete?'complete':'unavailable',conclusion:complete?'observed':'unavailable'},
 mechanism:{status:rubricComplete?'complete':'unavailable',conclusion:rubricComplete?(rubricHarm?'regressed':'retained'):'unavailable',violations:auxiliary?violations:null,unknown_cells:auxiliary?rubricUnknown:cells.length}};
}
