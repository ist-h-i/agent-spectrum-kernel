import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { syntheticPrimarySource } from './test-helpers-primary-evaluation-producer.mjs';
import { producePrimaryEvaluationArtifacts, verifyPrimaryEvaluationProducer, materializePrimaryEvaluationCandidate, buildPrimaryEvaluationScoringInputs,
  createPrimaryEvaluationSealedEvaluatorExecution } from './ask-primary-evaluation-producer.mjs';
import { PRIMARY_PROFILE_SCHEMAS, activePrimaryProducer, primaryGradingSchemaPath, primaryGradingConditions, withPrimaryEvaluationProducer, withPrimarySchemaBuild, primaryFinalResponseRelativePath } from './ask-primary-evaluation-scope.mjs';
import { generatePrimaryGradingSchemas, primarySchemaBytes } from './generate-ask-primary-grading-schemas.mjs';
import { verifyEvaluatorAuthority, validateSealedPrivateFinalOutputEvidence } from './ask-benchmark-evaluator-boundary.mjs';
import { computeEvaluationDigest, computeEvaluationId } from './ask-benchmark-evaluator-boundary.mjs';
import { buildPortfolioEngineeringResult } from './ask-benchmark-portfolio-score.mjs';
import { resolveEffectiveAdmissionAuthority } from './ask-benchmark-admission-decision.mjs';
const legacy = '/example/benchmarks/schemas/normalized-portfolio-result.schema.json';
async function produce(t, options) { const source = syntheticPrimarySource(t, options), produced = await producePrimaryEvaluationArtifacts(source.block, join(source.root,'producer')); return { ...source, produced, options:{recordRoot:produced.output_root,externalDigest:produced.external_digest} }; }
test('additive schemas preserve base bytes and exact primary IDs without leaking scope', () => {
  generatePrimaryGradingSchemas({check:true}); assert.equal(primaryGradingSchemaPath(legacy),legacy);
  for (const name of PRIMARY_PROFILE_SCHEMAS) assert.deepEqual(readFileSync(new URL(`../benchmarks/schemas/primary-${name}.schema.json`,import.meta.url)),primarySchemaBytes(name));
  withPrimarySchemaBuild(()=>{assert.match(primaryGradingSchemaPath(legacy),/primary-normalized/);assert.deepEqual(primaryGradingConditions(['plain','kernel_only','adaptive_ask','full_ask']),['plain','kernel_principles_v1','full_ask']);assert.throws(()=>primaryGradingConditions(['plain','core','full']),/mix/);});
  assert.equal(primaryGradingSchemaPath(legacy),legacy); assert.throws(()=>withPrimarySchemaBuild(()=>Promise.resolve()),/async_scope/);
});
test('saved pending inputs normalize to three pending rows without inventing terminal attempts', async t => {
  const p=await produce(t,{scenario:'pending'}); assert.equal(p.produced.normalized.manifest.cases.length,3);
  assert.ok(p.produced.normalized.manifest.cases.every(c=>c.normalized_attempts.length===0));
  assert.equal(p.produced.scoring_ready,false);assert.equal(p.produced.model_calls,0);assert.equal(p.produced.grader_process_starts,0);
});
test('saved synthetic controller bytes reuse original normalizer/candidate helpers with actual K ID and null usage', async t => {
  const p=await produce(t),v=verifyPrimaryEvaluationProducer(p.options);assert.equal(v.evidence_kind,'synthetic');
  for(const condition of ['plain','kernel_principles_v1','full_ask']){
    const input=buildPrimaryEvaluationScoringInputs(p.options,{condition});assert.equal(input.normalizedResult.lineage.condition,condition);
    assert.equal(input.normalizedResult.outcome,'completed');assert.equal(input.normalizedResult.telemetry.input_tokens.value,20);
    assert.equal(input.normalizedResult.telemetry.cached_tokens.status,'unknown');assert.equal(input.normalizedResult.telemetry.cached_tokens.value,null);
    for(const key of ['thermal_state','model','reasoning_effort','permission_policy'])assert.equal(input.normalizedResult.telemetry[key].status,'unknown');
    assert.equal(input.normalizedResult.telemetry.sandbox_policy.value,'workspace-write');
    const declared=JSON.parse(readFileSync(join(p.options.recordRoot,'run/adapters/codex.json')));assert.equal(declared.model,p.plan.config.model);assert.equal(declared.reasoning_effort,p.plan.config.reasoning);assert.equal(declared.permission_policy,'unknown');
    assert.equal(input.normalizedResult.command_evidence.succeeded_command_ids.length,p.plan.verification.recipe.checks.length);assert.equal(input.scoring_ready,false);
    assert.ok(input.missing_inputs.includes('privateRoot'));assert.ok(input.missing_inputs.includes('frozenSourceRoot'));
    assert.equal(input.frozen_admission_status,'admission_pending');assert.equal(input.effective_admission_authority,'unresolved');
    const parent=join(p.root,`candidate-${condition}`);mkdirSync(parent,{mode:0o700});
    const candidate=materializePrimaryEvaluationCandidate(p.options,{condition,outputParent:parent});
    assert.equal(candidate.verified_authority.normalized_result.lineage.condition,condition);
    for(const file of Object.keys(p.plan.source.inventory))assert.deepEqual(readFileSync(join(candidate.output_root,file)),readFileSync(join(p.block.public_input_root,file)));
  }
  assert.equal(activePrimaryProducer(),false);
});
for(const command of ['missing','failed'])test(`native public checks do not replace ${command} model command evidence`,async t=>{
  const p=await produce(t,{command}),input=buildPrimaryEvaluationScoringInputs(p.options,{condition:'kernel_principles_v1'});
  assert.equal(input.normalizedResult.command_evidence.succeeded_command_ids.length,0);
  assert.equal(input.normalizedResult.command_evidence[command==='missing'?'unavailable_command_ids':'failed_command_ids'].length,p.plan.verification.recipe.checks.length);
  assert.equal(input.scoring_ready,false);
});
for(const scenario of ['failed','unknown_exit'])test(`${scenario} model CLI exit remains failed through normalization`,async t=>{const p=await produce(t,{scenario});assert.equal(buildPrimaryEvaluationScoringInputs(p.options,{condition:'plain'}).normalizedResult.outcome,'failed');});
test('independent public check failure preserves model CLI completed and saved controller state',async t=>{
  const p=await produce(t,{scenario:'verification_failed'}),input=buildPrimaryEvaluationScoringInputs(p.options,{condition:'plain'}),v=verifyPrimaryEvaluationProducer(p.options);
  assert.equal(input.normalizedResult.outcome,'completed');assert.equal(input.normalizedResult.telemetry.failure_kind.status,'not_applicable');
  assert.equal(v.inspection.cases[0].attempts[0].result.saved_controller_state,'verification_failed');
  const slot=v.request.slots.find(item=>item.condition==='plain');assert.equal(slot.state,'verification_failed');assert.ok(slot.native_checks.every(check=>check.exit_code===2));
});
test('producer source/artifact/transplant changes and async authority leakage are rejected',async t=>{
  const p=await produce(t);withPrimaryEvaluationProducer(p.options,()=>{assert.equal(activePrimaryProducer(),true);assert.throws(()=>verifyEvaluatorAuthority({}),/cannot_authorize_scoring/);});
  let descendant;withPrimaryEvaluationProducer(p.options,()=>{descendant=new Promise(resolve=>queueMicrotask(()=>resolve(activePrimaryProducer())));});assert.equal(await descendant,false);
  assert.throws(()=>withPrimaryEvaluationProducer(p.options,()=>Promise.resolve()),/async_scope/);
  assert.throws(()=>verifyPrimaryEvaluationProducer({...p.options,externalDigest:'sha256:'+'a'.repeat(64)}),/pin/);
  writeFileSync(join(p.options.recordRoot,'plan.json'),'changed');assert.throws(()=>verifyPrimaryEvaluationProducer(p.options),/artifact_inventory|artifact inventory/);
});
test('retained changed bytes reconstruct the candidate and original-byte drift blocks replay',async t=>{
  const p=await produce(t,{mutate:true}),condition='kernel_principles_v1',changed=p.plan.mutable_paths.find(path=>Object.hasOwn(p.plan.arms[condition].baseline_inventory,path));
  const parent=join(p.root,'changed-candidate');mkdirSync(parent,{mode:0o700});const candidate=materializePrimaryEvaluationCandidate(p.options,{condition,outputParent:parent});
  const original=join(p.block.root,'control/patch-workspaces',condition,changed);
  assert.deepEqual(readFileSync(join(candidate.output_root,changed)),readFileSync(original));
  writeFileSync(original,'changed after terminal');assert.throws(()=>verifyPrimaryEvaluationProducer(p.options),/original evidence changed/);
});
test('missing retained changed bytes are refused before producer publication',async t=>{
  const p=syntheticPrimarySource(t,{mutate:true}),path=p.plan.mutable_paths.find(path=>Object.hasOwn(p.plan.arms.plain.baseline_inventory,path));
  writeFileSync(join(p.block.root,'control/patch-workspaces/plain',path),'substituted');
  const output=join(p.root,'producer');await assert.rejects(producePrimaryEvaluationArtifacts(p.block,output),/retained terminal bytes changed/);assert.equal(existsSync(output),false);
});
test('original pure engineering calculation preserves non-readiness, null score and registered metadata',async t=>{
  const p=await produce(t),input=buildPrimaryEvaluationScoringInputs(p.options,{condition:'kernel_principles_v1'}),n=input.normalizedResult;
  const read=path=>JSON.parse(readFileSync(path)),s=input.scorerOptions,freeze=read(s.scoringInputFreezeManifestPath),requirement=read(s.requirementRecordPath),admission=read(s.admissionRecordPath),reference=read(s.referencePath);
  const scoringInputs={scoringPolicy:read(s.scoringPolicyPath),requirementRecord:requirement};
  const result={scoring_input_freeze_manifest_source_digest:s.scoringInputFreezeManifestSourceDigest,scoring_input_freeze_manifest_digest:freeze.manifest_digest,
    catalog_digest:read(s.catalogPath).catalog_digest,policy_manifest_digest:read(s.policyManifestPath).manifest_digest,scoring_policy_digest:scoringInputs.scoringPolicy.policy_digest,
    admission_record_digest:admission.admission_digest,requirement_record_digest:requirement.requirement_record_digest,requirement_set_digest:requirement.requirement_set_digest,
    output_contract_digest:read(s.outputContractPath).output_contract_digest,evaluator_public_reference_digest:reference.public_metadata_digest,
    evaluator_bundle_id:reference.evaluator_bundle_id,evaluator_bundle_digest:reference.evaluator_bundle_digest,evaluator_revision:reference.evaluator_revision,
    normalized_result_id:n.normalized_result_id,normalized_result_digest:n.normalized_result_digest,source_snapshot_digest:s.sourceSnapshotDigest,
    run_instance_id:n.lineage.run_instance_id,plan_id:n.lineage.plan_id,plan_digest:n.lineage.plan_digest,fixture_id:n.lineage.fixture_id,fixture_input_digest:n.lineage.fixture_input_digest,
    case_id:n.lineage.case_id,attempt:n.lineage.attempt,adapter:n.lineage.adapter_track,condition:n.lineage.condition,repetition:1,
    evaluation_status:'evaluator_unavailable',requirement_results:[],false_positives:[],scope_deviations:[],required_mechanisms:[],unnecessary_mechanisms:[],unsafe_attempted_actions:[]};
  for(const key of ['quality','safety','decision_correctness','verification_correctness','evidence_correctness','approval_correctness','completion_claim_correctness','under_processing','over_processing'])result[key]={state:'unavailable',evidence_references:[]};
  result.evaluation_id=computeEvaluationId(result);result.evaluation_digest=computeEvaluationDigest(result);
  const effectiveAdmissionAuthority=resolveEffectiveAdmissionAuthority({frozenAdmissionRecord:admission,requirementRecord:requirement,evaluatorReference:reference,root:s.root});
  const calculation=withPrimarySchemaBuild(()=>buildPortfolioEngineeringResult({normalized:n,result,evaluationReady:false,scoringInputs,effectiveAdmissionAuthority},{root:s.root}));
  assert.equal(calculation.condition,'kernel_principles_v1');assert.equal(calculation.scoring_status,'not_scoring_ready');
  assert.ok(Object.values(calculation.requirement_score).every(value=>value===null));assert.equal(calculation.blockers.gate_status,'not_scoring_ready');
  assert.equal(calculation.boundaries.aggregate_result,false);assert.equal(p.produced.formal_aggregate_eligible,false);assert.equal(n.lineage.repetition,1);
  assert.equal(n.lineage.registered_repetitions,JSON.parse(readFileSync(new URL('../benchmarks/adaptive-portfolio.config.json',import.meta.url))).fixtures.find(f=>f.id===n.lineage.fixture_id).repetitions);
});
test('scoring source root stays independent and changed freeze metadata is refused',async t=>{
  const p=await produce(t),root=join(p.root,'frozen-public-source'),input=buildPrimaryEvaluationScoringInputs(p.options,{condition:'plain'});
  const relative='benchmarks/fixtures/checkpoint-b2/mn-build-option-update/scoring-input-freeze-manifest.json',path=join(root,relative);
  mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,readFileSync(input.scorerOptions.scoringInputFreezeManifestPath),{mode:0o600});
  const mapped=buildPrimaryEvaluationScoringInputs(p.options,{condition:'plain',frozenSourceRoot:root});
  assert.equal(mapped.scorerOptions.root,root);assert.equal(mapped.privateHelperOptions.root,root);
  for(const name of ['catalogPath','policyManifestPath','scoringPolicyPath','admissionRecordPath','requirementRecordPath','outputContractPath','referencePath'])assert.ok(mapped.scorerOptions[name].startsWith(root+'/'));
  writeFileSync(path,Buffer.concat([readFileSync(path),Buffer.from('\n')]));assert.throws(()=>buildPrimaryEvaluationScoringInputs(p.options,{condition:'plain',frozenSourceRoot:root}));
});
test('original private constructor requires runtime assets without inventing a model command success gate',async t=>{
  const p=await produce(t);assert.throws(()=>createPrimaryEvaluationSealedEvaluatorExecution(p.options,{condition:'plain'}),/original private runtime inputs required/);
  for(const command of ['missing','failed']){
    const p=await produce(t,{command});assert.throws(()=>createPrimaryEvaluationSealedEvaluatorExecution(p.options,{condition:'plain',privateRoot:'/must-not-open/private',privateEvaluationRoot:'/must-not-open/grader',manifestPath:'/must-not-open/private/manifest.json'}),/original private runtime inputs required/);
  }
});
test('admission review forwarding preserves frozen pending bytes and refuses partial overlay inputs',async t=>{
  const p=await produce(t),before=readFileSync(buildPrimaryEvaluationScoringInputs(p.options,{condition:'plain'}).scorerOptions.admissionRecordPath);
  const review={admissionDecisionPath:'/unopened/decision',admissionReviewAuthorityPath:'/unopened/authority',admissionReviewAuthoritySourceDigest:'sha256:'+'a'.repeat(64),admissionReviewArchivePath:'/unopened/archive'};
  const inputs=buildPrimaryEvaluationScoringInputs(p.options,{condition:'plain',...review});
  for(const [key,value]of Object.entries(review))assert.equal(inputs.scorerOptions[key],value);
  assert.equal(inputs.frozen_admission_status,'admission_pending');assert.equal(inputs.effective_admission_authority,'unresolved');
  assert.deepEqual(readFileSync(inputs.scorerOptions.admissionRecordPath),before);
  assert.throws(()=>buildPrimaryEvaluationScoringInputs(p.options,{condition:'plain',admissionDecisionPath:review.admissionDecisionPath}),/supplied together/);
});
test('saved sanitized plain response is not typed JSON; only verified primary UTF8 evidence is accepted',async t=>{
  const p=await produce(t),input=buildPrimaryEvaluationScoringInputs(p.options,{condition:'kernel_principles_v1'}),n=input.normalizedResult;
  const original=readFileSync(join(p.block.root,'control/slots/kernel_principles_v1/last-message.txt'));
  const candidateAuthority={kind:'verified_terminal_candidate',run_instance_id:n.lineage.run_instance_id,case_id:n.lineage.case_id,attempt:n.lineage.attempt};
  const evidence={root:input.scorerOptions.root,normalized:n,candidateAuthority,evidenceBuffers:new Map([['verified-agent-final.json',original]])};
  assert.throws(()=>validateSealedPrivateFinalOutputEvidence(evidence),/JSON/);
  assert.equal(primaryFinalResponseRelativePath(n),null);
  withPrimaryEvaluationProducer(p.options,()=>{
    const path=primaryFinalResponseRelativePath(n);assert.ok(path.endsWith('/primary-response.txt'));
    assert.deepEqual(readFileSync(join(input.scorerOptions.runDir,path)),original);
    assert.equal(existsSync(join(input.scorerOptions.runDir,path.replace('primary-response.txt','final.json'))),false);
    validateSealedPrivateFinalOutputEvidence(evidence);
    assert.throws(()=>validateSealedPrivateFinalOutputEvidence({...evidence,evidenceBuffers:new Map([['verified-agent-final.json',Buffer.from('substituted')]])}),/differs from normalized authority/);
    const transplanted=structuredClone(n);transplanted.lineage.condition='core';
    assert.throws(()=>validateSealedPrivateFinalOutputEvidence({...evidence,normalized:transplanted}),/primary_final_response_lineage_changed/);
  });
  assert.throws(()=>validateSealedPrivateFinalOutputEvidence(evidence),/JSON/);
});
