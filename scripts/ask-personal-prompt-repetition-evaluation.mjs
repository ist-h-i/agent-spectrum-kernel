// Opt-in evaluation-plane adapter. Original producer verification owns grades;
// normal Evolution owns recommendation/proposal. No runner or authority factory.
import assert from 'node:assert/strict';
import {existsSync,realpathSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {canonicalDigest,readContentAddressedJson,putContentAddressedJson} from './content-addressed-store.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {parseJsonRejectDuplicateKeys} from './content-addressed-store.mjs';
import {verifyEvolutionExperiment,deriveEvolutionRecommendation,computeEvolutionArtifactInventoryDigest,
 publishEvolutionRecommendation,deriveEvolutionActionProposal,publishEvolutionActionProposal} from './evolution-loop.mjs';
import {verifyPersonalEvolutionPromptPairResults} from './ask-personal-evolution-primary-pair.mjs';
import {reportUserComparison} from './ask-user-comparison.mjs';
import {assertPersonalEvolutionFields as fields,freezePersonalEvolutionValue as frozen} from './ask-personal-evolution-observation.mjs';
import {ownJson} from './ask-personal-prompt-adoption-materialization.mjs';
import {readPromptRepetitionBinding} from './ask-personal-prompt-repetition-binding.mjs';
import {PROMPT_REPETITION_POLICY,summarizePromptRepetitions} from './ask-personal-prompt-repetition-statistics.mjs';
const read=(root,digest)=>readContentAddressedJson({storeRoot:root,digest}).value;
const equal=(a,b)=>canonicalDigest(a)===canonicalDigest(b);
function controllerDigest(report){return canonicalDigest(Object.fromEntries(['run_id','plan_digest','source','slots','configuration','usage_budget'].filter(k=>Object.hasOwn(report,k)).map(k=>[k,report[k]])));}
const roles=['baseline','challenger'];
const conclusions=['improved','retained','regressed','unsafe','observed','not_observed','contradicted','unknown','unavailable','not_applicable'];
const except=(...xs)=>conclusions.filter(x=>!xs.includes(x));
export function repetitionRecommendationPolicy(){
 const match=(quality=conclusions,safety=conclusions,cost=conclusions,mechanism=conclusions,variance=conclusions)=>({quality:[...quality],safety:[...safety],cost:[...cost],variance:[...variance],mechanism:[...mechanism],external_outcome:['unavailable']});
 const policy={no_match:'insufficient_evidence',rules:[
  {rule_id:'repetition-unsafe',match:match(conclusions,['unsafe']),recommendation:'stop',decision_scope:'portfolio_canary_only'},
  {rule_id:'repetition-quality-harm',match:match(['regressed','contradicted'],except('unsafe')),recommendation:'stop',decision_scope:'portfolio_canary_only'},
  {rule_id:'repetition-resource-harm',match:match(except('regressed','contradicted'),except('unsafe'),['regressed']),recommendation:'stop',decision_scope:'portfolio_canary_only'},
  {rule_id:'repetition-rubric-harm',match:match(except('regressed','contradicted'),except('unsafe'),except('regressed'),['regressed']),recommendation:'stop',decision_scope:'portfolio_canary_only'},
  {rule_id:'repetition-positive-canary',match:match(['improved'],['observed'],['retained'],['retained'],['observed']),recommendation:'expand',decision_scope:'portfolio_canary_only'},
  {rule_id:'repetition-neutral',match:match(['retained'],['observed'],['retained'],['retained'],['observed']),recommendation:'retain',decision_scope:'portfolio_canary_only'}]};
 policy.rules.sort((a,b)=>a.rule_id.localeCompare(b.rule_id));for(const r of policy.rules)for(const values of Object.values(r.match))values.sort();return frozen(policy);
}
function rootContext(options){
 assert.equal(resolve(options.storeRoot),options.storeRoot);assert.equal(realpathSync(options.storeRoot),options.storeRoot);
 assert.ok(options.trustedExperimentObjectDigests?.includes(options.experimentObjectDigest),'independent main pre-result experiment pin required');
 const {experiment,candidate}=verifyEvolutionExperiment(options);
 assert.equal(experiment.projection.mode,'prompt_v2_exact');assert.ok(Number.isSafeInteger(experiment.protocol.repetitions)&&experiment.protocol.repetitions>=2&&experiment.protocol.repetitions<=8,'explicit repetition count2..8 required');
 assert.ok(equal(experiment.recommendation_policy,repetitionRecommendationPolicy()),'main experiment must freeze repetition decision table');
 assert.equal(experiment.protocol.thresholds_digest,canonicalDigest(PROMPT_REPETITION_POLICY),'main experiment must freeze aggregate thresholds');
 const prep=read(options.storeRoot,options.preparationObjectDigest);assert.equal(prep.candidate_object_digest,experiment.candidate_object_digest);
 return {experiment,candidate};
}
function childOptions(options,member){return {...options,experimentObjectDigest:member.experiment_object_digest,pairRegistrationObjectDigest:member.pair_registration_object_digest};}
function memberInvariant(reg){
 return Object.fromEntries(roles.map(role=>[role,reg.description.bindings[role].map(b=>Object.fromEntries(['fixture_id','source_digest','task_digest','input_digest','verification_digest','public_criteria','grading_binding','scoring_version','profile_id','formal_task_class','runner_task_class','config','mutable_paths','prompt_runtime_contract','prompt_asset','prompt_input_digest'].map(k=>[k,b[k]??null])))]));
}
function validateRubric(storeRoot,digest){
 const rubric=read(storeRoot,digest);fields(rubric,['kind','timing','definitions','adjudication'],'pre-output rubric definition');assert.equal(rubric.kind,'personal_prompt_repetition_rubric_definition_v1');assert.equal(rubric.timing,'before_model_outputs');assert.ok(typeof rubric.definitions==='string'&&rubric.definitions.trim());assert.equal(rubric.adjudication,'two_independent_blind_reviewers');
}
const overlaps=(a,b)=>a===b||a.startsWith(b+sep)||b.startsWith(a+sep);
function checkedMembers(options,plan,unstarted){
 const {experiment,candidate}=rootContext(options);assert.equal(plan.experiment_object_digest,options.experimentObjectDigest);assert.equal(plan.preparation_object_digest,options.preparationObjectDigest);
 assert.ok(equal(plan.policy,PROMPT_REPETITION_POLICY));assert.equal(plan.members.length,experiment.protocol.repetitions);
 validateRubric(options.storeRoot,plan.rubric_definition_object_digest);
 assert.equal(new Set(plan.members.map(m=>m.experiment_object_digest)).size,plan.members.length,'distinct member experiments required');
 const seenRuns=new Set(),memberRoots=[];let first=null;
 const members=plan.members.map(member=>{
  const args=childOptions(options,member),checked=verifyPersonalEvolutionPromptPairResults({...args,savedResults:undefined});
  // NOT_RUN is mandatory only at seal; later verification without saved pointers
  // may report hold_incomplete, preserving consumed/incomplete population.
  if(unstarted)assert.equal(checked.status,'NOT_RUN','post-result repetition seal refused');
  const reg=read(options.storeRoot,member.pair_registration_object_digest),child=read(options.storeRoot,member.experiment_object_digest);
  assert.equal(reg.kind,'personal_pre_result_prompt_pair_v2','repetition needs plan-bearing pair');
  assert.ok(equal(reg.lifecycle_plan_object_digests,plan.lifecycle_plan_object_digests),'member lifecycle plan pins differ');
  assert.equal(child.protocol.repetitions,1);assert.equal(child.candidate_digest,candidate.candidate_digest);
  const normalized=x=>{const v=structuredClone(x);delete v.experiment_digest;delete v.experiment_id;return v;};
  const expected=normalized(experiment);expected.protocol.repetitions=1;expected.protocol.thresholds_digest=child.protocol.thresholds_digest;expected.recommendation_policy=child.recommendation_policy;
  assert.ok(equal(normalized(child),expected),'member experiment subject differs from main');
  if(first){assert.ok(equal(memberInvariant(reg),memberInvariant(first)),'repetition source/task/criterion/runtime/Asset mismatch');assert.equal(child.protocol.thresholds_digest,read(options.storeRoot,first.experiment_object_digest).protocol.thresholds_digest);}
  else first=reg;
  assert.ok(equal(reg.description.controller_sources,plan.source_binding),'repetition controller source binding drift');
  assert.equal(reg.description.evidence_kind,plan.evidence_kind,'synthetic/observed repetition mixing refused');
  if(unstarted)assert.equal(existsSync(join(reg.output_root,'invocation')),false,'member invocation already consumed');
  const roots=[reg.output_root],protectedRoots=[];
  for(const role of roles)for(const b of reg.description.bindings[role]){
   assert.ok(!seenRuns.has(b.run_id),'duplicate repetition run');seenRuns.add(b.run_id);roots.push(b.block.root);
   protectedRoots.push(b.block.public_input_root,...(b.source_repository?[b.source_repository]:[]));
   if(b.grading_resources){roots.push(b.grading_resources.output_root);protectedRoots.push(b.grading_resources.path,...b.grading_resources.fixed_resource_paths);}
  }
  for(const prior of memberRoots){
   for(const a of prior.mutable)for(const b of [...roots,...protectedRoots])assert.ok(!overlaps(a,b),'repetition mutable/output roots overlap');
   for(const a of prior.protected)for(const b of roots)assert.ok(!overlaps(a,b),'repetition output overlaps protected input');
  }
  memberRoots.push({mutable:roots,protected:protectedRoots});
  return {member,args,registration:reg};
 });
 return {...options,plan,experiment,candidate,members};
}
export function sealPersonalPromptRepetitionPlan(value){
 const options=ownJson(value),{experiment}=rootContext(options);
 assert.ok(Array.isArray(options.members)&&options.members.length===experiment.protocol.repetitions,'exact full repetition population required');
 const members=options.members.map((m,index)=>{fields(m,['experimentObjectDigest','pairRegistrationObjectDigest'],'member input');return{index,experiment_object_digest:m.experimentObjectDigest,pair_registration_object_digest:m.pairRegistrationObjectDigest};});
 assert.equal(new Set(members.map(m=>m.pair_registration_object_digest)).size,members.length,'duplicate member');
 assert.equal(new Set(members.map(m=>m.experiment_object_digest)).size,members.length,'distinct member experiments required');
 validateRubric(options.storeRoot,options.rubricDefinitionObjectDigest);
 const pins=options.lifecyclePlanObjectDigests;assert.ok(Array.isArray(pins)&&pins.length<=8&&new Set(pins).size===pins.length);assert.deepEqual(pins,[...pins].sort());
 const reg=read(options.storeRoot,members[0].pair_registration_object_digest);
 const body={kind:'personal_prompt_repetition_plan_v1',preparation_object_digest:options.preparationObjectDigest,experiment_object_digest:options.experimentObjectDigest,members,policy:structuredClone(PROMPT_REPETITION_POLICY),rubric_definition_object_digest:options.rubricDefinitionObjectDigest,lifecycle_plan_object_digests:pins,source_binding:reg.description.controller_sources,evidence_kind:reg.description.evidence_kind,authority_implied:false};
 checkedMembers(options,body,true);
 const plan={...body,plan_digest:canonicalDigest(body)},objectDigest=putContentAddressedJson({storeRoot:options.storeRoot,artifact:plan}).digest;
 return frozen({plan,object_digest:objectDigest,status:'NOT_RUN',models_started:false,authority_implied:false});
}
export function verifyPersonalPromptRepetitionPlan(value){const options=ownJson(value),plan=readPromptRepetitionBinding(options);return checkedMembers(options,plan,false);}
export function inspectPromptRepetitionModelIdentity(report,requestedModel){
 const attempted=report.slots.filter(slot=>slot.launch_requested===true),observed=[];let unknown=0;
 for(const slot of attempted){if(slot.actual_model===null||slot.actual_model===undefined||slot.actual_model===''){unknown++;continue;}
  assert.equal(typeof slot.actual_model,'string','invalid controller model observation');assert.equal(slot.actual_model,requestedModel,'actual controller model differs from fixed experiment');observed.push({condition:slot.condition,model:slot.actual_model});
 }
 return {status:attempted.length>0&&unknown===0?'observed':'unknown',requested_model:requestedModel,observed_models:observed,attempted_conditions:attempted.length,unknown_conditions:unknown,source:'original_saved_controller_receipts',provider_configuration:'not_independently_observed'};
}
function auxiliaryFor(ctx,cells){
 if(ctx.auxiliaryReportObjectDigest===undefined)return null;
 assert.ok(ctx.trustedAuxiliaryReportObjectDigests?.includes(ctx.auxiliaryReportObjectDigest),'separate whole auxiliary report trust required');
 const aux=read(ctx.storeRoot,ctx.auxiliaryReportObjectDigest);fields(aux,['kind','plan_object_digest','rubric_definition_object_digest','evidence_kind','cells','overhead'],'repetition auxiliary report');assert.equal(aux.kind,'personal_prompt_repetition_auxiliary_v1');assert.equal(aux.plan_object_digest,ctx.repetitionPlanObjectDigest);assert.equal(aux.rubric_definition_object_digest,ctx.plan.rubric_definition_object_digest);assert.equal(aux.evidence_kind,ctx.plan.evidence_kind);
 assert.ok(Array.isArray(aux.cells)&&aux.cells.length===cells.length,'auxiliary full denominator required');
 const seen=new Set();
 for(const row of aux.cells){fields(row,['repeat','fixture_id','role','controller_report_digest','rubric','monetary_cost','evidence_refs'],'auxiliary cell');const key=`${row.repeat}:${row.fixture_id}:${row.role}`;assert.ok(!seen.has(key));seen.add(key);const cell=cells.find(c=>`${c.repeat}:${c.fixture_id}:${c.role}`===key);assert.ok(cell,'foreign auxiliary cell');assert.equal(row.controller_report_digest,cell.controller_report_digest,'auxiliary controller report transplant');assert.ok(Array.isArray(row.evidence_refs)&&row.evidence_refs.length>0);for(const d of row.evidence_refs)read(ctx.storeRoot,d);
  fields(row.rubric,['status','violations','severe'],'rubric observation');assert.ok(['complete','unknown'].includes(row.rubric.status));if(row.rubric.status==='complete'){assert.ok(Number.isSafeInteger(row.rubric.violations)&&row.rubric.violations>=0);assert.equal(typeof row.rubric.severe,'boolean');}else{assert.equal(row.rubric.violations,null);assert.equal(row.rubric.severe,null);}
  fields(row.monetary_cost,['status','value'],'monetary observation');assert.ok(['known','unknown'].includes(row.monetary_cost.status));if(row.monetary_cost.status==='known')assert.ok(Number.isFinite(row.monetary_cost.value)&&row.monetary_cost.value>=0);else assert.equal(row.monetary_cost.value,null);
 }
 fields(aux.overhead,['status','tokens','duration_ms','cost_microunits','evidence_refs'],'shared overhead');assert.ok(['known','unknown'].includes(aux.overhead.status));for(const k of ['tokens','duration_ms','cost_microunits'])if(aux.overhead.status==='known')assert.ok(Number.isFinite(aux.overhead[k])&&aux.overhead[k]>=0);else assert.equal(aux.overhead[k],null);assert.ok(Array.isArray(aux.overhead.evidence_refs)&&aux.overhead.evidence_refs.length);for(const d of aux.overhead.evidence_refs)read(ctx.storeRoot,d);
 return aux;
}
export function verifyPersonalPromptRepetitionResults(value){
 const ctx=verifyPersonalPromptRepetitionPlan(value),supplied=ctx.savedMembers??[];assert.ok(Array.isArray(supplied)&&supplied.length<=ctx.members.length);
 const membersMap=new Map();for(const m of supplied){fields(m,['pairRegistrationObjectDigest','savedResults','trustedSavedEngineeringResultDigests'],'saved repetition member');assert.ok(ctx.members.some(x=>x.member.pair_registration_object_digest===m.pairRegistrationObjectDigest),'foreign saved repetition');assert.ok(!membersMap.has(m.pairRegistrationObjectDigest),'duplicate saved repetition');membersMap.set(m.pairRegistrationObjectDigest,m);}
 const cells=[],memberReports=[];
 for(const {member,args,registration}of ctx.members){const saved=membersMap.get(member.pair_registration_object_digest);
  const result=verifyPersonalEvolutionPromptPairResults({...args,...(saved?{savedResults:saved.savedResults,trustedSavedEngineeringResultDigests:saved.trustedSavedEngineeringResultDigests}:{} )});
  memberReports.push({index:member.index,pair_object_digest:member.pair_registration_object_digest,status:result.status,report_digest:canonicalDigest(result.report)});
  for(const role of roles)for(const binding of registration.description.bindings[role]){
   const report=reportUserComparison(binding.block.root);if(report.execution.start_consumed){const request=parseJsonRejectDuplicateKeys(readStableFile(join(registration.output_root,'invocation/request.json'),'repetition invocation',1048576).bytes.toString('utf8'));assert.equal(request.repetition_plan_object_digest,ctx.repetitionPlanObjectDigest,'old/late repetition binding refused');}
   const original=result.report.observations.find(o=>o.role===role&&o.fixture_id===binding.fixture_id)?.engineering;
   const slots=report.slots;let tokens=0,duration=0,resourceComplete=true;
   for(const slot of slots){const m=slot.metrics;if(![m?.input_tokens,m?.output_tokens,m?.duration_ms].every(x=>Number.isFinite(x)&&x>=0)){resourceComplete=false;continue;}tokens+=m.input_tokens+m.output_tokens;duration+=m.duration_ms;}
   cells.push({repeat:member.index,fixture_id:binding.fixture_id,role,state:report.overall.state??result.status,active_file:binding.prompt_runtime_contract.active_entrypoint_basename,controller_report_digest:controllerDigest(report),tokens_known_lower_bound:report.usage_budget.known_tokens_lower_bound,engineering_result_digest:original?.engineering_result_digest??null,
    model_identity:inspectPromptRepetitionModelIdentity(report,binding.config.model),quality:original?.scoring_status==='complete'?original.requirement_score.normalized_requirement_score:null,safety:original?.safety_blocker.status??'unknown',mandatory_failure:original?.blockers.gate_status==='fail',resources_complete:resourceComplete&&slots.length>0&&report.usage_budget.complete===true,tokens:resourceComplete?tokens:null,duration_ms:resourceComplete?duration:null});
  }
 }
 const auxiliary=auxiliaryFor(ctx,cells),summary=summarizePromptRepetitions({fixtureIds:ctx.experiment.protocol.fixture_ids,repetitions:ctx.members.length,cells,auxiliary});
 summary.configuration={status:cells.every(c=>c.model_identity.status==='observed')?'complete':'insufficient_evidence',unknown_model_cells:cells.filter(c=>c.model_identity.status!=='observed').length};
 const report={kind:'personal_prompt_repetition_readout_v1',plan_object_digest:ctx.repetitionPlanObjectDigest,evidence_kind:ctx.plan.evidence_kind,members:memberReports,cells,summary,auxiliary_object_digest:ctx.auxiliaryReportObjectDigest??null,causal_attribution:'not_claimed',limitations:['familiar_finite_catalog','fixed_role_order_confound','small_repetition_count','singleton_mode_not_general','authoring_lifecycle_cost_not_measured'],models_started:false,authority_implied:false};
 const sources={quality:'paired_comparison_report',safety:'paired_comparison_report',cost:'paired_comparison_report',variance:'repetition_report',mechanism:'mechanism_scorecard',external_outcome:'external_outcome_report'};
 const dimensions=Object.fromEntries(Object.entries(sources).map(([name,source_kind])=>{let s=summary[name]??{status:'unavailable',conclusion:'unavailable'};if(name==='quality'&&summary.configuration.status!=='complete'&&!['regressed','contradicted'].includes(s.conclusion))s={status:'insufficient_evidence',conclusion:'unknown'};return[name,{status:s.status,conclusion:s.conclusion,source_kind,artifact_id:`prompt-repeat-${name}-${canonicalDigest(report).slice(7,31)}`,artifact_digest:canonicalDigest({report,dimension:name}),causal_credit_applied:false,factor_ids:[]}];}));
 fields(ctx.evaluationAuthority,['authority_id','authority_revision','authority_evidence_digest'],'independent evaluation identity');
 assert.ok(![ctx.candidate.generation.actor.actor_id,ctx.candidate.authorities.experiment.authority_id,ctx.candidate.authorities.decision.authority_id].includes(ctx.evaluationAuthority.authority_id),'evaluation identity must be independent');
 const evidence={authority:{...ctx.evaluationAuthority,kind:'external_evolution_evaluation_authority',experiment_digest:ctx.experiment.experiment_digest,verification_mode:'full_verifier',artifact_inventory_digest:computeEvolutionArtifactInventoryDigest(dimensions)},dimensions,causal_attribution:{status:'not_claimed',factor_ids:[],evidence_digests:[]},reason_codes:['fixed_full_repetition_population','verified_original_scores','no_causal_credit','no_operational_permission'].sort()};
 const recommendation=deriveEvolutionRecommendation({experiment:ctx.experiment,evidence});
 return frozen({report,evidence,recommendation,status:summary.coverage.scored_cells===summary.coverage.planned_cells?'saved_repetition_verified':'hold_incomplete',models_started:false,authority_implied:false});
}
export function publishPersonalPromptRepetitionProposal(value){
 const options=ownJson(value),result=verifyPersonalPromptRepetitionResults(options);
 assert.ok(options.trustedEvaluationAuthorities?.some(e=>equal(e,result.evidence)),'separately trusted whole repetition evaluation required');
 assert.ok(options.trustedLifecyclePlanObjectDigests?.includes(options.lifecyclePlanObjectDigest),'separate pre-result root lifecycle plan pin required');
 const plan=readPromptRepetitionBinding(options);assert.ok(plan.lifecycle_plan_object_digests.includes(options.lifecyclePlanObjectDigest),'root lifecycle plan was not fixed before results');
 const {candidate,experiment}=rootContext(options),lifecyclePlan=read(options.storeRoot,options.lifecyclePlanObjectDigest);
 const proposal=deriveEvolutionActionProposal({candidate,experiment,recommendation:result.recommendation,lifecyclePlan});
 const reportObjectDigest=putContentAddressedJson({storeRoot:options.storeRoot,artifact:result.report}).digest;
 for(const dimension of Object.keys(result.evidence.dimensions)){const marker={report:result.report,dimension};assert.equal(putContentAddressedJson({storeRoot:options.storeRoot,artifact:marker}).digest,result.evidence.dimensions[dimension].artifact_digest);}
 const recommended=publishEvolutionRecommendation({storeRoot:options.storeRoot,recommendation:result.recommendation});const proposed=publishEvolutionActionProposal({storeRoot:options.storeRoot,proposal});
 return frozen({report_object_digest:reportObjectDigest,recommendation_object_digest:recommended.object_digest,proposal_object_digest:proposed.object_digest,proposal,evidence:result.evidence,models_started:false,authority_implied:false,next_action:'separate_exact_human_decision_then_normal_Portfolio_action'});
}
