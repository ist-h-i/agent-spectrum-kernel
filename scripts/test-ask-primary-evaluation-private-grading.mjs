// Synthetic diagnostic records only. No private worker, model, or CLI starts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';
import { preflightPrimaryEvaluationGradingResources, primaryPrivateGradingBudget, primaryPrivateGradingExecutionStatus, runPrimaryEvaluationPrivateGrading } from './ask-primary-evaluation-private-grading.mjs';
import { activePrimaryProducer, primaryAdapterSourceDigest, primaryEvaluatorLogFailureReceipts, primaryGradingSchemaPath, withPrimaryHistoricalEvaluatorResources, withPrimaryEvaluatorLogCapture, capturePrimaryEvaluatorChildStreams,
  primaryEvaluatorProbeCaptureAvailable,capturePrimaryEvaluatorProbeAudit,withPrimaryEvaluatorLogCaptureAsync,primaryEvaluatorExecutionControl,primaryEvaluatorExecutionFailureReceipts } from './ask-primary-evaluation-scope.mjs';
import { createHash } from 'node:crypto';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { deriveEvaluatorDependencyGraph, validateEvaluatorSourceIdentity, verifyPublicEvaluatorReference } from './ask-benchmark-evaluator-boundary.mjs';
import { PF_PERFORMANCE_PROBE_VERSION,createPfPerformancePrivateAudit,inspectPfPerformancePrivateAudit } from './ask-benchmark-pf-performance-probe.mjs';
import { buildPfPerformanceProspectiveEvaluatorSource } from './ask-benchmark-pf-performance-authority.mjs';

test('original worker budget is preserved for initial and validation pairs, including the existing eleven-minute fixture', () => {
  assert.deepEqual(primaryPrivateGradingBudget(660000), { worker_timeout_ms: 660000, condition_reservation_ms: 2640000 });
  assert.deepEqual(primaryPrivateGradingBudget(120000), { worker_timeout_ms: 120000, condition_reservation_ms: 480000 });
  assert.deepEqual(primaryPrivateGradingBudget(900000), { worker_timeout_ms: 900000, condition_reservation_ms: 3600000 });
  for (const invalid of [0, -1, 900001, NaN, null]) assert.throws(() => primaryPrivateGradingBudget(invalid));
});

test('fresh practical grading execution completion preserves unresolved original scoring without aborting later tasks', () => {
  const complete = Array.from({ length: 4 }, () => ({ process_completed: true, exit_code: 0 }));
  assert.equal(primaryPrivateGradingExecutionStatus('complete', complete), 'completed');
  assert.equal(primaryPrivateGradingExecutionStatus('not_scoring_ready', complete), 'unknown');
  assert.equal(primaryPrivateGradingExecutionStatus('not_scoring_ready', complete, { freshVersion: true }), 'completed');
  for (const receipts of [complete.slice(0, 2), [...complete.slice(0, 3), { process_completed: false, exit_code: null }],
    [...complete.slice(0, 3), { process_completed: true, exit_code: 1 }]])
    assert.throws(() => primaryPrivateGradingExecutionStatus('not_scoring_ready', receipts, { freshVersion: true }));
  assert.throws(() => primaryPrivateGradingExecutionStatus('unknown', complete, { freshVersion: true }));
  assert.throws(() => primaryPrivateGradingExecutionStatus('not_scoring_ready', complete, { freshVersion: 'yes' }));
});

async function fixture(t){const source=syntheticPrimarySource(t),p=await producePrimaryEvaluationArtifacts(source.block,join(source.root,'producer'));
  const options={recordRoot:p.output_root,externalDigest:p.external_digest},normalizedResult=buildPrimaryEvaluationScoringInputs(options,{condition:'plain'}).normalizedResult;
  return {...source,options,normalizedResult};}
