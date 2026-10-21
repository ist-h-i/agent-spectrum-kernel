import assert from 'node:assert/strict';
import test from 'node:test';
import {primaryProcessingDescriptor, primaryProcessingAuthorityPaths} from './ask-primary-scoring-version.mjs';
import {PRIMARY_RUNTIME_V10_REVISION, buildPrimaryRuntimeV10Binding, assertPrimaryRuntimeV10ScoringAuthority} from './ask-primary-runtime-v10.mjs';
import {canonicalDigest} from './content-addressed-store.mjs';
const digest='sha256:'+'a'.repeat(64);
function plan(kernel='kernel_principles_v2') {
 const ids=['plain',kernel,'full_ask'];
 const contract={kind:'ask_primary_execution_inputs_v2',mode:'closed_primary_inputs_v2',root:'/synthetic/v10',fixture_id:'hi-authorization-exception',
 source_digest:digest,public_recipe_digest:digest,public_routing_source:{processing_status:'not_admitted_for_scoring',schema:{path:'benchmarks/schemas/primary-public-capability-selection-v2.schema.json',digest}},
 public_inputs:{'task.md':{arm_relative_path:'task.md',launch_relative_path:'../task.md',digest,bytes:5,mode:'100644'}},
 conditions:Object.fromEntries(ids.map(id=>[id,{arm_root:'arms/'+id,launch_cwd:'/synthetic/v10/arms/'+id+'/workspace',
 input:{path:'inputs/primary-conditions/'+id+'.md',digest,bytes:20},auxiliary_inputs:id==='plain'?{}:{'AGENTS.md':{arm_relative_path:'AGENTS.md',launch_relative_path:'../AGENTS.md',digest,bytes:5,mode:'100644'}},
 work_products:[{arm_relative_path:'workspace/review.json',launch_relative_path:'review.json',initial_input_digest:null,provenance:'candidate_edit_and_final_snapshot_required'}],
 verification:[{command_id:'check',cwd:'/synthetic/v10/arms/'+id+'/workspace',executable:'/bin/bash',argv:['-lc','synthetic'],contract_command_digest:digest,rendered_event_command:'/bin/bash -lc synthetic'}]}])),
 runtime_attestation:'unknown',execution_authority:false,scoring_authority:false,formal_aggregate_eligible:false};
 contract.contract_digest=canonicalDigest(contract);
 return {run_id:'synthetic-run',root:'/synthetic/v10',config:{kernel_condition:kernel,primary_input_contract:'closed_primary_inputs_v2'},primary_execution_input:contract};
}
test('T10-SELECT explicit V10 descriptor and schema data only',()=>{
 assert.equal(PRIMARY_RUNTIME_V10_REVISION,'1.13.0-primary-app-server');
 const d=primaryProcessingDescriptor({commandEvidenceParserRevision:PRIMARY_RUNTIME_V10_REVISION});
 assert.ok(d.source_file_digests['scripts/ask-primary-runtime-v10.mjs']);
 assert.equal(Object.keys(d.source_file_digests).filter(p=>p.includes('saved-v10-')).length,8);
 const a=primaryProcessingAuthorityPaths(PRIMARY_RUNTIME_V10_REVISION);
 assert.ok(a.includes('benchmarks/schemas/primary-runtime-v10-binding.schema.json'));
 assert.ok(!a.includes('scripts/ask-primary-runtime-v10.mjs'));
});
for(const kernel of ['kernel_principles_v1','kernel_principles_v2'])test('T10-BIND/BLOCK same profile P/K/F '+kernel,()=>{
 const p=plan(kernel),b=buildPrimaryRuntimeV10Binding({plan:p,planDigest:digest});
 assert.deepEqual(Object.keys(b.conditions),['plain',kernel,'full_ask']);
 for(const [id,c]of Object.entries(b.conditions)){
  assert.equal(c.launch_cwd,p.primary_execution_input.conditions[id].launch_cwd);
  assert.equal(c.stdin.digest,digest);assert.equal(c.runtime.status,'unqualified');
  assert.equal(c.runtime.raw_stream_digest,null);assert.deepEqual(c.runtime.raw_pairs,[]);
 }
 assert.equal(b.scoring_authority,false);assert.equal(b.execution_authority,false);
 assert.throws(()=>assertPrimaryRuntimeV10ScoringAuthority(b),/v10_runtime_authority_unqualified/);
 const forged=structuredClone(b);forged.scoring_authority=true;
 assert.throws(()=>assertPrimaryRuntimeV10ScoringAuthority(forged),/v10_runtime_authority_unqualified/);
});
test('T10-BIND contract hash, condition/cwd and caller inputs remain closed',()=>{
 for(const mutate of [p=>p.primary_execution_input.scoring_authority=true,p=>p.primary_execution_input.conditions.plain.launch_cwd+='/..',p=>p.primary_execution_input.conditions.full_ask.input.digest='bad',p=>delete p.primary_execution_input.conditions.plain]){
  const p=plan();mutate(p);assert.throws(()=>buildPrimaryRuntimeV10Binding({plan:p,planDigest:digest}));
 }
 assert.throws(()=>buildPrimaryRuntimeV10Binding({plan:plan(),planDigest:digest,runtimeAuthority:true}));
});

