import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildPfPerformanceProbeSource, inspectPfPerformanceProbeOutput } from './ask-benchmark-pf-performance-probe.mjs';
import * as probeApi from './ask-benchmark-pf-performance-probe.mjs';
import { buildPfPerformanceProspectiveEvaluatorSource } from './ask-benchmark-pf-performance-authority.mjs';
import { sha256 } from './ask-benchmark-pf-performance-source.mjs';

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
  const child = spawnSync(process.execPath,['--experimental-vm-modules','-e',script],{input:source,env:{PATH:'/usr/bin:/bin',TMPDIR:process.env.TMPDIR??'/tmp',LANG:'C'},encoding:null,timeout:5000,maxBuffer:1024*1024});
  assert.equal(child.status,0,child.stderr?.toString());
  return {bytes:child.stdout,result:inspectPfPerformanceProbeOutput(child.stdout,{candidateSource:Buffer.from(source),config})};
}

test('PFP-RETAIN: private audit keeps exact artificial raw streams and recomputes state without report assertions',()=>{
  const candidateSource=Buffer.from(referenceSource),{bytes}=synthetic(referenceSource);
  const raw={stdout:bytes,stderr:Buffer.from([0,255,10]),exit_code:0,signal:null,error_code:null};
  const audit=probeApi.createPfPerformancePrivateAudit({raw,candidateSource,config});
  assert.deepEqual(Buffer.from(audit.raw.stdout.base64,'base64'),raw.stdout);
  assert.deepEqual(Buffer.from(audit.raw.stderr.base64,'base64'),raw.stderr);
  const result=probeApi.inspectPfPerformancePrivateAudit(audit,{candidateSource,config});
  assert.equal(result.state,'inconclusive');assert.equal(result.quality,null);
  assert.equal(Object.hasOwn(result,'raw'),false);assert.equal(Object.hasOwn(result,'report'),false);
  for(const change of [a=>a.raw=null,a=>a.raw.stdout.base64='!',a=>a.raw.stdout.digest='sha256:'+'0'.repeat(64),
    a=>a.raw.stdout.bytes++,a=>a.candidate_source_digest='sha256:'+'0'.repeat(64),a=>a.config_digest='sha256:'+'0'.repeat(64),
    a=>a.raw.exit_code=null,a=>a.raw.signal='SIGTERM',a=>a.raw.error_code='ETIMEDOUT',a=>a.raw.stdout.base64=Buffer.from('{}').toString('base64')]){
    const changed=structuredClone(audit);change(changed);
    const invalid=probeApi.inspectPfPerformancePrivateAudit(changed,{candidateSource,config});
    assert.equal(invalid.state,'unavailable');assert.equal(invalid.quality,null);
  }
  assert.equal(probeApi.inspectPfPerformancePrivateAudit(audit,{candidateSource:Buffer.from('drift'),config}).state,'unavailable');
  assert.equal(probeApi.inspectPfPerformancePrivateAudit(null,{candidateSource,config}).state,'unavailable');
});

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

test('PFP-ROUTE: only the explicit pinned prospective body selects the controller route; qualification stays missing',()=>{
  assert.equal(probeApi.pfPerformancePrivateProbeRoute('export function evaluateCandidateSafe(){}'),null);
  assert.throws(()=>buildPfPerformanceProspectiveEvaluatorSource(),/explicit prospective/);
  assert.throws(()=>buildPfPerformanceProspectiveEvaluatorSource({probeVersion:true}),/explicit prospective/);
  assert.throws(()=>probeApi.pfPerformancePrivateProbeRoute('export const performanceProbeVersion = "unknown";\n'),/unknown/);
  const source=buildPfPerformanceProspectiveEvaluatorSource({probeVersion:probeApi.PF_PERFORMANCE_PROBE_VERSION});
  assert.equal(probeApi.pfPerformancePrivateProbeRoute(source),probeApi.PF_PERFORMANCE_PROBE_VERSION);
  const gated=probeApi.runQualifiedPfPerformancePrivateProbe({candidateSource:Buffer.from(referenceSource),config,qualified:true,report:{state:'within_local_target'}});
  assert.equal(gated.observation.state,'unavailable');assert.equal(gated.observation.reason,'native_probe_qualification_unavailable');
  assert.equal(gated.observation.quality,null);assert.equal(gated.audit.raw,null);
});