const payload=n=>({normalized_result:{source_base64:Buffer.from(JSON.stringify(n)).toString('base64')}});
const child={pid:123,status:0,signal:null,stdout:'synthetic worker output\n',stderr:'synthetic diagnostic\n'};
const digest=raw=>`sha256:${createHash('sha256').update(raw).digest('hex')}`;
function publicBlock(fixtureId){const base=new URL(`../benchmarks/fixtures/checkpoint-b2/${fixtureId}/`,import.meta.url),freezeRaw=readFileSync(new URL('scoring-input-freeze-manifest.json',base)),freeze=JSON.parse(freezeRaw),reference=JSON.parse(readFileSync(new URL('evaluator-reference.json',base)));
  return{fixture_id:fixtureId,grading:{binding:{fixture_id:fixtureId,input_manifest_digest:freeze.fixture_input_digest,evaluator_bundle_digest:reference.evaluator_bundle_digest,profile_id:'primary_single_shot_v1',scoring_input_freeze_digest:digest(freezeRaw)}}};}
test('original pipeline blocks absent original assets, cancellation, or insufficient reservation before any child',async t=>{
  const f=await fixture(t);
  for(const controls of [{},{signal:{aborted:true}},{deadlineAtMs:Date.now()+1000},{timeoutMs:300001}]){
    const result=runPrimaryEvaluationPrivateGrading(f.options,{condition:'plain'},controls);
    assert.equal(result.status,'blocked');assert.equal(result.scoring_status,'not_scoring_ready');assert.equal(result.quality,null);
    assert.equal(result.grader_process_starts,0);assert.equal(result.model_calls,0);assert.equal(result.formal_aggregate_eligible,false);
    assert.deepEqual(result.blockers,['original_private_pipeline_unverified']);
  }
});
test('resource preflight is terminal independent, verifies original public closure and blocks missing originals without workers',t=>{
  const frozenSourceRoot=fileURLToPath(new URL('../../scoring-runtime-r1/mn-build-option-update',import.meta.url));
  if(!existsSync(frozenSourceRoot)){t.skip('independently prepared historical public runtime not present');return;}
  const f=syntheticPrimarySource(t,{scenario:'pending'}),resource={frozenSourceRoot,privateRoot:'/unrestored/original-private',manifestPath:'/unrestored/original-private/private-evaluator-bundle.json'};
  const result=preflightPrimaryEvaluationGradingResources(f.block,resource);
  assert.equal(result.status,'blocked');assert.equal(result.public_metadata_verified,true);assert.equal(result.original_assets_verified,false);assert.equal(result.admission_ready,false);
  assert.equal(result.grader_process_starts,0);assert.equal(result.execution_isolation_authority,false);assert.equal(result.runtime_compatibility,'unknown');
  const changed=structuredClone(f.block);changed.fixture_id='mn-client-compatibility-fix';
  assert.equal(preflightPrimaryEvaluationGradingResources(changed,resource).public_metadata_verified,false);
  changed.fixture_id=f.block.fixture_id;changed.grading.binding.scoring_input_freeze_digest='sha256:'+'0'.repeat(64);
  assert.equal(preflightPrimaryEvaluationGradingResources(changed,resource).public_metadata_verified,false);
});
test('nine pinned historical public graphs rederive exactly; resource scope supplies no producer or schema authority',t=>{
  const runtimeRoot=fileURLToPath(new URL('../../scoring-runtime-r1/',import.meta.url));
  if(!PRIMARY_FIXTURE_IDS.every(id=>existsSync(join(runtimeRoot,id)))){t.skip('independent historical public runtimes not present');return;}
  for(const id of PRIMARY_FIXTURE_IDS){const block=publicBlock(id),root=join(runtimeRoot,id),referencePath=join(root,`benchmarks/fixtures/checkpoint-b2/${id}/evaluator-reference.json`),expected=JSON.parse(readFileSync(referencePath));
    const graph=withPrimaryHistoricalEvaluatorResources(block,root,()=>{
      assert.equal(activePrimaryProducer(),false);const schema='/example/benchmarks/schemas/normalized-portfolio-result.schema.json';assert.equal(primaryGradingSchemaPath(schema),schema);
      const reference=verifyPublicEvaluatorReference({root,referencePath});assert.deepEqual(reference,expected);
      return deriveEvaluatorDependencyGraph({root,baseRevision:reference.evaluator_revision});
    });assert.deepEqual(graph,expected.evaluator_source_identity.dependency_graph);
    const result=preflightPrimaryEvaluationGradingResources(block,{frozenSourceRoot:root,privateRoot:'/unrestored/original-private',manifestPath:'/unrestored/original-private/private-evaluator-bundle.json'});
    assert.equal(result.public_metadata_verified,true);assert.equal(result.status,'blocked');assert.deepEqual(result.blockers,['original_grading_resources_original_assets_unverified']);
  }
});
test('historical graph scope rejects source/reference tamper, changed root/revision, explicit parameters and asynchronous leakage',t=>{
  const root=fileURLToPath(new URL('../../scoring-runtime-r1/mn-build-option-update',import.meta.url));if(!existsSync(root)){t.skip('independent historical public runtime not present');return;}
  const f=syntheticPrimarySource(t,{scenario:'pending'}),block=publicBlock('mn-build-option-update'),referencePath=join(root,'benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-reference.json'),reference=JSON.parse(readFileSync(referencePath));
  // Pure public source reconstruction does not acquire primary execution or
  // schema authority. Unreachable new readers must not break this old closure.
  assert.deepEqual(deriveEvaluatorDependencyGraph({root,baseRevision:reference.evaluator_revision}),reference.evaluator_source_identity.dependency_graph);
  assert.equal(activePrimaryProducer(),false);assert.equal(primaryAdapterSourceDigest(),null);
  const legacySchema='/example/benchmarks/schemas/normalized-portfolio-result.schema.json';assert.equal(primaryGradingSchemaPath(legacySchema),legacySchema);
  assert.throws(()=>deriveEvaluatorDependencyGraph({root,baseRevision:'0'.repeat(40)}),/dependency base Git revision is unavailable/);
  assert.throws(()=>withPrimaryHistoricalEvaluatorResources(block,root,()=>Promise.resolve()),/async_scope/);
  withPrimaryHistoricalEvaluatorResources(block,root,()=>{
    assert.throws(()=>deriveEvaluatorDependencyGraph({root:f.root,baseRevision:reference.evaluator_revision}),/root_changed/);
    assert.throws(()=>deriveEvaluatorDependencyGraph({root,baseRevision:'0'.repeat(40)}),/revision_changed/);
    assert.throws(()=>deriveEvaluatorDependencyGraph({root,baseRevision:reference.evaluator_revision,entryPaths:reference.evaluator_source_identity.dependency_graph.entry_paths}),/explicit_graph_parameters/);
  });
  const copy=join(f.root,'altered-source'),base='benchmarks/fixtures/checkpoint-b2/mn-build-option-update';mkdirSync(join(copy,base),{recursive:true,mode:0o700});
  for(const name of ['scoring-input-freeze-manifest.json','evaluator-reference.json'])writeFileSync(join(copy,base,name),readFileSync(join(root,base,name)));
  const node=reference.evaluator_source_identity.source_files[0],nodePath=join(copy,node.path);mkdirSync(join(nodePath,'..'),{recursive:true,mode:0o700});writeFileSync(nodePath,'altered public source');
  assert.throws(()=>withPrimaryHistoricalEvaluatorResources(block,copy,()=>validateEvaluatorSourceIdentity({root:copy,identity:reference.evaluator_source_identity,expectedRevision:reference.evaluator_revision})),/source bytes drift/);
  writeFileSync(join(copy,base,'evaluator-reference.json'),'altered reference');assert.throws(()=>withPrimaryHistoricalEvaluatorResources(block,copy,()=>{}),/reference_changed/);
});
test('verified synthetic capture preserves private stream bytes with exclusive receipts, binding and current adapter digest',async t=>{
  const f=await fixture(t),outputRoot=join(f.root,'private-logs');mkdirSync(outputRoot,{mode:0o700});
  assert.equal(primaryAdapterSourceDigest(),null);capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult));assert.deepEqual(readdirSync(outputRoot),[]);
  const captured=withPrimaryEvaluatorLogCapture(f.options,{outputRoot,normalizedResult:f.normalizedResult},()=>{
    const current=readFileSync(new URL('./ask-benchmark-evaluator-boundary.mjs',import.meta.url));
    assert.equal(primaryAdapterSourceDigest(),`sha256:${createHash('sha256').update(current).digest('hex')}`);
    for(let index=0;index<4;index++)capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult));return 'synthetic diagnostic only';
  });
  assert.equal(captured.result,'synthetic diagnostic only');assert.equal(captured.receipts.length,4);
  for(const receipt of captured.receipts){assert.equal(receipt.evidence_kind,'synthetic');assert.equal(receipt.condition,'plain');assert.equal(receipt.process_completed,true);
    assert.equal(receipt.normalized_result_digest,f.normalizedResult.normalized_result_digest);assert.deepEqual(readFileSync(join(outputRoot,receipt.stdout.path)),Buffer.from(child.stdout));
    assert.deepEqual(readFileSync(join(outputRoot,receipt.stderr.path)),Buffer.from(child.stderr));assert.equal(JSON.stringify(receipt).includes(child.stderr.trim()),false);}
  assert.equal(activePrimaryProducer(),false);
  assert.throws(()=>withPrimaryEvaluatorLogCapture(f.options,{outputRoot,normalizedResult:f.normalizedResult},()=>capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult))),/EEXIST/);
});

