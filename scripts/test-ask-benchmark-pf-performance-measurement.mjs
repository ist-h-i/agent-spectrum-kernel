import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPfPerformanceMeasurement } from './ask-benchmark-pf-performance-source.mjs';
const sourceDigest='sha256:'+'a'.repeat(64);
const config={workloads:[{name:'sparse',events:16,requests:4},{name:'dense',events:16,requests:4}],samples:5,minimum_baseline_ms:12,maximum_dispersion_ratio:12,maximum_candidate_median_ratio:0.4};
function record(candidate=4,baseline=20){return {measurement_version:'1.0.0',candidate_source_digest:sourceDigest,clock:'performance.now',fictional_local_workloads:true,measured_external_service:false,records:config.workloads.map(workload=>({workload:workload.name,event_count:16,request_count:4,output_count:8,consumed:80,durations_ms:{candidate:Array(5).fill(candidate),reference:Array(5).fill(baseline)},reference_median_ms:baseline,candidate_median_ms:candidate,candidate_to_reference_ratio:candidate/baseline,state:baseline<12?'inconclusive':candidate/baseline<=0.4?'within_local_target':'local_regression'}))};}
const inspect=value=>inspectPfPerformanceMeasurement(value,{sourceDigest,config});
test('measurement data preserves success, regression and inconclusive as distinct outcomes',()=>{assert.equal(inspect(record()).state,'within_local_target');assert.equal(inspect(record(19)).state,'local_regression');assert.equal(inspect(record(1,2)).state,'inconclusive');assert.equal(inspect(null).state,'unavailable');for(const value of [record(),record(19),record(1,2),null])assert.equal(inspect(value).quality,null);assert.equal(inspect(record()).authentication,'not_established_by_data_validation');});
test('source, samples, workload coverage and recomputed claims must agree',()=>{for(const mutate of [x=>x.candidate_source_digest='sha256:'+'b'.repeat(64),x=>x.records.pop(),x=>x.records[1].workload='sparse',x=>x.records[0].durations_ms.candidate.pop(),x=>x.records[0].durations_ms.candidate[0]=null,x=>x.records[0].candidate_median_ms=1,x=>x.records[0].candidate_to_reference_ratio=0.01,x=>x.records[0].consumed=0,x=>x.records[0].state='local_regression']){const value=record();mutate(value);assert.equal(inspect(value).state,'invalid');}});
test('dispersion cannot be disguised as a measured pass',()=>{const value=record();value.records[0].durations_ms.candidate=[0.01,4,4,4,4];assert.equal(inspect(value).state,'invalid');value.records[0].state='inconclusive';assert.equal(inspect(value).state,'inconclusive');});
test('invalid measurement policy cannot become a zero or a pass',()=>{for(const changed of [{samples:0},{samples:4},{minimum_baseline_ms:0},{maximum_dispersion_ratio:0},{maximum_candidate_median_ratio:NaN}])assert.equal(inspectPfPerformanceMeasurement(record(),{sourceDigest,config:{...config,...changed}}).state,'invalid');});

test('empty, duplicate, malformed or impossible workloads cannot pass',()=>{for(const changed of [{workloads:[]},{workloads:[null,null]},{workloads:[config.workloads[0],config.workloads[0]]},{workloads:[{...config.workloads[0],events:0},config.workloads[1]]}])assert.equal(inspectPfPerformanceMeasurement(record(),{sourceDigest,config:{...config,...changed}}).state,'invalid');const impossible=record();impossible.records[0].output_count=99999;impossible.records[0].consumed=999990;assert.equal(inspect(impossible).state,'invalid');});

