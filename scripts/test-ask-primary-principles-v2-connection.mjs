// Native public preparation only. No start, model, evaluator or ownership diagnostic.
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preparePrimaryEvaluation} from './ask-primary-evaluation-prepare.mjs';
import {PRIMARY_FIXTURE_IDS,CANONICAL_PRIMARY_FIXTURE_IDS} from './ask-primary-fixture-recipe.mjs';
import {comparisonHash} from './ask-user-comparison-prepare.mjs';
import {syntheticV7ScoringVersion} from './test-helpers-primary-evaluation-v7.mjs';
import {inspectUserComparison,readUserComparisonPlan,reportUserComparison} from './ask-user-comparison.mjs';
import {exportPrimaryEvaluationGradingRequest} from './ask-primary-evaluation-grading.mjs';
import {PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID} from './ask-primary-evaluation-profile.mjs';
import {comparisonConditions} from './ask-comparison-conditions.mjs';
import {comparisonConditions as v1Conditions} from './kernel-principles.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));

test('catalog selection of the historical nine tasks keeps actual v2 identity and 27 slots unstarted',()=>{
  const area=realpathSync(mkdtempSync(join(tmpdir(),'ask-primary-k2-native-')));
  try{
    const inputs=join(area,'public');mkdirSync(inputs);
    for(const id of PRIMARY_FIXTURE_IDS){
      const source=join(ROOT,'benchmarks/fixtures/checkpoint-b2',id),manifest=JSON.parse(readFileSync(join(source,'input-manifest.json')));
      for(const entry of manifest.fixtures[id].files){const target=join(inputs,id,entry.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,readFileSync(join(source,entry.path)));}
    }
    assert.throws(()=>preparePrimaryEvaluation(inputs,{output:join(area,'unknown'),kernelCondition:'kernel_principles_v2_candidate'}),/aliases/);
    for (const fixtureSet of ['legacy9', null, 'unknown']) assert.throws(()=>preparePrimaryEvaluation(inputs,{output:join(area,'legacy-rejected'),fixtureSet}),/migration/);
    const prepared=preparePrimaryEvaluation(inputs,{output:join(area,'prepared'),evidenceKind:'synthetic',fixtureIds:[...PRIMARY_FIXTURE_IDS].sort()});
    assert.equal(prepared.status,'blocked');assert.equal(prepared.start_consumed,false);assert.equal(prepared.model_calls,0);
    assert.deepEqual(prepared.manifest.conditions,['plain','kernel_principles_v2','full_ask']);
    assert.equal(prepared.slots.length,27);assert.ok(prepared.slots.every(s=>s.state==='not_started'&&s.quality===null&&s.capability.status==='available'));
    assert.ok(!prepared.blockers.some(b=>b.reason.includes('capability missing')));
    for(const block of prepared.manifest.blocks){
      const plan=readUserComparisonPlan(block.root).plan;
      assert.equal(plan.config.kernel_condition,'kernel_principles_v2');assert.equal(plan.kernel_definition.generation.id,'kernel_principles_v2');
      assert.equal(plan.kernel_definition.assessment.task_class,plan.verification.recipe.runner_task_class);
      assert.equal(plan.kernel_definition.renderer_closure.length,3);
      assert.equal(plan.kernel_definition.renderer_closure[0].source_path,'scripts/kernel-principles-v2.mjs');
      assert.equal(plan.kernel_definition.renderer_closure[0].digest,comparisonHash(readFileSync(join(ROOT,'scripts/kernel-principles-v2.mjs'))));
      assert.equal(inspectUserComparison(block.root).execution.start_consumed,false);
      const report=reportUserComparison(block.root);assert.ok(report.slots.every(s=>s.state==='not_started'));
      assert.equal(report.summary.supplied_notes.kernel_condition,'kernel_principles_v2');
      const exported=exportPrimaryEvaluationGradingRequest(block).request;
      assert.equal(exported.profile_id,PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID);assert.deepEqual(exported.conditions,prepared.manifest.conditions);
      assert.ok(exported.slots.every(s=>s.quality===null));
    }
    const first=prepared.manifest.blocks[0],loaded=readUserComparisonPlan(first.root),definition=loaded.plan.kernel_definition;
    const metadataPath=join(first.root,definition.task_metadata.path),metadata=readFileSync(metadataPath);
    writeFileSync(metadataPath,'{}');assert.throws(()=>readUserComparisonPlan(first.root));writeFileSync(metadataPath,metadata);
    const dependency=join(first.root,definition.renderer_closure[0].path),renderer=readFileSync(dependency);
    writeFileSync(dependency,'changed');assert.throws(()=>readUserComparisonPlan(first.root));writeFileSync(dependency,renderer);
    const path=join(first.root,'control/plan.json'),raw=readFileSync(path),digest=readFileSync(join(first.root,'control/plan.digest'));
    for(const mutate of [p=>p.kernel_definition.assessment.task_class='trivial',p=>p.config.kernel_condition='kernel_principles_v1']){
      const plan=JSON.parse(raw);mutate(plan);const changed=Buffer.from(JSON.stringify(plan));writeFileSync(path,changed);writeFileSync(join(first.root,'control/plan.digest'),comparisonHash(changed));
      assert.throws(()=>readUserComparisonPlan(first.root));
    }
    writeFileSync(path,raw);writeFileSync(join(first.root,'control/plan.digest'),digest);
    assert.equal(inspectUserComparison(first.root).execution.start_consumed,false);
    assert.deepEqual(v1Conditions('kernel_principles_v1'),['plain','kernel_principles_v1','full_ask']);
    assert.throws(()=>v1Conditions('kernel_principles_v2'));
    assert.deepEqual(comparisonConditions('kernel_only'),['plain','kernel_only','full_ask']);
  }finally{rmSync(area,{recursive:true,force:true});}
});