test('explicit async log scope expires descendant authority and keeps legacy sync Promise rejection',async t=>{
  const f=await fixture(t),outputRoot=join(f.root,'async-private-logs');mkdirSync(outputRoot,{mode:0o700});
  assert.equal(primaryEvaluatorExecutionControl(),null);let retained,release,descendant;
  const captured=await withPrimaryEvaluatorLogCaptureAsync(f.options,{outputRoot,normalizedResult:f.normalizedResult,workerTimeoutMs:100},async()=>{
    retained=primaryEvaluatorExecutionControl();assert.ok(retained);assert.equal(activePrimaryProducer(),true);
    await Promise.resolve();assert.equal(primaryEvaluatorExecutionControl(),retained);
    const gate=new Promise(resolve=>{release=resolve;});descendant=gate.then(()=>{
      assert.equal(activePrimaryProducer(),false);assert.equal(primaryEvaluatorExecutionControl(),null);assert.throws(()=>retained.assertReady(),/expired/);
    });
    capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult));retained.assertReady();return 'synthetic async completion';
  });
  release();await descendant;assert.equal(captured.result,'synthetic async completion');assert.equal(captured.receipts.length,1);
  assert.equal(captured.lifecycle_receipts.length,1);assert.equal(captured.lifecycle_receipts[0].kind,'ask_primary_condition_lifetime_v1');assert.equal(captured.lifecycle_receipts[0].status,'completed');
  assert.equal(activePrimaryProducer(),false);assert.equal(primaryEvaluatorExecutionControl(),null);
  const legacyRoot=join(f.root,'legacy-promise-logs');mkdirSync(legacyRoot,{mode:0o700});
  assert.throws(()=>withPrimaryEvaluatorLogCapture(f.options,{outputRoot:legacyRoot,normalizedResult:f.normalizedResult},()=>Promise.resolve()),/async_scope_forbidden/);
  assert.equal(activePrimaryProducer(),false);
  for(const [index,value]of [0,null,undefined].entries()){
    const failRoot=join(f.root,`falsy-callback-${index}`);mkdirSync(failRoot,{mode:0o700});let rejected=false;
    try{await withPrimaryEvaluatorLogCaptureAsync(f.options,{outputRoot:failRoot,normalizedResult:f.normalizedResult,workerTimeoutMs:100},async()=>{
      capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult));throw value;
    });}catch(error){rejected=true;assert.ok(error instanceof Error);assert.equal(error.message,'primary_condition_callback_failed');assert.equal(primaryEvaluatorLogFailureReceipts(error).length,1);
      assert.equal(primaryEvaluatorExecutionFailureReceipts(error).at(-1).failure_code,'primary_condition_callback_failed');}
    assert.equal(rejected,true);assert.equal(readFileSync(join(failRoot,'0001.stdout.log'),'utf8'),child.stdout);assert.equal(activePrimaryProducer(),false);
  }
  const savedError=new Error('ARTIFICIAL_ERROR_SENTINEL'),errorRoot=join(f.root,'object-callback-error');mkdirSync(errorRoot,{mode:0o700});
  await assert.rejects(()=>withPrimaryEvaluatorLogCaptureAsync(f.options,{outputRoot:errorRoot,normalizedResult:f.normalizedResult,workerTimeoutMs:100},async()=>{throw savedError;}),error=>error===savedError);
  assert.ok(!JSON.stringify(primaryEvaluatorExecutionFailureReceipts(savedError)).includes('ARTIFICIAL_ERROR_SENTINEL'));
  const collisionRoot=join(f.root,'final-ledger-collision');mkdirSync(collisionRoot,{mode:0o700});let saveFailure;
  try{await withPrimaryEvaluatorLogCaptureAsync(f.options,{outputRoot:collisionRoot,normalizedResult:f.normalizedResult,workerTimeoutMs:100},async()=>{
    capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult));writeFileSync(join(collisionRoot,'condition-lifetime.json'),'occupied immutable ledger');return 'cannot complete';
  });}catch(error){saveFailure=error;}
  assert.equal(saveFailure.message,'primary_condition_capture_failed');assert.equal(primaryEvaluatorLogFailureReceipts(saveFailure).length,1);
  assert.equal(primaryEvaluatorExecutionFailureReceipts(saveFailure).at(-1).log_capture_status,'incomplete');
  assert.equal(readFileSync(join(collisionRoot,'0001.stdout.log'),'utf8'),child.stdout);assert.equal(readFileSync(join(collisionRoot,'condition-lifetime.json'),'utf8'),'occupied immutable ledger');
});

