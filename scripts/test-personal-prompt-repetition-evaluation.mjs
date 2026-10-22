import test from 'node:test';
import assert from 'node:assert/strict';
import { repetitionRecommendationPolicy, sealPersonalPromptRepetitionPlan, verifyPersonalPromptRepetitionPlan, verifyPersonalPromptRepetitionResults,
  publishPersonalPromptRepetitionProposal, inspectPromptRepetitionModelIdentity } from './ask-personal-prompt-repetition-evaluation.mjs';
test('new repeat count is explicit; no old single-shot or implicit three-repeat default',()=>{
 assert.equal(typeof repetitionRecommendationPolicy,'function');assert.deepEqual(repetitionRecommendationPolicy(),repetitionRecommendationPolicy());
 assert.equal(typeof sealPersonalPromptRepetitionPlan,'function');
 assert.equal(typeof verifyPersonalPromptRepetitionResults,'function');
 assert.equal(typeof publishPersonalPromptRepetitionProposal,'function');
});
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalDigest,readContentAddressedJson,putContentAddressedJson,listContentAddressedJson} from './content-addressed-store.mjs';
import {verifyEvolutionRecommendation,verifyEvolutionActionProposal} from './evolution-loop.mjs';
import {comparisonHash} from './ask-user-comparison-prepare.mjs';
import {collectSyntheticTerminal,collectSyntheticGrade,fakeEngineeringTemplate} from './test-helpers-personal-evolution-primary-pair.mjs';
import {buildFixture}from'./test-helpers-personal-prompt-repetition.mjs';
const read=(root,d)=>readContentAddressedJson({storeRoot:root,digest:d}).value;
// Owned artificial controller records only; not a provider/model observation.
function labelSyntheticControllerModel(block,model){
 const terminals={};for(const condition of ['plain','kernel_principles_v1','full_ask']){
  const folder=join(block.root,'control/slots',condition),path=join(folder,'result.json'),record=JSON.parse(readFileSync(path));assert.equal(record.evidence_kind,'synthetic');record.actual_model=model;writeFileSync(path,JSON.stringify(record,null,2)+'\n');terminals[condition]=comparisonHash(readFileSync(path));writeFileSync(join(folder,'result.digest'),terminals[condition]);
 }
 const path=join(block.root,'control/history/00000001/record.json'),history=JSON.parse(readFileSync(path));for(const [c,d]of Object.entries(terminals))history.slots[c].terminal_digest=d;writeFileSync(path,JSON.stringify(history,null,2)+'\n');writeFileSync(join(block.root,'control/history/00000001/record.digest'),comparisonHash(readFileSync(path)));
}
test('original controller identity: unknown holds, declared name is not observation, mismatch refuses',()=>{
 const report={slots:[{condition:'full_ask',launch_requested:true,configured_model:'fixed',actual_model:null}]};assert.equal(inspectPromptRepetitionModelIdentity(report,'fixed').status,'unknown');report.slots[0].actual_model='other';assert.throws(()=>inspectPromptRepetitionModelIdentity(report,'fixed'),/actual controller model differs/);report.slots[0].actual_model='fixed';assert.equal(inspectPromptRepetitionModelIdentity(report,'fixed').status,'observed');
});

