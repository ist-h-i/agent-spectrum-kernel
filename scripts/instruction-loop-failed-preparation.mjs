// Prepare new work only from positive closed pre-case failure evidence.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {canonicalDigest,stableCanonicalJson,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {inspectClosedFullAuthoring} from './instruction-loop-retained-authoring.mjs';
import {readRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {fullGenerationInput} from './instruction-loop-full-candidate.mjs';
import {observeInitializationRecoveryProcesses} from './practical-initialization-clearance.mjs';
import {createNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
import {validateSourceApplicationOwner} from './instruction-loop-source-application.mjs';
import {projectInstructionLoopObservation,assertPublicInstructionSummary} from './instruction-loop-feedback.mjs';
const json=path=>readJsonFileStrict(path,'failed preparation evidence',16*1024*1024);
const pin=path=>({path:resolve(path),digest:hash(readStableBytes(path,'failed preparation evidence',16*1024*1024))});
const overlap=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
export function prepareFailedInstructionLoopConfiguration({root,profilePath,configPath,replacementProfilePath=profilePath,outputRoot,id}){
 root=resolve(root);profilePath=resolve(profilePath);configPath=resolve(configPath);replacementProfilePath=resolve(replacementProfilePath);outputRoot=resolve(outputRoot);
 for(const path of [root,profilePath,configPath,replacementProfilePath,outputRoot])assertNoSymlinkPathSegments(path,'failed preparation path',{allowMissingLeaf:true});
 assert.ok(!existsSync(join(root,'.advance-lock')),'original coordinator lock requires inspection');
 const history=readRunJournal(root),s=history.state,old=json(profilePath),config=json(configPath),p=json(replacementProfilePath);
 assert.ok(s&&s.status==='operation_uncertain'&&s.pending&&['generate','register','select'].includes(s.pending.kind),'only closed pre-case failures can prepare a fresh run');
 assert.ok(!s.evaluation_decision&&!s.trials.length&&!s.outputs.apply&&!s.outputs.plan,'after-case or owner effects require their original recovery path');
 assert.equal(canonicalDigest(config.policy),canonicalDigest(s.policy));assert.equal(canonicalDigest(config.runtime),s.policy.runtime_digest);
 const command=config.runtime.commands?.[s.pending.kind];assert.ok(command&&command.model_calls===false,'unknown model work cannot authorize a new generation');
 assert.ok(command.pins.some(x=>x.path===profilePath&&x.digest===pin(profilePath).digest),'original profile is not pinned');
 assert.equal(canonicalDigest({...old.policy,runtime_digest:s.policy.runtime_digest}),canonicalDigest(s.policy));
 const directory=join(root,'jobs',canonicalDigest(s.pending).slice(7)),request=json(join(directory,'request.json')),result=json(join(directory,'result.json')),transport=json(join(directory,'transport.json'));
 assert.equal(canonicalDigest(request),canonicalDigest(s.pending));assert.equal(result.request_digest,canonicalDigest(s.pending));assert.equal(result.status,'failed','a positive failed result is required');
 assert.equal(transport.request_digest,canonicalDigest(s.pending));assert.ok(Number.isInteger(transport.exit_code)&&transport.signal===null,'local transport closure is unconfirmed');
 assert.equal(p.kind,old.kind);assert.equal(p.kind,'full_native_reference_loop_profile_v1','this recovery port requires shipped native command receipts');
 for(const key of ['protectedRoot','storeRoot','baselineEnvironmentObjectDigest'])assert.equal(p[key],old[key],'baseline/owner identity changed');
 assert.equal(canonicalDigest(p.normal),canonicalDigest(old.normal),'normal owner changed');
 for(const key of ['baselineSourceRoot','baselineRevision','parentAssets'])assert.equal(canonicalDigest(p.generator[key]??null),canonicalDigest(old.generator[key]??null),'baseline source changed');
 assert.match(id,/^[A-Za-z0-9._-]{1,100}$/u);assert.notEqual(id,s.policy.id);assert.ok(outputRoot.startsWith(old.protectedRoot+'/'));
 assert.equal(p.native.baselineFullRoot,old.native.baselineFullRoot,'native baseline projection changed');
 const protectedPaths=[root,old.storeRoot,old.stateRoot,old.generator.baselineSourceRoot,old.generator.candidateRoot,old.generator.fullRoot,old.generator.stagingRoot,old.normal.target,
  old.native.root,old.native.workRoot,old.native.baselineFullRoot,old.generator.provider.sessionRoot,p.generator.provider.sessionRoot,
  profilePath,configPath,replacementProfilePath,old.native.templateConfig,p.native.templateConfig,old.generator.provider.response?.path].filter(Boolean);
 for(const path of protectedPaths)assert.ok(!overlap(outputRoot,resolve(path)),'fresh recovery overlaps prior work/source/owner');
 const intent={journal_digest:history.previous,profile:pin(profilePath),config:pin(configPath),replacement:pin(replacementProfilePath),request_digest:canonicalDigest(request),result_digest:canonicalDigest(result),transport_digest:canonicalDigest(transport),id,output_root:outputRoot};
 const receiptPath=join(outputRoot,'recovery-prepared.json');
 p.stateRoot=join(outputRoot,'state');p.generator.candidateRoot=join(outputRoot,'candidate');p.generator.fullRoot=join(outputRoot,'full');p.generator.stagingRoot=join(outputRoot,'staging');
 const key=canonicalDigest(intent).slice(7,39);p.generator.environmentId='instruction-recovery-'+key;
 if(p.generator.provider.kind==='codex')p.generator.provider.sessionRoot=join(outputRoot,'generation-session');
 {p.native.root=join(dirname(old.native.root),'ask-native-recovery-'+key);p.native.workRoot=join(dirname(old.native.workRoot),'ask-work-recovery-'+key);}
 for(const path of [p.stateRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot,p.native.root,p.native.workRoot]){
  if(!existsSync(outputRoot))assert.ok(!existsSync(path),'fresh recovery destinations required');assertNoSymlinkPathSegments(path,'fresh recovery destination',{allowMissingLeaf:true});for(const oldPath of protectedPaths)assert.ok(!overlap(path,resolve(oldPath)),'recovery destination overlaps prior work');}
 let feedback=p.policy.observation;while(['instruction_loop_continuation_v1','instruction_loop_recovery_v1'].includes(feedback.kind))feedback=feedback.feedback;
 projectInstructionLoopObservation(feedback);let reason;try{reason=assertPublicInstructionSummary(String(result.output.reason).slice(0,512));}catch{reason='Original failure details remain in the retained job-bound result.';}
 p.policy={...p.policy,id,observation:{kind:'instruction_loop_recovery_v1',feedback,previous:{run_id:s.policy.id,journal_digest:history.previous,policy_digest:canonicalDigest(s.policy),failed_stage:s.pending.kind,
  failed_job_digest:canonicalDigest(s.pending),result_digest:canonicalDigest(result),reason_summary:reason,previous_state_completed:false,approval_carried_forward:false}}};delete p.policy.runtime_digest;
 if(p.report){p.report.assessments=[];delete p.report.recovery;if(p.report.fixedScoring)p.report.fixedScoring.assessments=[];}
 projectInstructionLoopObservation(p.policy.observation);assert.equal(readRunJournal(root).previous,history.previous,'original run changed during preparation');
 const nextProfile=join(outputRoot,'profile.json'),nextConfig=join(outputRoot,'config.json');
 const prepared={status:'prepared',profile_path:nextProfile,config_path:nextConfig,run_root:join(outputRoot,'run'),previous_journal_digest:history.previous,previous_state_completed:false,models_started:false,approval_carried_forward:false};
 if(existsSync(outputRoot)){
  assert.ok(existsSync(receiptPath),'partial recovery preparation preserved; select a fresh output root');const receipt=json(receiptPath);
  assert.equal(receipt.intent_digest,canonicalDigest(intent),'different recovery intent');
  assert.equal(pin(nextProfile).digest,hash(Buffer.from(stableCanonicalJson(p)+'\n')),'prepared recovery profile changed');
  const expectedConfig=createNativeInstructionLoopConfiguration(nextProfile);
  assert.equal(pin(nextConfig).digest,hash(Buffer.from(stableCanonicalJson(expectedConfig)+'\n')),'prepared recovery config changed');
  assert.deepEqual(receipt,{intent_digest:canonicalDigest(intent),profile:pin(nextProfile),config:pin(nextConfig),result:prepared},'prepared recovery receipt changed');return prepared;
 }
 mkdirSync(outputRoot,{mode:0o700});
 writeCanonicalJsonNoReplace({outputPath:nextProfile,artifact:p,label:'fresh failed-run profile',maximumBytes:16*1024*1024});
 const next=createNativeInstructionLoopConfiguration(nextProfile);writeCanonicalJsonNoReplace({outputPath:nextConfig,artifact:next,label:'fresh failed-run config',maximumBytes:16*1024*1024});

 writeCanonicalJsonNoReplace({outputPath:receiptPath,artifact:{intent_digest:canonicalDigest(intent),profile:pin(nextProfile),config:pin(nextConfig),result:prepared},label:'failed recovery preparation receipt'});return prepared;
}

// A distinct admission path: local provider completion is positive, but its
// already saved answer failed trusted source materialization. No model replay.
export function prepareRetainedFullAuthoringConfiguration({root,profilePath,configPath,replacementProfilePath=profilePath,outputRoot,id,preEvaluation=false}){
 root=resolve(root);profilePath=resolve(profilePath);configPath=resolve(configPath);replacementProfilePath=resolve(replacementProfilePath);outputRoot=resolve(outputRoot);
 for(const path of [root,profilePath,configPath,replacementProfilePath,outputRoot])assertNoSymlinkPathSegments(path,'retained authoring preparation',{allowMissingLeaf:true});
 const inspected=inspectClosedFullAuthoring({root,profilePath,configPath,preEvaluation}),old=inspected.profile,p=json(replacementProfilePath);
 const withoutCommands=v=>{const q=structuredClone(v);delete q.practical.conditions;
  if(preEvaluation&&q.practical.cases)for(const c of q.practical.cases)delete c.grader;return q;};
 assert.equal(canonicalDigest(withoutCommands(p)),canonicalDigest(withoutCommands(old)),'replacement may change only pre-case task commands and, in reconfiguration mode, graders; authoring request, public cases and baseline remain fixed');
 assert.match(id,/^[A-Za-z0-9._-]{1,100}$/u);assert.notEqual(id,old.policy.id);assert.ok(outputRoot.startsWith(old.protectedRoot+'/'));
 const protectedPaths=[root,old.storeRoot,old.stateRoot,old.generator.baselineSourceRoot,old.generator.candidateRoot,old.generator.fullRoot,
  old.generator.stagingRoot,old.generator.provider.sessionRoot,old.practical.root,old.practical.baselineRoot,old.normal.target,profilePath,configPath,replacementProfilePath].filter(Boolean);
 for(const path of protectedPaths)assert.ok(!overlap(outputRoot,resolve(path)),'fresh recovery overlaps prior work/source/owner');
 const intent={origin:inspected.origin,replacement:pin(replacementProfilePath),id,output_root:outputRoot},receiptPath=join(outputRoot,'recovery-prepared.json');
 p.stateRoot=join(outputRoot,'state');p.generator.candidateRoot=join(outputRoot,'candidate');p.generator.fullRoot=join(outputRoot,'full');p.generator.stagingRoot=join(outputRoot,'staging');
 p.generator.environmentId='instruction-recovery-'+canonicalDigest(intent).slice(7,39);p.practical.root=join(outputRoot,'evaluation');
 const originPath=join(outputRoot,'authoring-origin.json'),originBytes=Buffer.from(stableCanonicalJson(inspected.origin)+'\n');
 p.generator.provider={kind:'fixture',response:inspected.origin.response,retainedAuthoring:{path:originPath,digest:hash(originBytes)}};
 p.policy={...p.policy,id};delete p.policy.runtime_digest;
 // Keep the exact authoring request; failure provenance is in the pinned origin,
 // never inserted into a request that this retained answer did not receive.
 for(const path of [p.stateRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot,p.practical.root]){
  assertNoSymlinkPathSegments(path,'fresh retained response destination',{allowMissingLeaf:true});
  assert.ok(!existsSync(path),'fresh retained response destination required');
 }
 const nextProfile=join(outputRoot,'profile.json'),nextConfig=join(outputRoot,'config.json');
 const prepared={status:'prepared',profile_path:nextProfile,config_path:nextConfig,run_root:join(outputRoot,'run'),
  previous_journal_digest:inspected.origin.journal_digest,previous_state_completed:false,models_started:false,retained_authoring:true,approval_carried_forward:false,...(preEvaluation?{pre_evaluation_reconfiguration:true}:{})};
 if(existsSync(outputRoot)){
  assert.ok(existsSync(receiptPath),'partial recovery preparation preserved; select a fresh output root');
  const receipt=json(receiptPath);assert.equal(receipt.intent_digest,canonicalDigest(intent),'different retained recovery intent');
  assert.equal(pin(originPath).digest,hash(originBytes),'prepared authoring origin changed');
  assert.equal(pin(nextProfile).digest,hash(Buffer.from(stableCanonicalJson(p)+'\n')),'prepared recovery profile changed');
  const expected=createNativeInstructionLoopConfiguration(nextProfile);
  assert.equal(pin(nextConfig).digest,hash(Buffer.from(stableCanonicalJson(expected)+'\n')),'prepared recovery config changed');
  assert.deepEqual(receipt,{intent_digest:canonicalDigest(intent),profile:pin(nextProfile),config:pin(nextConfig),result:prepared},'prepared recovery receipt changed');return prepared;
 }
 mkdirSync(outputRoot,{mode:0o700});
 writeCanonicalJsonNoReplace({outputPath:originPath,artifact:inspected.origin,label:'retained Full authoring origin',maximumBytes:16*1024*1024});
 writeCanonicalJsonNoReplace({outputPath:nextProfile,artifact:p,label:'retained Full authoring profile',maximumBytes:16*1024*1024});
 const next=createNativeInstructionLoopConfiguration(nextProfile);writeCanonicalJsonNoReplace({outputPath:nextConfig,artifact:next,label:'retained Full authoring config',maximumBytes:16*1024*1024});
 writeCanonicalJsonNoReplace({outputPath:receiptPath,artifact:{intent_digest:canonicalDigest(intent),profile:pin(nextProfile),config:pin(nextConfig),result:prepared},label:'retained authoring preparation receipt'});return prepared;
}

// A separate, once-only read-only authoring job after a recognized local CLI
// initialization failure. Never clear/replay the old consumed reservation.
export function prepareFullAuthoringInitializationRetry(options,observe=observeInitializationRecoveryProcesses){
 return prepareAuthoringRetry(options,observe,false);
}
// Operational exception for a lost local coordinator: missing evidence is not
// evidence of zero remote work. Preserve the old reservation and allow at most
// one separately authorized, isolated read-only generation, never a replay.
export function prepareInterruptedFullAuthoringRetry(options,observe=observeInitializationRecoveryProcesses){
 return prepareAuthoringRetry(options,observe,true);
}
function prepareAuthoringRetry({operationRoot,outputRoot,id,reason},observe,interrupted){
 operationRoot=resolve(operationRoot);outputRoot=resolve(outputRoot);assertPublicInstructionSummary(reason);
 assertNoSymlinkPathSegments(operationRoot,'authoring retry parent');assertNoSymlinkPathSegments(outputRoot,'authoring retry output',{allowMissingLeaf:true});
 const first=readRunJournal(operationRoot).state;assert.ok(first?.current?.root);const root=first.current.root;
 assert.equal(resolve(root),root);assert.ok(root.startsWith(operationRoot+'/'));assertNoSymlinkPathSegments(root,'authoring retry cycle');
 const unlocks=[];try{
  for(const path of [operationRoot,root].sort())unlocks.push(lockRunJournal(path));
  const parent=readRunJournal(operationRoot),o=parent.state;assert.equal(o.current.root,root);assert.ok((interrupted?['advancing','operation_uncertain']:['operation_uncertain']).includes(o.status));assert.equal(o.preparation,null);
  const h=readRunJournal(root),s=h.state;assert.ok(s&&(interrupted?['advancing','operation_uncertain']:['operation_uncertain']).includes(s.status)&&s.pending?.kind==='generate');
  assert.ok(!s.gate&&!s.evaluation_decision&&!s.trials.length&&Object.keys(s.outputs).length===0,'only pre-case authoring initialization is admitted');
  const {profile_path:profilePath,config_path:configPath}=o.current;
  for(const path of [profilePath,configPath]){assert.equal(resolve(path),path);assertNoSymlinkPathSegments(path,'original authoring input');}
  const p=json(profilePath),config=json(configPath);
  assert.equal(pin(profilePath).digest,o.current.profile_digest);assert.equal(canonicalDigest(config),o.current.config_digest);
  assert.equal(p.kind,'full_practical_instruction_loop_profile_v1');assert.equal(p.normal.target,p.policy.normal_target);
  if(p.normal.kind==='ask_source_repository_v1')validateSourceApplicationOwner(p);else assert.equal(p.normal.target,null,'only null or validated source owners can retry authoring');
  assert.equal(config.runtime.kind,'full_practical_instruction_loop_runtime_v1');assert.equal(config.runtime.profile_path,profilePath);assert.equal(config.runtime.profile_digest,pin(profilePath).digest);
  assert.equal(canonicalDigest(config.policy),canonicalDigest(s.policy));assert.equal(canonicalDigest(config.runtime),s.policy.runtime_digest);
  assert.equal(canonicalDigest({...p.policy,runtime_digest:s.policy.runtime_digest}),canonicalDigest(s.policy));
  for(const ref of config.runtime.source_pins)assert.deepEqual(pin(ref.path),ref,'original authoring source drift');
  assert.equal(p.generator.provider.kind,'codex');assert.equal(p.generator.initializationRetry,undefined,'authoring retry cannot be chained');
  assert.equal(canonicalDigest(s.pending.input.observation),canonicalDigest(p.policy.observation));
  if(s.pending.input_digest!==undefined)assert.equal(s.pending.input_digest,canonicalDigest(s.pending.input));
  const session=p.generator.provider.sessionRoot;assert.equal(resolve(session),session);assertNoSymlinkPathSegments(session,'original authoring session');
  assert.ok(!existsSync(join(session,'last-message.json')),'inspect and retain an existing answer instead');
  const executionPath=join(session,'provider-execution.json');
  const input=fullGenerationInput({...p.generator,observation:p.policy.observation});
  if(interrupted)assert.ok(!existsSync(executionPath),'existing provider receipt requires its evidence-specific recovery');
  else {
  const execution=json(executionPath);
  assert.equal(execution.kind,'full_authoring_execution_v1');
  for(const key of ['model_call_authorized','spawn_observed','termination_confirmed'])assert.equal(execution[key],true);
  assert.equal(execution.exit_code,1);for(const key of ['signal','error'])assert.equal(execution[key],null);
  for(const key of ['timed_out','interrupted','output_limited'])assert.equal(execution[key],false);
  for(const key of ['stdout','stderr']){const stream=execution[key];assert.equal(stream.truncated,false);assert.equal(stream.total_bytes,Buffer.byteLength(stream.text));}
  assert.equal(execution.stdout.text,'');assert.equal(execution.response_ref,undefined);
  assert.match(execution.stderr.text,/^(?:WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted \(os error 1\)\n)?Error: failed to initialize in-process app-server client: Operation not permitted \(os error 1\)\n?$/u);
  assert.equal(execution.input_digest,canonicalDigest(input),'failed authoring input drift');
  }
  if(p.generator.provider.executableDigest!==undefined)assert.equal(pin(p.generator.provider.executable).digest,p.generator.provider.executableDigest);
  const observed=observe({taskRoot:session,assessRoot:root,workerPids:[]});
  assert.equal(observed.workers_absent,true);assert.equal(observed.same_uid_cwd_observation,true);assert.equal(observed.observer_visible,true);assert.equal(observed.provider_closure_inferred,false);
  assert.deepEqual(observed.matching_writers,[],'original owned local writer remains');assert.deepEqual(observed.owned_roots,[session,root]);
  assert.ok(!existsSync(join(session,'last-message.json')),'answer appeared during local inspection; retain it instead');
  if(interrupted)assert.ok(!existsSync(executionPath),'provider receipt appeared during local inspection');
  assert.match(id,/^[A-Za-z0-9._-]{1,100}$/u);assert.notEqual(id,p.policy.id);assert.ok(outputRoot.startsWith(p.protectedRoot+'/'));
  const protectedPaths=[root,p.storeRoot,p.stateRoot,p.generator.baselineSourceRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot,session,p.practical.root,p.practical.baselineRoot,profilePath,configPath,...(p.normal.target===null?[]:[p.normal.target])];
  for(const path of protectedPaths)assert.ok(!overlap(outputRoot,resolve(path)),'retry output overlaps original work');
  const origin={kind:interrupted?'full_authoring_interruption_retry_v1':'full_authoring_initialization_retry_v1',operation_root:operationRoot,operation_journal_digest:parent.previous,root,journal_digest:h.previous,
   job_digest:canonicalDigest(s.pending),execution:interrupted?null:pin(executionPath),profile:pin(profilePath),config:pin(configPath),input_digest:canonicalDigest(input),reason,
   attempt:1,maximum_additional_authoring_jobs:1,remote_closure:'Unknown',...(interrupted?{prior_usage:'Unknown',prior_local_termination:'Unknown',evidence_status:'receipt_missing'}:{}),approval_carried_forward:false};
  const intent={origin,output_root:outputRoot,id},intentDigest=canonicalDigest(intent),slot=join(root,'.authoring-initialization-retry');
  assertNoSymlinkPathSegments(slot,'canonical authoring retry slot',{allowMissingLeaf:true});
  if(existsSync(slot))assert.equal(json(join(slot,'claim.json')).intent_digest,intentDigest,'a different authoring retry is already reserved');
  else{assert.ok(!existsSync(outputRoot),'fresh authoring retry output root required');mkdirSync(slot,{mode:0o700});writeCanonicalJsonNoReplace({outputPath:join(slot,'claim.json'),artifact:{intent_digest:intentDigest,origin,output_root:outputRoot,id,local_observation:observed},label:'one authoring initialization retry'});}
  p.stateRoot=join(outputRoot,'state');p.generator.candidateRoot=join(outputRoot,'candidate');p.generator.fullRoot=join(outputRoot,'full');p.generator.stagingRoot=join(outputRoot,'staging');
  p.generator.environmentId='instruction-authoring-retry-'+intentDigest.slice(7,39);p.generator.provider.sessionRoot=join(outputRoot,'generation-session');p.generator.initializationRetry=origin;
  p.practical.root=join(outputRoot,'evaluation');p.policy={...p.policy,id};delete p.policy.runtime_digest;
  assert.equal(canonicalDigest(fullGenerationInput({...p.generator,observation:p.policy.observation})),origin.input_digest,'retry changes the authoring request');
  const nextProfile=join(outputRoot,'profile.json'),nextConfig=join(outputRoot,'config.json'),receiptPath=join(outputRoot,'recovery-prepared.json');
  const prepared={status:'prepared',profile_path:nextProfile,config_path:nextConfig,run_root:join(outputRoot,'run'),previous_journal_digest:h.previous,previous_state_completed:false,
   models_started:false,approval_carried_forward:false,additional_authoring_jobs:1,remote_closure:'Unknown',...(interrupted?{prior_usage:'Unknown'}:{})};
  if(existsSync(receiptPath)){
   const receipt=json(receiptPath);assert.equal(receipt.intent_digest,intentDigest);assert.equal(pin(nextProfile).digest,hash(Buffer.from(stableCanonicalJson(p)+'\n')),'prepared retry profile changed');
   assert.equal(canonicalDigest(json(nextConfig)),canonicalDigest(createNativeInstructionLoopConfiguration(nextProfile)),'prepared retry config changed');
   assert.deepEqual(receipt.result,prepared);assert.deepEqual(receipt.profile,pin(nextProfile));assert.deepEqual(receipt.config,pin(nextConfig));return prepared;
  }
  for(const path of [p.stateRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot,p.generator.provider.sessionRoot,p.practical.root]){
   assertNoSymlinkPathSegments(path,'fresh authoring retry materialization',{allowMissingLeaf:true});assert.ok(!existsSync(path),'fresh authoring retry materialization required');
  }
  if(!existsSync(outputRoot))mkdirSync(outputRoot,{mode:0o700});
  writeCanonicalJsonNoReplace({outputPath:nextProfile,artifact:p,label:'fresh authoring retry profile',maximumBytes:16*1024*1024});
  writeCanonicalJsonNoReplace({outputPath:nextConfig,artifact:createNativeInstructionLoopConfiguration(nextProfile),label:'fresh authoring retry configuration',maximumBytes:16*1024*1024});
  writeCanonicalJsonNoReplace({outputPath:receiptPath,artifact:{intent_digest:intentDigest,profile:pin(nextProfile),config:pin(nextConfig),result:prepared},label:'authoring retry preparation receipt'});return prepared;
 }finally{for(const unlock of unlocks.reverse())unlock();}
}