test('synthetic controller probe raw evidence is retained beside private worker streams with lineage receipts',async t=>{
  const f=await fixture(t),outputRoot=join(f.root,'private-probe-logs');mkdirSync(outputRoot,{mode:0o700});
  // Positive component proof with invented timing data, not a production probe
  // observation. The real controller route still has a null qualification gate.
  const candidateSource=Buffer.from('export function lookupEvents(){return [];}\n'),sourceDigest=digest(candidateSource);
  const config={workloads:[{name:'sparse',events:16,requests:4},{name:'dense',events:16,requests:4}],samples:5,minimum_baseline_ms:12,maximum_dispersion_ratio:12,maximum_candidate_median_ratio:0.4};
  const report={measurement_version:'1.0.0',candidate_source_digest:sourceDigest,clock:'performance.now',fictional_local_workloads:true,measured_external_service:false,
    records:config.workloads.map(workload=>({workload:workload.name,event_count:16,request_count:4,output_count:8,consumed:80,durations_ms:{candidate:Array(5).fill(4),reference:Array(5).fill(20)},reference_median_ms:20,candidate_median_ms:4,candidate_to_reference_ratio:0.2,state:'within_local_target'}))};
  const stdout=Buffer.from(JSON.stringify({probe_version:PF_PERFORMANCE_PROBE_VERSION,candidate_source_digest:sourceDigest,state:'measured',reason:null,functional_observations:24,report})),stderr=Buffer.from([0,255,10]);
  const audit=createPfPerformancePrivateAudit({candidateSource,config,
    raw:{stdout,stderr,exit_code:0,signal:null,error_code:null}});
  assert.equal(primaryEvaluatorProbeCaptureAvailable(),false);assert.equal(capturePrimaryEvaluatorProbeAudit(audit),null);
  const saved=withPrimaryEvaluatorLogCapture(f.options,{outputRoot,normalizedResult:f.normalizedResult},()=>{
    assert.equal(primaryEvaluatorProbeCaptureAvailable(),true);
    const retained=capturePrimaryEvaluatorProbeAudit(audit);
    assert.deepEqual(retained,audit);assert.equal(readdirSync(outputRoot).includes('0001.performance-probe.json'),true);
    const checked=inspectPfPerformancePrivateAudit(retained,{candidateSource,config});assert.equal(checked.state,'within_local_target');
    capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult));
    return checked;
  });
  const receipt=saved.receipts[0],raw=readFileSync(join(outputRoot,receipt.performance_probe.path)),retained=JSON.parse(raw);
  assert.equal(receipt.evidence_kind,'synthetic');assert.equal(receipt.normalized_result_digest,f.normalizedResult.normalized_result_digest);
  assert.equal(receipt.performance_probe.digest,digest(raw));assert.equal(receipt.performance_probe.bytes,raw.length);
  assert.deepEqual(Buffer.from(retained.raw.stdout.base64,'base64'),stdout);assert.deepEqual(Buffer.from(retained.raw.stderr.base64,'base64'),stderr);
  assert.equal(receipt.log_capture_status,'complete');
  const candidateWorkspace=join(f.root,'component-candidate');mkdirSync(join(candidateWorkspace,'src'),{recursive:true});writeFileSync(join(candidateWorkspace,'src/event-lookup.mjs'),candidateSource);
  const body=await import('data:text/javascript;base64,'+Buffer.from(buildPfPerformanceProspectiveEvaluatorSource({probeVersion:PF_PERFORMANCE_PROBE_VERSION})).toString('base64'));
  const component=await body.evaluateCandidateSafe({repositoryRoot:fileURLToPath(new URL('../',import.meta.url)),candidateWorkspace,normalizedResult:f.normalizedResult,
    repositoryDiffArtifact:{artifact_digest:digest('artificial diff'),artifact_bytes:1,diff_entries:[{path:'src/event-lookup.mjs',before:{sha256:digest('before')},after:{sha256:sourceDigest,file_type:'file',mode:0o644}}]},
    privatePerformanceProbe:{probe_version:PF_PERFORMANCE_PROBE_VERSION,candidate_source_digest:sourceDigest,...saved.result}});
  assert.equal(component.requirement_results[0].outcome,'pass');assert.equal(component.requirement_results[0].earned_points,5);
  assert.throws(()=>withPrimaryEvaluatorLogCapture(f.options,{outputRoot,normalizedResult:f.normalizedResult},()=>capturePrimaryEvaluatorProbeAudit(audit)),/EEXIST/);
  for(const [name,tamper] of [['drift',path=>writeFileSync(path,'changed suspect audit\n')],
    ['missing',path=>renameSync(path,join(f.root,'removed-probe.json'))]]){
    const outputRoot=join(f.root,`${name}-probe-logs`);mkdirSync(outputRoot,{mode:0o700});let failure;
    try{withPrimaryEvaluatorLogCapture(f.options,{outputRoot,normalizedResult:f.normalizedResult},()=>{
      capturePrimaryEvaluatorProbeAudit(audit);tamper(join(outputRoot,'0001.performance-probe.json'));
      capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult));
    });}catch(error){failure=error;}
    const receipts=primaryEvaluatorLogFailureReceipts(failure);
    assert.equal(receipts.length,1,'a completed child receipt must survive invalid probe evidence');
    assert.equal(receipts[0].spawn_observed,true);assert.equal(receipts[0].process_completed,true);assert.equal(receipts[0].exit_code,0);
    assert.equal(receipts[0].log_capture_status,'complete');assert.equal(Object.hasOwn(receipts[0],'performance_probe'),false);
    assert.deepEqual(receipts[0].invalid_performance_probe_binding,{status:'invalid',code:'primary_private_probe_binding_invalid',expected_reference:receipt.performance_probe});
    assert.deepEqual(readFileSync(join(outputRoot,receipts[0].stdout.path)),Buffer.from(child.stdout));
    assert.deepEqual(readFileSync(join(outputRoot,receipts[0].stderr.path)),Buffer.from(child.stderr));
    assert.deepEqual(JSON.parse(readFileSync(join(outputRoot,'0001.receipt.json'))),receipts[0]);
    assert.equal(JSON.stringify(receipts).includes('suspect audit'),false);
    assert.equal(failure.message,'primary_private_probe_binding_invalid');
  }
  const blockedRoot=join(f.root,'blocked-probe-logs');mkdirSync(blockedRoot,{mode:0o700});let blockedFailure;
  try{withPrimaryEvaluatorLogCapture(f.options,{outputRoot:blockedRoot,normalizedResult:f.normalizedResult},()=>{
    capturePrimaryEvaluatorProbeAudit(audit);writeFileSync(join(blockedRoot,'0001.performance-probe.json'),'changed suspect audit\n');
    writeFileSync(join(blockedRoot,'0001.stdout.log'),'occupied');capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult));
  });}catch(error){blockedFailure=error;}
  assert.match(blockedFailure.message,/EEXIST/);const incomplete=primaryEvaluatorLogFailureReceipts(blockedFailure);
  assert.equal(incomplete.length,1);assert.equal(incomplete[0].process_completed,true);assert.equal(incomplete[0].log_capture_status,'incomplete');
  assert.equal(Object.hasOwn(incomplete[0],'performance_probe'),false);assert.equal(incomplete[0].invalid_performance_probe_binding.status,'invalid');
  assert.equal(readFileSync(join(blockedRoot,'0001.stdout.log'),'utf8'),'occupied');assert.equal(existsSync(join(blockedRoot,'0001.receipt.json')),false);
});
test('capture rejects async leakage, transplanted payloads, unknown termination and stream save failures',async t=>{
  const f=await fixture(t),log=name=>{const outputRoot=join(f.root,name);mkdirSync(outputRoot,{mode:0o700});return{outputRoot,normalizedResult:f.normalizedResult};};
  assert.throws(()=>withPrimaryEvaluatorLogCapture(f.options,log('async'),()=>Promise.resolve()),/async_scope/);assert.equal(activePrimaryProducer(),false);
  const changed=structuredClone(f.normalizedResult);changed.lineage.run_instance_id='transplanted';
  assert.throws(()=>withPrimaryEvaluatorLogCapture(f.options,log('binding'),()=>capturePrimaryEvaluatorChildStreams(child,payload(changed))),/child_binding/);
  const unknown=log('unknown');assert.throws(()=>withPrimaryEvaluatorLogCapture(f.options,unknown,()=>capturePrimaryEvaluatorChildStreams({...child,pid:undefined,status:null},payload(f.normalizedResult))),/completion_unknown/);
  const receipt=JSON.parse(readFileSync(join(unknown.outputRoot,'0001.receipt.json')));assert.equal(receipt.process_completed,false);assert.equal(receipt.spawn_observed,false);
  const save=log('save');writeFileSync(join(save.outputRoot,'0001.stdout.log'),'occupied');
  let savedFailure;try{withPrimaryEvaluatorLogCapture(f.options,save,()=>capturePrimaryEvaluatorChildStreams(child,payload(f.normalizedResult)));}catch(error){savedFailure=error;}
  assert.match(savedFailure.message,/EEXIST/);const summary=primaryEvaluatorLogFailureReceipts(savedFailure);assert.equal(summary.length,1);assert.equal(summary[0].process_completed,true);assert.equal(summary[0].log_capture_status,'incomplete');
  assert.equal(primaryEvaluatorLogFailureReceipts(new Error('untrusted')),null);
  assert.deepEqual(readdirSync(save.outputRoot),['0001.stdout.log']);
});

