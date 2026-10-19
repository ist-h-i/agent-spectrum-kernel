import {performance} from 'node:perf_hooks';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../src/event-lookup.mjs',import.meta.url));
const candidate_source_digest='sha256:'+createHash('sha256').update(source).digest('hex');
const {lookupEvents:candidate}=await import('data:text/javascript;base64,'+source.toString('base64'));import {lookupEvents as reference} from '../reference/scan-lookup.mjs';import {makeData} from './generate-data.mjs';
const config=JSON.parse(readFileSync(new URL('../data/measurement-config.json',import.meta.url),'utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const records=[];let inconclusive=false,regression=false;
for(const workload of config.workloads){
 const {rows,queries}=makeData(workload),expected=reference(rows,queries);assert.deepEqual(candidate(rows,queries),expected);
 for(let index=0;index<config.warmups;index++){candidate(rows,queries);reference(rows,queries)}
 const durations={candidate:[],reference:[]};let consumed=0;
 const measure=(name,fn)=>{const start=performance.now(),result=fn(rows,queries),duration=performance.now()-start;assert.deepEqual(result,expected);consumed+=result.reduce((count,group)=>count+group.events.length,0);durations[name].push(duration)};
 for(let index=0;index<config.samples;index++){if(index%2){measure('reference',reference);measure('candidate',candidate)}else{measure('candidate',candidate);measure('reference',reference)}}
 const baseline=median(durations.reference),improved=median(durations.candidate),ratio=improved/baseline;
 const dispersion=name=>Math.max(...durations[name])/Math.max(Math.min(...durations[name]),Number.EPSILON);
 const bounded=Number.isFinite(ratio)&&baseline>=config.minimum_baseline_ms&&Object.keys(durations).every(name=>dispersion(name)<=config.maximum_dispersion_ratio);
 if(!bounded)inconclusive=true;else if(ratio>config.maximum_candidate_median_ratio)regression=true;
 records.push({workload:workload.name,event_count:rows.length,request_count:queries.length,output_count:expected.reduce((count,group)=>count+group.events.length,0),consumed,durations_ms:durations,reference_median_ms:baseline,candidate_median_ms:improved,candidate_to_reference_ratio:ratio,state:!bounded?'inconclusive':ratio<=config.maximum_candidate_median_ratio?'within_local_target':'local_regression'});
}
console.log(JSON.stringify({measurement_version:'1.0.0',candidate_source_digest,runtime:process.version,platform:process.platform,architecture:process.arch,clock:'performance.now',fictional_local_workloads:true,measured_external_service:false,records},null,2));
process.exitCode=inconclusive?3:regression?1:0;