import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,realpathSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {syntheticV10ScoringVersion} from './test-helpers-primary-evaluation-v10.mjs';
import {readPrimaryScoringVersion} from './ask-primary-scoring-version.mjs';
import {validateBenchmarkSchemaInstance} from './ask-benchmark-schema.mjs';
import {withPrimarySchemaBuild,primaryGradingSchemaPath,withPrimaryEvaluationProducer,withPrimaryProcessingSourceBuild} from './ask-primary-evaluation-scope.mjs';
import {deriveEvaluatorDependencyGraph} from './ask-benchmark-evaluator-boundary.mjs';
import {execFileSync} from 'node:child_process';
import {buildPrimaryFixtureRecipe} from './ask-primary-fixture-recipe.mjs';
import {prepareGitBaseline,prepareUserComparison,comparisonHash} from './ask-user-comparison-prepare.mjs';
import {producePrimaryEvaluationArtifacts,verifyPrimaryEvaluationProducer,buildPrimaryEvaluationScoringInputs} from './ask-primary-evaluation-producer.mjs';
import {preflightPrimaryEvaluationGrading,exportPrimaryEvaluationGradingRequest} from './ask-primary-evaluation-grading.mjs';
const ROOT=resolve(import.meta.dirname,'..');
test('T10-SELECT fixed selector and both profile additive schema mapping',t=>{
 const f=syntheticV10ScoringVersion(t);
 assert.equal(readPrimaryScoringVersion(f.selector,'mp-data-migration-handoff').processing.command_evidence_parser_revision,PRIMARY_RUNTIME_V10_REVISION);
 for(const profileId of ['primary_single_shot_v1','primary_principles_v2_single_shot_v1'])withPrimarySchemaBuild(()=>{
  assert.ok(primaryGradingSchemaPath('/synthetic/benchmarks/schemas/portfolio-command-evidence.schema.json').includes('-saved-v10-'));
 },{profileId,commandEvidenceParserRevision:PRIMARY_RUNTIME_V10_REVISION});
 const b=buildPrimaryRuntimeV10Binding({plan:plan(),planDigest:digest});
 assert.deepEqual(validateBenchmarkSchemaInstance(b,{schemaPath:join(ROOT,'benchmarks/schemas/primary-runtime-v10-binding.schema.json')}),[]);
 for(const mutate of [x=>x.scoring_authority=true,x=>x.conditions.plain.runtime.thread_id='pretend-native',x=>x.conditions.plain.runtime.raw_pairs.push({}),x=>x.extra=true]){
  const changed=structuredClone(b);mutate(changed);assert.ok(validateBenchmarkSchemaInstance(changed,{schemaPath:join(ROOT,'benchmarks/schemas/primary-runtime-v10-binding.schema.json')}).length>0);
 }
});
for(const kernelCondition of ['kernel_principles_v1','kernel_principles_v2'])test('T10-CUSTODY/BLOCK actual V2 preparation to candidate producer '+kernelCondition,async t=>{
 const fixtureId='mn-build-option-update',fixed=syntheticV10ScoringVersion(t,{fixtureIds:[fixtureId]});
 const area=realpathSync(mkdtempSync(join(tmpdir(),'v10-public-preparation-')));t.after(()=>rmSync(area,{recursive:true,force:true}));
 const repo=join(area,'seed');mkdirSync(repo);const base=join(ROOT,'benchmarks/fixtures/checkpoint-b2',fixtureId),manifest=JSON.parse(readFileSync(join(base,'input-manifest.json')));
 for(const entry of manifest.fixtures[fixtureId].files){const target=join(repo,entry.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,readFileSync(join(base,entry.path)));}
 const commit=prepareGitBaseline(repo),recipe=buildPrimaryFixtureRecipe(fixtureId),verification=join(area,'verification.json');writeFileSync(verification,JSON.stringify(recipe));
 const prepared=prepareUserComparison({repo,commit,taskFile:join(repo,'task.md'),verificationFile:verification,output:join(area,'prepared'),mutablePaths:recipe.mutable_paths,
 taskClass:recipe.runner_task_class,kernelCondition,executionContract:'single_shot_v1',evidenceKind:'synthetic',cliBin:'/synthetic/never-start',primaryInputContract:'closed_primary_inputs_v2'});
 const block={root:prepared.root,run_id:prepared.plan.run_id,plan_digest:prepared.plan_digest,fixture_id:fixtureId,grading:{scoring_version:fixed.selector}};
 const target=join(area,'producer'),made=await producePrimaryEvaluationArtifacts(block,target);assert.equal(made.preparation_only,true);assert.equal(made.normalized,null);
 const options={recordRoot:target,externalDigest:made.external_digest},verified=verifyPrimaryEvaluationProducer(options);
 assert.equal(verified.preparationOnly,true);assert.deepEqual(Object.keys(verified.binding.conditions),['plain',kernelCondition,'full_ask']);
 assert.equal(existsSync(join(prepared.root,'control/start.json')),false);
 assert.throws(()=>withPrimaryEvaluationProducer(options,()=>assert.fail('scope granted')),/v10_runtime_authority_unqualified/);
 assert.throws(()=>buildPrimaryEvaluationScoringInputs(options),/v10_runtime_authority_unqualified/);
 const preflight=preflightPrimaryEvaluationGrading(block);assert.equal(preflight.status,'not_scoring_ready');assert.ok(preflight.blockers.includes('v10_runtime_authority_unqualified'));
 assert.throws(()=>exportPrimaryEvaluationGradingRequest(block),/closed primary input processing/);
 await assert.rejects(()=>producePrimaryEvaluationArtifacts(block,join(area,'override'),{commandEvidenceParserRevision:'1.12.0-primary-saved'}),/override refused/);
 assert.equal(existsSync(join(area,'override')),false);
 const bindingPath=join(target,'runtime-binding.json'),original=readFileSync(bindingPath);writeFileSync(bindingPath,Buffer.from(original.toString().replace('unqualified','qualified')));
 assert.throws(()=>verifyPrimaryEvaluationProducer(options),/inventory changed/);writeFileSync(bindingPath,original);
 const stdin=join(prepared.root,prepared.plan.primary_execution_input.conditions.plain.input.path);writeFileSync(stdin,'changed input');
 assert.throws(()=>verifyPrimaryEvaluationProducer(options));
 assert.equal(made.model_calls,0);assert.equal(made.grader_process_starts,0);
});

test('T10-CLOSURE registered source construction types only schemas/generator as authority data',()=>{
 const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
 const descriptor=primaryProcessingDescriptor({commandEvidenceParserRevision:PRIMARY_RUNTIME_V10_REVISION});
 const graph=withPrimaryProcessingSourceBuild({root:ROOT,baseRevision:revision,commandEvidenceParserRevision:PRIMARY_RUNTIME_V10_REVISION},()=>deriveEvaluatorDependencyGraph({root:ROOT,baseRevision:revision}));
 const data=new Set(primaryProcessingAuthorityPaths(PRIMARY_RUNTIME_V10_REVISION));
 for(const[path,digest]of Object.entries(descriptor.source_file_digests)){const node=graph.node_inventory.find(n=>n.path===path);assert.ok(node,path);assert.equal(node.sha256,digest);assert.equal(node.file_type,data.has(path)?'authority_data':'module',path);}
 assert.equal(data.has('scripts/ask-primary-runtime-v10.mjs'),false);
});