test('v2 synthetic producer blocks unavailable originals with actual condition and zero starts', async t => {
  const source = syntheticPrimarySource(t, { kernelCondition: 'kernel_principles_v2' });
  const produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root, 'producer'));
  const options = { recordRoot: produced.output_root, externalDigest: produced.external_digest };
  const result = runPrimaryEvaluationPrivateGrading(options, { condition: 'kernel_principles_v2' });
  assert.equal(result.status, 'blocked'); assert.equal(result.condition, 'kernel_principles_v2');
  assert.equal(result.quality, null); assert.equal(result.grader_process_starts, 0); assert.equal(result.model_calls, 0);
  assert.deepEqual(result.blockers, ['original_private_pipeline_unverified']);
  const mixed = runPrimaryEvaluationPrivateGrading(options, { condition: 'kernel_principles_v1' });
  assert.equal(mixed.status, 'blocked'); assert.equal(mixed.condition, null); assert.equal(mixed.grader_process_starts, 0);
});
test('v2 historical public resource scope accepts its closed profile without schema or producer authority', t => {
  const root = fileURLToPath(new URL('../../scoring-runtime-r1/mn-build-option-update', import.meta.url));
  if (!existsSync(root)) { t.skip('independent historical public runtime not present'); return; }
  const block = publicBlock('mn-build-option-update'); block.grading.binding.profile_id = 'primary_principles_v2_single_shot_v1';
  withPrimaryHistoricalEvaluatorResources(block, root, () => {
    assert.equal(activePrimaryProducer(), false);
    const path = '/example/benchmarks/schemas/normalized-portfolio-result.schema.json';
    assert.equal(primaryGradingSchemaPath(path), path);
  });
  const result = preflightPrimaryEvaluationGradingResources(block, { frozenSourceRoot: root,
    privateRoot: '/unrestored/original-private', manifestPath: '/unrestored/original-private/private-evaluator-bundle.json' });
  assert.equal(result.public_metadata_verified, true); assert.equal(result.status, 'blocked');
  assert.equal(result.grader_process_starts, 0); assert.equal(result.runtime_compatibility, 'unknown');
  block.grading.binding.profile_id = 'primary_unknown';
  assert.throws(() => withPrimaryHistoricalEvaluatorResources(block, root, () => {}), /binding_invalid/);
});
