import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildPfPerformanceProbeSource, inspectPfPerformanceProbeOutput } from './ask-benchmark-pf-performance-probe.mjs';

const root = resolve(import.meta.dirname,'..');
const workspace = resolve(root,'benchmarks/fixtures/checkpoint-b2/pf-performance-regression/workspace');
const referenceSource = readFileSync(resolve(workspace,'reference/scan-lookup.mjs'),'utf8');
const dataSource = readFileSync(resolve(workspace,'scripts/generate-data.mjs'),'utf8');
// Deliberately tiny, inconclusive synthetic workload. No full performance or
// native isolation claim follows from running trusted author controls here.
const config = {workloads:[{name:'sparse',events:16,requests:4,tenants:4},{name:'dense',events:16,requests:4,tenants:1}],
  warmups:2,samples:5,minimum_baseline_ms:1e9,maximum_dispersion_ratio:12,maximum_candidate_median_ratio:0.4};
const script = buildPfPerformanceProbeSource({referenceSource,dataSource,config});
function synthetic(source) {
  const child = spawnSync(process.execPath,['--experimental-vm-modules','-e',script],{input:source,encoding:null,timeout:5000,maxBuffer:1024*1024});
  assert.equal(child.status,0,child.stderr?.toString());
  return {bytes:child.stdout,result:inspectPfPerformanceProbeOutput(child.stdout,{candidateSource:Buffer.from(source),config})};
}

test('PFP-SAME: reference and a distinct occurrence-loop implementation use the same unscored timing path',()=>{
  const distinct = `export function lookupEvents(events,requests){return requests.map(request=>{
    const result={request_id:request?.request_id,events:[]};
    if(request===null||typeof request!=='object'||!Number.isFinite(request.start)||!Number.isFinite(request.end)||request.start>request.end)return result;
    for(let i=events.length-1;i>=0;i--){const event=events[i];if(event!==null&&typeof event==='object'&&Number.isFinite(event.timestamp)&&event.tenant===request.tenant&&event.kind===request.kind&&event.timestamp>=request.start&&event.timestamp<=request.end)result.events.unshift(event);}
    return result;});}`;
  for (const source of [referenceSource,distinct]) {
    const {result} = synthetic(source);
    assert.equal(result.state,'inconclusive'); assert.equal(result.quality,null);
    assert.equal(result.functional_observations,24);
    assert.equal(result.evidence_role,'candidate_correctness_only');
    assert.equal(result.authentication,'requires_qualified_isolated_child');
    for (const row of result.report.records) {
      assert.equal(row.durations_ms.candidate.length,5);assert.equal(row.durations_ms.reference.length,5);
      assert.ok(row.durations_ms.candidate.every(x=>Number.isFinite(x)&&x>=0));
    }
  }
});

test('PFP-CONTRACT: wrong output, cloned identities, holes, mutation and retained results fail',()=>{
  const badSources = [
    `export function lookupEvents(events,requests){return requests.map(request=>({request_id:request?.request_id,events:[]}));}`,
    referenceSource.replace('events: events.filter','events: events.filter').replace('timestamp <= request.end)','timestamp <= request.end).map(event=>({...event}))'),
    referenceSource.replace('requests.map','Array.from(requests).map'),
    referenceSource.replace('return requests.map','events.reverse(); return requests.map'),
    referenceSource.replace('export function lookupEvents','let cached; export function lookupEvents').replace('return requests.map','return cached ??= requests.map'),
    referenceSource.replace("event.tenant === request.tenant", "String(event.tenant) === String(request.tenant)"),
  ];
  for (const source of badSources) assert.equal(synthetic(source).result.state,'fail');
});

test('PFP-CONTRACT: rewriting a previous result and sharing same-call output containers fail',()=>{
  const scan=referenceSource.replace('export function lookupEvents','function scan');
  const controls=[
    `${scan}\nlet shared;export function lookupEvents(rows,queries){const next=scan(rows,queries);if(!shared)shared=next;else{shared.length=next.length;for(let i=0;i<next.length;i++)if(i in next)shared[i]=next[i];else delete shared[i];}return shared;}`,
    `${scan}\nexport function lookupEvents(rows,queries){const groups=scan(rows,queries);for(let i=1;i<queries.length;i++)if(i in queries&&queries[i]===queries[0])groups[i]=groups[0];return groups;}`,
    `${scan}\nexport function lookupEvents(rows,queries){const groups=scan(rows,queries);for(let i=1;i<queries.length;i++)if(i in queries&&queries[i]===queries[0])groups[i].events=groups[0].events;return groups;}`,
  ];
  for(const source of controls)assert.equal(synthetic(source).result.state,'fail');
});