test('real normal CAS/pair/producer verification composes into a fixed repetition readout (all synthetic)',async t=>{
 const f=buildFixture(t);
 const pending=verifyPersonalPromptRepetitionResults(f.args);
 assert.equal(pending.status,'hold_incomplete');assert.equal(pending.report.cells.length,6);assert.equal(pending.report.summary.coverage.scored_cells,0);assert.equal(pending.recommendation.recommendation,'insufficient_evidence');
 assert.throws(()=>verifyPersonalPromptRepetitionResults({...f.args,trustedRepetitionPlanObjectDigests:[]}),/independent pre-result/);
 const rewritePlan=change=>{const p=structuredClone(f.repetition.plan);change(p);delete p.plan_digest;p.plan_digest=canonicalDigest(p);const d=putContentAddressedJson({storeRoot:f.storeRoot,artifact:p}).digest;return{...f.args,repetitionPlanObjectDigest:d,trustedRepetitionPlanObjectDigests:[d]};};
 assert.throws(()=>verifyPersonalPromptRepetitionPlan(rewritePlan(p=>{p.members[1].experiment_object_digest=p.members[0].experiment_object_digest;})),/distinct member/);
 const wrongRubric=putContentAddressedJson({storeRoot:f.storeRoot,artifact:{kind:'personal_prompt_repetition_rubric_definition_v1',timing:'after_model_outputs',definitions:'invalid timing',adjudication:'two_independent_blind_reviewers'}}).digest;
 assert.throws(()=>verifyPersonalPromptRepetitionPlan(rewritePlan(p=>{p.rubric_definition_object_digest=wrongRubric;})),/before_model_outputs/);
 const nested=structuredClone(f.members[1].registration);nested.output_root=join(f.members[0].blocks.baseline[0].root,'nested-repeat-output');mkdirSync(nested.output_root);delete nested.pair_digest;nested.pair_digest=canonicalDigest(nested);const nestedPin=putContentAddressedJson({storeRoot:f.storeRoot,artifact:nested}).digest;
 const overlap=rewritePlan(p=>{p.members[1].pair_registration_object_digest=nestedPin;});overlap.trustedPairRegistrationObjectDigests.push(nestedPin);
 assert.throws(()=>verifyPersonalPromptRepetitionPlan(overlap),/roots overlap/);
 // Only a whole independently trusted evaluation may publish normal artifacts.
 const publishPending={...f.args,lifecyclePlanObjectDigest:f.noOpPin,trustedLifecyclePlanObjectDigests:[f.noOpPin]};
 assert.throws(()=>publishPersonalPromptRepetitionProposal(publishPending),/whole repetition evaluation/);
 const pendingPub=publishPersonalPromptRepetitionProposal({...publishPending,trustedEvaluationAuthorities:[pending.evidence]});
 const pendingChecked=verifyEvolutionRecommendation({...f.args,recommendationObjectDigest:pendingPub.recommendation_object_digest,trustedEvaluationAuthorities:[pending.evidence]});assert.equal(pendingChecked.recommendation.recommendation,'insufficient_evidence');
 const template=fakeEngineeringTemplate(f.root),savedMembers=[];
 for(const [repeat,member]of f.members.entries()){
  mkdirSync(join(member.registration.output_root,'invocation'));
  writeFileSync(join(member.registration.output_root,'invocation/request.json'),JSON.stringify({pair_object_digest:member.pairRegistrationObjectDigest,started_at_ms:1,deadline_at_ms:100,repetition_plan_object_digest:f.repetition.object_digest}));
  const savedResults={baseline:{},challenger:{}},trusted=[];
  for(const role of ['baseline','challenger']){
   const block=member.blocks[role][0];collectSyntheticTerminal(t,block);labelSyntheticControllerModel(block,'gpt-5.6-sol');
   const grade=await collectSyntheticGrade(t,f,block,template,{quality:role==='baseline'?0.5:0.6,safety:'pass'});savedResults[role][block.fixture_id]=grade;trusted.push(grade.engineering_result.digest);
  }
  savedMembers.push({pairRegistrationObjectDigest:member.pairRegistrationObjectDigest,savedResults,trustedSavedEngineeringResultDigests:trusted});
 }
 const options={...f.args,savedMembers},noAux=verifyPersonalPromptRepetitionResults(options);
 assert.equal(noAux.report.summary.coverage.scored_cells,6);assert.equal(noAux.report.summary.quality.conclusion,'improved');assert.equal(noAux.recommendation.recommendation,'insufficient_evidence','missing whole auxiliary/cost does not become positive');
 const witness=putContentAddressedJson({storeRoot:f.storeRoot,artifact:{kind:'synthetic_only_human_rubric_cost_receipt',real_authority:false}}).digest;
 const aux={kind:'personal_prompt_repetition_auxiliary_v1',plan_object_digest:f.repetition.object_digest,rubric_definition_object_digest:f.repetition.plan.rubric_definition_object_digest,evidence_kind:'synthetic',cells:noAux.report.cells.map(c=>({repeat:c.repeat,fixture_id:c.fixture_id,role:c.role,controller_report_digest:c.controller_report_digest,rubric:{status:'complete',violations:0,severe:false},monetary_cost:{status:'known',value:100},evidence_refs:[witness]})),overhead:{status:'known',tokens:0,duration_ms:0,cost_microunits:0,evidence_refs:[witness]}};
 const pub=putContentAddressedJson({storeRoot:f.storeRoot,artifact:aux}).digest;
 const complete={...options,auxiliaryReportObjectDigest:pub,trustedAuxiliaryReportObjectDigests:[pub]};
 assert.throws(()=>verifyPersonalPromptRepetitionResults({...complete,trustedAuxiliaryReportObjectDigests:[]}),/whole auxiliary/);
 const result=verifyPersonalPromptRepetitionResults(complete);
 assert.equal(result.recommendation.recommendation,'expand');
 const auxRewrite=change=>{const a=structuredClone(aux);change(a);const d=putContentAddressedJson({storeRoot:f.storeRoot,artifact:a}).digest;return{...options,auxiliaryReportObjectDigest:d,trustedAuxiliaryReportObjectDigests:[d]};};
 assert.throws(()=>verifyPersonalPromptRepetitionResults(auxRewrite(a=>{a.cells.pop();})),/full denominator/);
 assert.throws(()=>verifyPersonalPromptRepetitionResults(auxRewrite(a=>{a.cells[0].controller_report_digest=canonicalDigest('foreign controller');})),/controller report transplant/);
 const positive=publishPersonalPromptRepetitionProposal({...complete,lifecyclePlanObjectDigest:f.adoptPin,trustedLifecyclePlanObjectDigests:[f.adoptPin],trustedEvaluationAuthorities:[result.evidence]});
 const candidateObjectDigest=read(f.storeRoot,f.args.preparationObjectDigest).candidate_object_digest;
 const checked=verifyEvolutionActionProposal({...f.args,candidateObjectDigest,proposalObjectDigest:positive.proposal_object_digest,recommendationObjectDigest:positive.recommendation_object_digest,trustedEvaluationAuthorities:[result.evidence]});assert.equal(checked.proposal.action,'adopt_candidate');assert.equal(positive.authority_implied,false);assert.equal(positive.models_started,false);
 const requestPath=join(f.members[0].registration.output_root,'invocation/request.json'),requestBytes=readFileSync(requestPath),request=JSON.parse(requestBytes);
 try{delete request.repetition_plan_object_digest;writeFileSync(requestPath,JSON.stringify(request));assert.throws(()=>verifyPersonalPromptRepetitionResults(complete),/old\/late repetition binding refused/);
  request.repetition_plan_object_digest=canonicalDigest('wrong pre-result population');writeFileSync(requestPath,JSON.stringify(request));assert.throws(()=>verifyPersonalPromptRepetitionResults(complete),/fixed repetition invocation binding required/);
 }finally{writeFileSync(requestPath,requestBytes);}
 const before=listContentAddressedJson({storeRoot:f.storeRoot}).length;
 verifyPersonalPromptRepetitionResults(complete);assert.equal(listContentAddressedJson({storeRoot:f.storeRoot}).length,before,'verification publishes nothing');
 assert.throws(()=>sealPersonalPromptRepetitionPlan(f.sealArgs),/post-result|fixed repetition invocation binding/);
 const missing=verifyPersonalPromptRepetitionResults({...options,savedMembers:savedMembers.slice(1)});
 assert.equal(missing.status,'hold_incomplete');assert.equal(missing.report.cells.length,6);assert.equal(missing.report.summary.coverage.scored_cells,4);assert.equal(missing.report.summary.coverage.complete_pairs,2);assert.equal(missing.recommendation.recommendation,'insufficient_evidence');
});
