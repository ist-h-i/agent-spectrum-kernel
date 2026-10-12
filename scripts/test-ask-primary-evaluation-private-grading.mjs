// Synthetic diagnostic records only. No private worker, model, or CLI starts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, buildPrimaryEvaluationScoringInputs } from './ask-primary-evaluation-producer.mjs';
import { preflightPrimaryEvaluationGradingResources, primaryPrivateGradingBudget, primaryPrivateGradingExecutionStatus, runPrimaryEvaluationPrivateGrading } from './ask-primary-evaluation-private-grading.mjs';
import { activePrimaryProducer, primaryAdapterSourceDigest, primaryEvaluatorLogFailureReceipts, primaryGradingSchemaPath, withPrimaryHistoricalEvaluatorResources, withPrimaryEvaluatorLogCapture, capturePrimaryEvaluatorChildStreams } from './ask-primary-evaluation-scope.mjs';
import { createHash } from 'node:crypto';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { deriveEvaluatorDependencyGraph, validateEvaluatorSourceIdentity, verifyPublicEvaluatorReference } from './ask-benchmark-evaluator-boundary.mjs';

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
  assert.throws(()=>deriveEvaluatorDependencyGraph({root,baseRevision:reference.evaluator_revision}),/dependency base Git revision is unavailable/);
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