test('default single catalog v7 preparation uses real public task inputs and leaves 72 unstarted slots',t=>{
 const area=realpathSync(mkdtempSync(join(tmpdir(),'ask-primary24-k2-native-')));
 try{
  const inputs=join(area,'public');mkdirSync(inputs);
  for(const id of CANONICAL_PRIMARY_FIXTURE_IDS){
   const source=join(ROOT,'benchmarks/fixtures/checkpoint-b2',id),manifest=JSON.parse(readFileSync(join(source,'input-manifest.json')));
   for(const entry of manifest.fixtures[id].files){const target=join(inputs,id,entry.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,readFileSync(join(source,entry.path)));}
  }
  const version=syntheticV7ScoringVersion(t,{fixtureIds:CANONICAL_PRIMARY_FIXTURE_IDS,fixtureSet:'catalog24'});
  const prepared=preparePrimaryEvaluation(inputs,{output:join(area,'prepared'),evidenceKind:'synthetic',scoringVersionPath:version.selector.path,scoringVersionDigest:version.selector.digest});
  assert.equal(prepared.model_calls,0);assert.equal(prepared.start_consumed,false);assert.equal(prepared.status,'blocked');
  assert.equal(prepared.manifest.fixture_set,'catalog24');assert.deepEqual(prepared.manifest.fixture_ids,CANONICAL_PRIMARY_FIXTURE_IDS);assert.deepEqual(prepared.manifest.blocks.map(block=>block.fixture_id),CANONICAL_PRIMARY_FIXTURE_IDS);
  assert.equal(prepared.slots.length,72);assert.ok(prepared.slots.every(slot=>slot.state==='not_started'&&slot.quality===null&&slot.capability.status==='available'));
  for(const block of prepared.manifest.blocks){const plan=readUserComparisonPlan(block.root).plan;assert.equal(plan.config.task_class,plan.verification.recipe.runner_task_class);assert.equal(plan.kernel_definition.assessment.task_class,plan.config.task_class);assert.equal(inspectUserComparison(block.root).execution.start_consumed,false);const exported=exportPrimaryEvaluationGradingRequest(block).request;assert.equal(exported.binding.fixture_id,block.fixture_id);assert.ok(exported.slots.every(slot=>slot.quality===null));}
  for(const block of prepared.manifest.blocks){assert.deepEqual(block.grading.scoring_version,version.selector);assert.equal(block.grading.binding.scoring_input_freeze_digest,comparisonHash(readFileSync(join(version.runtime,'benchmarks/fixtures/checkpoint-b2',block.fixture_id,'scoring-input-freeze-manifest.json'))));}
  const subsetIds=['hi-authorization-exception','mn-client-compatibility-fix'];
  const subset=preparePrimaryEvaluation(inputs,{output:join(area,'subset'),evidenceKind:'synthetic',fixtureIds:subsetIds,scoringVersionPath:version.selector.path,scoringVersionDigest:version.selector.digest});
  assert.deepEqual(subset.manifest.fixture_ids,subsetIds);assert.equal(subset.slots.length,6);assert.equal(subset.model_calls,0);
  assert.equal(subset.manifest.limits.token_budget,10000000);assert.ok(subset.slots.every(slot=>slot.quality===null));
  const added=prepared.manifest.blocks.find(block=>block.fixture_id==='hi-authorization-exception');
  const plan=readUserComparisonPlan(added.root).plan,extension=plan.kernel_definition.renderer_closure.at(-1);
  assert.equal(extension.source_path,'scripts/kernel-principles-v2-catalog24.mjs');
  const path=join(added.root,extension.path),original=readFileSync(path);writeFileSync(path,'drift');
  assert.throws(()=>readUserComparisonPlan(added.root));writeFileSync(path,original);
  assert.equal(inspectUserComparison(added.root).execution.start_consumed,false);
 }finally{rmSync(area,{recursive:true,force:true});}
});