// Synthetic data controls only. Authentication/selection is exercised by the
// existing runtime-observation seal tests; these objects grant no authority.
const { inspectPfPerformanceRuntimeEvidence } = await import('./ask-benchmark-pf-performance-source.mjs');
const { canonicalDigest } = await import('./ask-benchmark-materialize.mjs');
const { createHash } = await import('node:crypto');
const hash = value=>'sha256:'+createHash('sha256').update(value).digest('hex');
function carrierData({candidate=4,baseline=20,exitCode=0}={}){
 const candidateSource=Buffer.from('fixed synthetic source bytes'),report=record(candidate,baseline);report.candidate_source_digest=hash(candidateSource);
 const digest=hash('synthetic-command'),lineage={run_instance_id:'491e9343-2492-489b-a827-fc89cfa01851',case_id:'case-0000000000000000-0000000000000000',attempt:'0001',fixture_id:'pf-performance-regression',fixture_input_digest:hash('input'),condition:'plain',runtime_identity_digest:hash('runtime'),environment_snapshot_digest:hash('environment'),request_digest:hash('request'),raw_result_digest:hash('result'),terminal_commit_digest:hash('terminal'),normalized_result_id:'normalized-'+'a'.repeat(32),normalized_result_digest:hash('normalized'),source_snapshot_digest:hash('snapshot')};
 const references=[{command_id:'performance-event-lookup-validation',digest,bytes:64,match_state:'matched',outcome:exitCode===0?'succeeded':'failed',exit_code:exitCode}];
 const normalizedResult={normalized_result_id:lineage.normalized_result_id,normalized_result_digest:lineage.normalized_result_digest,lineage:{...lineage},command_evidence:{capture_support:'supported',references}};
 const body={schema_version:'1.0.0',origin:'verified_retained_native_command_transport',lineage,items:[{command_evidence_digest:digest,aggregated_output:'fixed npm/test output\n'+JSON.stringify(report,null,2)+'\n'}]};
 const bodyBytes=Buffer.from(JSON.stringify(body)),observation={origin:'verified_execution_and_normalized_snapshot',availability:'captured',support:'supported',lineage,command_evidence:{references},body_reference:{path:`bodies/${lineage.normalized_result_id}.json`,bytes:bodyBytes.length,digest:hash(bodyBytes)}};
 observation.observation_digest=canonicalDigest(observation);
 return {observation,bodyBytes,normalizedResult,candidateSource,config};
}
function resign(value){const{observation_digest,...base}=value.observation;value.observation.observation_digest=canonicalDigest(base);}
function changeBody(value,mutate){const body=JSON.parse(value.bodyBytes);mutate(body);value.bodyBytes=Buffer.from(JSON.stringify(body));Object.assign(value.observation.body_reference,{bytes:value.bodyBytes.length,digest:hash(value.bodyBytes)});resign(value);}
test('retained command data binds runtime success, regression and inconclusive to final source bytes',()=>{
 for(const [settings,state]of [[{},'within_local_target'],[{candidate:19,exitCode:1},'local_regression'],[{candidate:1,baseline:2,exitCode:3},'inconclusive']]){
  const value=inspectPfPerformanceRuntimeEvidence(carrierData(settings));assert.equal(value.state,state);assert.equal(value.quality,null);assert.equal(value.source_binding,'loaded_bytes_match_final_candidate');assert.equal(value.evidence_scope,'requires_existing_verified_sealed_runtime_observation');
 }
 assert.equal(inspectPfPerformanceRuntimeEvidence().state,'unavailable');
});
test('detached carrier, raw body, command or final source data cannot supply a runtime pass',()=>{
 for(const mutate of [x=>x.observation.lineage.attempt='0002',x=>x.normalizedResult.lineage.fixture_id='different-task',x=>x.bodyBytes=Buffer.from('{}'),x=>x.candidateSource=Buffer.from('different final source'),x=>{x.observation.body_reference.path='../outside.json';resign(x);},x=>changeBody(x,b=>b.lineage.condition='full_ask'),x=>changeBody(x,b=>b.items[0].command_evidence_digest=hash('detached')),x=>changeBody(x,b=>b.items.push(b.items[0])),x=>{x.normalizedResult.command_evidence.references[0].exit_code=1;resign(x);}]){
  const value=carrierData();mutate(value);assert.equal(inspectPfPerformanceRuntimeEvidence(value).state,'invalid');
 }
});
test('missing stdout and duplicate or inconsistent measurement JSON remain unscored',()=>{
 const missing=carrierData();changeBody(missing,b=>b.items[0].aggregated_output='no measurement output');assert.equal(inspectPfPerformanceRuntimeEvidence(missing).state,'unavailable');
 const duplicate=carrierData();changeBody(duplicate,b=>b.items[0].aggregated_output=b.items[0].aggregated_output.replace('"measurement_version": "1.0.0",','"measurement_version": "1.0.0", "measurement_version": "1.0.0",'));assert.equal(inspectPfPerformanceRuntimeEvidence(duplicate).state,'invalid');
 const wrongExit=carrierData({candidate:19,exitCode:0});assert.equal(inspectPfPerformanceRuntimeEvidence(wrongExit).state,'invalid');
});
