// Closed immutable membership only; no evaluation, dispatch or authority creation.
import assert from 'node:assert/strict';
import { canonicalDigest, readContentAddressedJson } from './content-addressed-store.mjs';
import { assertPersonalEvolutionFields as fields } from './ask-personal-evolution-observation.mjs';
export function readPromptRepetitionBinding({storeRoot,repetitionPlanObjectDigest,trustedRepetitionPlanObjectDigests},pairRegistrationObjectDigest){
 assert.ok(trustedRepetitionPlanObjectDigests?.includes(repetitionPlanObjectDigest),'independent pre-result repetition plan pin required');
 const plan=readContentAddressedJson({storeRoot,digest:repetitionPlanObjectDigest}).value;
 fields(plan,['kind','preparation_object_digest','experiment_object_digest','members','policy','rubric_definition_object_digest','lifecycle_plan_object_digests','source_binding','evidence_kind','authority_implied','plan_digest'],'Prompt repetition plan');
 assert.equal(plan.kind,'personal_prompt_repetition_plan_v1');assert.equal(plan.authority_implied,false);
 const {plan_digest,...body}=plan;assert.equal(canonicalDigest(body),plan_digest);
 assert.ok(Array.isArray(plan.members)&&plan.members.length>=2&&plan.members.length<=8,'explicit bounded repetition count required');
 const ids=plan.members.map((m,i)=>{fields(m,['index','experiment_object_digest','pair_registration_object_digest'],'repetition member');assert.equal(m.index,i);return m.pair_registration_object_digest;});
 assert.equal(new Set(ids).size,ids.length,'duplicate repetition member');
 if(pairRegistrationObjectDigest!==undefined)assert.equal(ids.filter(x=>x===pairRegistrationObjectDigest).length,1,'pair is not in fixed repetition population');
 return plan;
}