test('PFP-HOST: imports and re-exports are unsupported without invoking a host loader',()=>{
  for (const source of [
    `import process from 'node:process'; ${referenceSource}`,
    `export * from 'node:fs';`,
    `const escape=()=>import('node:process'); ${referenceSource}`,
    `// import is conservatively unsupported even in comments\n${referenceSource}`,
  ]) {
    const {result}=synthetic(source);assert.equal(result.state,'unavailable');assert.equal(result.reason,'unsupported_module');assert.equal(result.quality,null);
  }
});

test('PFP-HOST: intrinsic mutation, generated code and output getters cannot produce a pass',()=>{
  for (const source of [
    `Number.isFinite=()=>true; ${referenceSource}`,
    `const escape=Function('return process')(); ${referenceSource}`,
    `export function lookupEvents(events,requests){return requests.map(request=>({get request_id(){throw Error('do not invoke');},events:[]}));}`,
    `export function lookupEvents(events,requests){throw Error('candidate error');}`,
  ]) assert.equal(synthetic(source).result.state,'fail');
});

test('PFP-TIME: deferred Proxy work cannot escape the measured invocation',()=>{
  const reference=referenceSource.replace('export function lookupEvents','function scan');
  const delayed=`${reference}\nexport function lookupEvents(rows,queries){const target=[];let populated=false;return new Proxy(target,{getOwnPropertyDescriptor(array,key){if(!populated){populated=true;array.push(...scan(rows,queries));}return Reflect.getOwnPropertyDescriptor(array,key);}});}`;
  assert.equal(synthetic(delayed).result.state,'fail');
  for (const change of [
    referenceSource.replace('return requests.map','return requests.map').replace('request_id: request?.request_id','request_id: request?.request_id').replace('events: events.filter','events: events.filter').replace('timestamp <= request.end)','timestamp <= request.end)').replace(')}));',')})).map(group=>new Proxy(group,{}));'),
    referenceSource.replace('events: events.filter','events: new Proxy(events.filter').replace('timestamp <= request.end)','timestamp <= request.end),{})'),
  ]) {
    const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:change,encoding:'utf8'});
    assert.equal(syntax.status,0,syntax.stderr);
    assert.equal(synthetic(change).result.state,'fail');
  }
});

test('PFP-UNKNOWN: a module timeout stays unavailable rather than quality zero',()=>{
  const {result}=synthetic('while(true){}\n'+referenceSource);
  assert.equal(result.state,'unavailable');assert.equal(result.reason,'candidate_timeout');assert.equal(result.quality,null);
});

test('PFP-UNKNOWN: malformed, mismatched and forged raw output remains unavailable, never quality zero',()=>{
  const {bytes}=synthetic(referenceSource);
  for (const value of [Buffer.from('{}'),Buffer.from('invalid'),Buffer.from(bytes.toString().replace('"functional_observations":24','"functional_observations":0')),Buffer.from(bytes.toString().replace('"state":"measured"','"state":"fail","state":"measured"'))]) {
    const result=inspectPfPerformanceProbeOutput(value,{candidateSource:Buffer.from(referenceSource),config});
    assert.equal(result.state,'unavailable');assert.equal(result.quality,null);
  }
  assert.equal(inspectPfPerformanceProbeOutput(bytes,{candidateSource:Buffer.from('different source'),config}).reason,'probe_source_binding_invalid');
});

test('PFP-TIME: malformed trusted configuration is rejected before candidate execution',()=>{
  for (const changed of [{samples:4},{warmups:-1},{maximum_candidate_median_ratio:0},{workloads:[]},{maximum_dispersion_ratio:0},{workloads:[{name:'sparse',events:4,requests:1,tenants:1},config.workloads[1]]}]) {
    assert.throws(()=>buildPfPerformanceProbeSource({referenceSource,dataSource,config:{...config,...changed}}),/invalid trusted probe inputs/);
  }
});