test('PFP-BODY: artificial normal, bad, unknown and distinct controls retain task requirements and verification separation',async()=>{
  const scratch=mkdtempSync(resolve(tmpdir(),'ask-prospective-performance-body-'));
  try {
    mkdirSync(resolve(scratch,'src'));
    const evaluator=await import('data:text/javascript;base64,'+Buffer.from(buildPfPerformanceProspectiveEvaluatorSource({probeVersion:probeApi.PF_PERFORMANCE_PROBE_VERSION})).toString('base64'));
    const digest=sha256('artificial normalized'),command=sha256('artificial command'),diffDigest=sha256('artificial diff');
    const normalizedResult={normalized_result_digest:digest,lineage:{final_output_digest:sha256('artificial final'),final_output_bytes:16},command_evidence:{capture_support:'supported',evidence_level:'complete',cwd_unverified_command_count:0,
      required_command_ids:['performance-event-lookup-validation'],references:[{command_id:'performance-event-lookup-validation',match_state:'matched',outcome:'succeeded',exit_code:0,digest:command,bytes:1}]}};
    const repositoryDiffArtifact={artifact_digest:diffDigest,artifact_bytes:1,diff_entries:[{path:'src/event-lookup.mjs',before:{sha256:sha256('before')},after:{sha256:sha256('after'),file_type:'file',mode:0o644}}]};
    const distinct=referenceSource.replace('events.filter','events.slice().filter');
    for(const [source,expected,artificialMedian] of [[referenceSource,'manual_review_required'],[distinct,'manual_review_required'],['export function lookupEvents(){return [];}', 'fail'],['import "unavailable";', 'manual_review_required'],
      [referenceSource,'pass',4],[distinct,'pass',4],[referenceSource,'fail',19]]){
      writeFileSync(resolve(scratch,'src/event-lookup.mjs'),source);
      let {bytes}=synthetic(source);const candidateSource=Buffer.from(source),measurementConfig={...config,minimum_baseline_ms:12};
      if(artificialMedian!==undefined){
        // Explicit data-only timing controls. They are never supplied to the
        // controller's production gate and establish no native observation.
        const output=JSON.parse(bytes);
        for(const row of output.report.records)Object.assign(row,{durations_ms:{candidate:Array(5).fill(artificialMedian),reference:Array(5).fill(20)},
          reference_median_ms:20,candidate_median_ms:artificialMedian,candidate_to_reference_ratio:artificialMedian/20,state:artificialMedian===4?'within_local_target':'local_regression'});
        bytes=Buffer.from(JSON.stringify(output));
      }
      const audit=probeApi.createPfPerformancePrivateAudit({candidateSource,config:measurementConfig,raw:{stdout:bytes,stderr:Buffer.alloc(0),exit_code:0,signal:null,error_code:null}});
      const checked=probeApi.inspectPfPerformancePrivateAudit(audit,{candidateSource,config:measurementConfig});
      const privatePerformanceProbe={probe_version:probeApi.PF_PERFORMANCE_PROBE_VERSION,candidate_source_digest:sha256(candidateSource),...checked};
      const input={repositoryRoot:root,candidateWorkspace:scratch,normalizedResult,repositoryDiffArtifact,privatePerformanceProbe};
      const result=await evaluator.evaluateCandidateSafe(input),performance=result.requirement_results[0];
      assert.deepEqual(result.requirement_results.map(row=>row.requirement_id),['performance-correctness','request-scope-discipline','verification-evidence']);
      assert.equal(performance.outcome,expected);assert.equal(performance.earned_points,expected==='fail'?0:expected==='pass'?5:null);
      assert.equal(result.requirement_results[2].outcome,'pass');assert.equal(result.verification_correctness.state,'pass');
      for(const changed of [null,{...privatePerformanceProbe,candidate_source_digest:sha256('drift')},{...privatePerformanceProbe,raw:{stdout:'fabricated'},state:'within_local_target'}]){
        const missing=await evaluator.evaluateCandidateSafe({...input,privatePerformanceProbe:changed});
        assert.equal(missing.requirement_results[0].outcome,'manual_review_required');assert.equal(missing.requirement_results[0].earned_points,null);
      }
      const withoutAgentEvidence=await evaluator.evaluateCandidateSafe({...input,normalizedResult:{...normalizedResult,command_evidence:{...normalizedResult.command_evidence,evidence_level:'unavailable'}}});
      assert.equal(withoutAgentEvidence.verification_correctness.state,'manual_review_required');
      const excess=await evaluator.evaluateCandidateSafe({...input,repositoryDiffArtifact:{...repositoryDiffArtifact,diff_entries:[...repositoryDiffArtifact.diff_entries,{path:'data/measurement-config.json',after:{file_type:'file',mode:0o644}}]}});
      assert.equal(excess.requirement_results[1].outcome,'fail');assert.equal(excess.requirement_results[1].earned_points,0);
      rmSync(resolve(scratch,'src/event-lookup.mjs'));
      const missingCandidate=await evaluator.evaluateCandidateSafe(input);
      assert.equal(missingCandidate.requirement_results[0].outcome,'manual_review_required');
      assert.equal(missingCandidate.requirement_results[1].outcome,'fail');assert.equal(missingCandidate.requirement_results[1].earned_points,0);
    }
  } finally {rmSync(scratch,{recursive:true,force:true});}
});
