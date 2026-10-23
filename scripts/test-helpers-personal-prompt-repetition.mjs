// Artificial pre-result registrations only. No model or original acceptance evidence.
import {mkdirSync,readFileSync,writeFileSync}from'node:fs';
import {join}from'node:path';
import {canonicalDigest,readContentAddressedJson,putContentAddressedJson,listContentAddressedJson}from'./content-addressed-store.mjs';
import {buildEvolutionExperiment,publishEvolutionExperiment}from'./evolution-loop.mjs';
import {buildVerificationRequirements}from'./verification-evidence.mjs';
import {publishPortfolioManifest,computePortfolioSelectionBasisDigest}from'./portfolio-manager.mjs';
import {comparisonHash}from'./ask-user-comparison-prepare.mjs';
import {repetitionRecommendationPolicy,sealPersonalPromptRepetitionPlan}from'./ask-personal-prompt-repetition-evaluation.mjs';
import {PROMPT_REPETITION_POLICY}from'./ask-personal-prompt-repetition-statistics.mjs';
import {historicalPersonalPairFixture as sealPersonalEvolutionPromptPair,setup,blocksFor,bindSyntheticRoleGrading}from'./test-helpers-personal-evolution-primary-pair.mjs';
const read=(root,d)=>readContentAddressedJson({storeRoot:root,digest:d}).value;
export function buildFixture(t,{withGrading=false}={}){
 const f=setup(t),base=read(f.storeRoot,f.args.experimentObjectDigest),members=[],args={...f.args,trustedExperimentObjectDigests:[]};
 const candidate=f.aligned.prepared.candidate,{lock_digest,...parent}=candidate.parent_portfolio;
 const noOpPlan={base_registry_snapshot_digest:candidate.registry.snapshot_digest,base_portfolio_lock_digest:lock_digest,base_current_manifest:parent,target_manifest:parent,rollback_anchor:parent,portfolio_transitions:[],asset_transitions:[],reason_codes:['synthetic_only_noop_plan']};
 const draft=structuredClone(read(f.storeRoot,f.aligned.roles.challenger.portfolio.manifest_digest));delete draft.asset_set_digest;delete draft.selection_basis_digest;
 draft.revision='synthetic-only-prospective-adopt';draft.rollback={...draft.rollback,mode:'exact',target:parent};draft.entries[0].assurance_lane='challenger';draft.entries[0].role='challenger';draft.entries[0].exposure={mode:'canary',canary_percent:10};
 // A prospective artificial gate requirement, never a performed verification.
 const templateManifest=listContentAddressedJson({storeRoot:join(import.meta.dirname,'../docs/fixtures/portfolio-manager/store')}).map(r=>r.value).find(v=>v.object_kind==='portfolio_manifest'&&v.evidence_requirements.length);
 const requirementId='synthetic-only-prospective-canary-gate';draft.entries[0].evidence_requirement_ids=[requirementId];
 const gates=structuredClone(templateManifest.evidence_requirements[0].requirements.required_gates),basis=computePortfolioSelectionBasisDigest(draft);
 for(const gate of gates){gate.reuse_identity.target.repository_id=draft.repository_id;gate.reuse_identity.target.target_revision=draft.source_revision;gate.reuse_identity.consumed_inputs=[{kind:'manifest',path:'portfolio-selection-basis.json',digest:basis}];}
 const requirements=buildVerificationRequirements({requiredGates:gates});
 draft.evidence_requirements=[{requirement_id:requirementId,entry_ids:[draft.entries[0].entry_id],requirements,allowed_dispositions:['reuse_exact'],required_current_state_refs:[{state_id:'repository-tree',state_digest:requirements.target.tree_digest}]}];
 const target=publishPortfolioManifest({storeRoot:f.storeRoot,draft});
 const targetRef=Object.fromEntries(['portfolio_id','revision','manifest_digest','asset_set_digest'].map(k=>[k,target[k]]));
 const adoptPlan={...noOpPlan,target_manifest:targetRef,portfolio_transitions:[{manifest:parent,from_state:'current',to_state:'superseded'},{manifest:targetRef,from_state:null,to_state:'current'}],reason_codes:['synthetic_only_prospective_adopt_plan']};
 const noOpPin=putContentAddressedJson({storeRoot:f.storeRoot,artifact:noOpPlan}).digest,adoptPin=putContentAddressedJson({storeRoot:f.storeRoot,artifact:adoptPlan}).digest,lifecyclePins=[noOpPin,adoptPin].sort();
 for(let repeat=0;repeat<3;repeat++){
  const d=structuredClone(base);d.experiment_id=`synthetic-repetition-${repeat}`;
  const experiment=publishEvolutionExperiment({storeRoot:f.storeRoot,experiment:buildEvolutionExperiment(d)});
  args.trustedExperimentObjectDigests.push(experiment.object_digest);
  const {blocks}=blocksFor(t,f);
  if(withGrading){const root=join(f.root,`resources-${repeat}`);mkdirSync(root);bindSyntheticRoleGrading({...f,root},blocks);}
  for(const role of ['baseline','challenger'])for(const block of blocks[role]){
   const path=join(block.root,'control/plan.json'),p=JSON.parse(readFileSync(path));p.run_id+=`-repeat-${repeat}`;writeFileSync(path,JSON.stringify(p,null,2)+'\n');block.run_id=p.run_id;block.plan_digest=comparisonHash(readFileSync(path));writeFileSync(join(block.root,'control/plan.digest'),block.plan_digest);
  }
  const sealed=sealPersonalEvolutionPromptPair({...args,experimentObjectDigest:experiment.object_digest,blocks,outputRoot:join(f.root,`pair-${repeat}`),lifecyclePlanObjectDigests:lifecyclePins});
  members.push({experimentObjectDigest:experiment.object_digest,pairRegistrationObjectDigest:sealed.object_digest,registration:sealed.registration,blocks});
 }
 const d=structuredClone(base);d.experiment_id='synthetic-aggregate';d.protocol.repetitions=3;d.protocol.thresholds_digest=canonicalDigest(PROMPT_REPETITION_POLICY);d.recommendation_policy=repetitionRecommendationPolicy();
 const main=publishEvolutionExperiment({storeRoot:f.storeRoot,experiment:buildEvolutionExperiment(d)});
 args.experimentObjectDigest=main.object_digest;args.trustedExperimentObjectDigests.push(main.object_digest);args.trustedPairRegistrationObjectDigests=members.map(m=>m.pairRegistrationObjectDigest);
 const rubric=putContentAddressedJson({storeRoot:f.storeRoot,artifact:{kind:'personal_prompt_repetition_rubric_definition_v1',timing:'before_model_outputs',definitions:'SYNTHETIC fixture: retained Unknowns, exact context and no fabricated authority/check/rollback; this is not a genuine review.',adjudication:'two_independent_blind_reviewers'}}).digest;
 const sealArgs={...args,members:members.map(({experimentObjectDigest,pairRegistrationObjectDigest})=>({experimentObjectDigest,pairRegistrationObjectDigest})),rubricDefinitionObjectDigest:rubric,lifecyclePlanObjectDigests:lifecyclePins};
 const root=sealPersonalPromptRepetitionPlan(sealArgs);
 return{...f,members,sealArgs,noOpPin,adoptPin,repetition:root,args:{...args,repetitionPlanObjectDigest:root.object_digest,trustedRepetitionPlanObjectDigests:[root.object_digest]}};
}
