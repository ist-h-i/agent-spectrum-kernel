// Reuse a closed Full authoring answer; never relaunch its consumed provider.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonicalDigest,readJsonFileStrict,readStableBytes,assertNoSymlinkPathSegments,parseJsonRejectDuplicateKeys} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {fullGenerationInput,fullInstructionInventory} from './instruction-loop-full-candidate.mjs';
import {bindMeasuredNormalOwnerSource} from './instruction-loop-source-binding.mjs';
import {verifyRetainedInstructionLayout} from './retained-instruction-layout.mjs';
const json=path=>readJsonFileStrict(path,'retained Full authoring evidence',16*1024*1024);
export const retainedAuthoringPin=path=>({path:resolve(path),digest:hash(readStableBytes(resolve(path),'retained Full authoring evidence',16*1024*1024))});
const checked=ref=>{assert.deepEqual(Object.keys(ref).sort(),['digest','path']);assert.equal(resolve(ref.path),ref.path);assert.deepEqual(retainedAuthoringPin(ref.path),ref,'retained authoring evidence drift');return json(ref.path);};
export function inspectClosedFullAuthoring({root,profilePath,configPath,preEvaluation=false,reselectCases=false}){
 root=resolve(root);profilePath=resolve(profilePath);configPath=resolve(configPath);
 assert.ok(!existsSync(join(root,'.advance-lock')),'original coordinator lock requires inspection');
 for(const path of [root,profilePath,configPath])assertNoSymlinkPathSegments(path,'original retained authoring evidence');
 assert.ok(!reselectCases||preEvaluation,'case reselection requires the unapproved evaluation gate');
 const history=readRunJournal(root),s=history.state,p=json(profilePath),config=json(configPath);
 assert.equal(p.kind,'full_practical_instruction_loop_profile_v1','retained authoring recovery requires the inline Full practical port');
 if(preEvaluation){
  assert.ok(s?.status==='awaiting_evaluation_approval'&&s.pending===null&&s.gate?.kind==='evaluation','only a pending first case judgment can be reconfigured');
  assert.deepEqual(Object.keys(s.outputs).sort(),['generate','register','select']);
 }else assert.ok(s?.status==='operation_uncertain'&&s.pending?.kind==='generate','only consumed Full generation failure can be recovered');
 assert.ok(!s.evaluation_decision&&!s.trials.length&&(preEvaluation||Object.keys(s.outputs).length===0),'case or lifecycle effects require their original recovery path');
 assert.equal(canonicalDigest(config.policy),canonicalDigest(s.policy),'original policy drift');
 assert.equal(canonicalDigest(config.runtime),s.policy.runtime_digest,'original runtime drift');
 assert.equal(config.runtime.kind,'full_practical_instruction_loop_runtime_v1');assert.equal(config.runtime.profile_path,profilePath);
 assert.equal(config.runtime.profile_digest,retainedAuthoringPin(profilePath).digest,'original profile not pinned');
 assert.equal(canonicalDigest({...p.policy,runtime_digest:s.policy.runtime_digest}),canonicalDigest(s.policy));
 for(const ref of config.runtime.source_pins)assert.deepEqual(retainedAuthoringPin(ref.path),ref,'original runtime source drift');
 assert.equal(p.generator.provider.kind,'codex');
 const jobs=preEvaluation?history.events.map(e=>e.state.pending).filter(j=>j?.kind==='generate'):[s.pending];
 const uniqueJobs=new Map(jobs.map(j=>[canonicalDigest(j),j]));assert.equal(uniqueJobs.size,1,'one exact authoring job required');
 const job=[...uniqueJobs.values()][0];assert.equal(canonicalDigest(job.input.observation),canonicalDigest(p.policy.observation));
 const session=p.generator.provider.sessionRoot,executionPath=join(session,'provider-execution.json'),responsePath=join(session,'last-message.json');
 const execution=json(executionPath),response=json(responsePath);
 assert.equal(execution.kind,'full_authoring_execution_v1');
 assert.ok(execution.model_call_authorized===true&&execution.spawn_observed===true&&execution.termination_confirmed===true&&execution.exit_code===0&&execution.signal===null&&execution.error===null&&execution.timed_out===false&&execution.interrupted===false&&execution.output_limited===false,'positive closed authoring result required; no replay or closure inference');
 // Legacy receipts bind the retained answer through their complete CLI JSONL.
 // This is local provider evidence, not an attestation of remote completion.
 assert.equal(execution.stdout.truncated,false,'truncated authoring transcript cannot bind a retained answer');
 assert.equal(execution.stdout.total_bytes,Buffer.byteLength(execution.stdout.text));
 const events=execution.stdout.text.trim().split('\n').filter(Boolean).map(line=>parseJsonRejectDuplicateKeys(line,'authoring event'));
 const answers=events.filter(e=>e.type==='item.completed'&&e.item?.type==='agent_message');
 assert.equal(answers.length,1,'one unambiguous retained authoring answer required');
 assert.equal(events.filter(e=>e.type==='turn.completed').length,1,'positive terminal provider event required');
 const completed=events.findIndex(e=>e.type==='turn.completed'),started=events.filter(e=>e.type==='turn.started');
 assert.equal(completed,events.length-1,'activity after provider completion leaves later work unconfirmed');
 assert.ok(started.length<=1,'ambiguous provider turns');
 if(started.length)assert.ok(events.indexOf(started[0])<events.indexOf(answers[0]),'answer must follow its provider turn start');
 assert.ok(events.indexOf(answers[0])<completed,'answer must precede completion');
 assert.ok(!events.some(e=>e.type==='turn.failed'||e.type==='error'),'failed provider transcript cannot authorize reuse');
 assert.equal(canonicalDigest(parseJsonRejectDuplicateKeys(answers[0].item.text,'retained authoring answer')),canonicalDigest(response),'retained answer differs from provider transcript');
 const input=fullGenerationInput({...p.generator,observation:p.policy.observation});
 if(execution.input_digest!==undefined)assert.equal(execution.input_digest,canonicalDigest(input),'recorded authoring input differs');
 if(execution.response_ref!==undefined)assert.deepEqual(execution.response_ref,retainedAuthoringPin(responsePath));
 assert.equal(readRunJournal(root).previous,history.previous,'original run changed during inspection');
 let preservedCandidate;
 if(reselectCases){
  const candidate=s.outputs.register;bindMeasuredNormalOwnerSource({sourceRoot:p.generator.candidateRoot,candidate});
  assert.equal(candidate.full_root,p.generator.fullRoot);
  const retained=verifyRetainedInstructionLayout({storeRoot:p.storeRoot,layoutObjectDigest:candidate.layout_object_digest});
  const fullDigest=canonicalDigest(fullInstructionInventory(candidate.full_root));
  assert.equal(fullDigest,canonicalDigest(retained.layout.files.map(f=>({path:f.path,bytes:f.bytes,mode:f.mode,sha256:f.raw_digest}))),'retained candidate Full content drift');
  preservedCandidate={source_revision:candidate.source_revision,source_inventory_digest:canonicalDigest(fullInstructionInventory(candidate.source_root)),full_inventory_digest:fullDigest};
 }
 assert.equal(readRunJournal(root).previous,history.previous,'original run changed during candidate inspection');
 return {profile:p,input,response,origin:{kind:reselectCases?'retained_full_authoring_origin_v3':preEvaluation?'retained_full_authoring_origin_v2':'retained_full_authoring_origin_v1',root,journal_digest:history.previous,
  profile:retainedAuthoringPin(profilePath),config:retainedAuthoringPin(configPath),execution:retainedAuthoringPin(executionPath),response:retainedAuthoringPin(responsePath),
  ...(preEvaluation?{authoring_job_digest:canonicalDigest(job),source_status:s.status,source_candidate_digest:canonicalDigest(s.outputs.register)}:{failed_job_digest:canonicalDigest(job)}),input_digest:canonicalDigest(input),input_evidence:execution.input_digest?'recorded_request_digest':'reconstructed_from_pinned_profile_and_source',
  ...(preservedCandidate?{preserved_candidate:preservedCandidate}:{}),closure_scope:execution.closure_scope,previous_state_completed:false,approval_carried_forward:false}};
}
export function readRetainedFullAuthoring(ref){
 const origin=checked(ref);assert.ok(['retained_full_authoring_origin_v1','retained_full_authoring_origin_v2','retained_full_authoring_origin_v3'].includes(origin.kind));
 checked(origin.profile);checked(origin.config);checked(origin.execution);checked(origin.response);
 const inspected=inspectClosedFullAuthoring({root:origin.root,profilePath:origin.profile.path,configPath:origin.config.path,preEvaluation:origin.kind!=='retained_full_authoring_origin_v1',reselectCases:origin.kind==='retained_full_authoring_origin_v3'});
 assert.equal(canonicalDigest(inspected.origin),canonicalDigest(origin),'retained authoring origin changed');
 return inspected;
}
export function retainedFullAuthoringProvider(provider,input){
 const inspected=readRetainedFullAuthoring(provider.retainedAuthoring);
 assert.deepEqual(provider.response,inspected.origin.response,'response origin transplant');
 assert.equal(canonicalDigest(input),inspected.origin.input_digest,'retained authoring cannot answer a changed request');
 return {response:inspected.response,execution:{kind:'retained_codex_response',model_calls:0,original_provider_invocations:1,
  ...(inspected.origin.preserved_candidate?{preserved_candidate_source:{source_root:inspected.profile.generator.candidateRoot,source_revision:inspected.origin.preserved_candidate.source_revision}}:{}),
  original_execution:inspected.origin.execution,origin:provider.retainedAuthoring,input_evidence:inspected.origin.input_evidence,
  prior_usage_recounted:false,closure_scope:inspected.origin.closure_scope,previous_state_completed:false}};
}

// Reselection retains the original source commit and every source/Full byte.
export function verifyReselectedCandidate(provider,candidate){
 if(!provider.retainedAuthoring)return;
 const {origin}=readRetainedFullAuthoring(provider.retainedAuthoring);
 if(!origin.preserved_candidate)return;
 assert.equal(canonicalDigest(fullInstructionInventory(candidate.source_root)),origin.preserved_candidate.source_inventory_digest,'reselected candidate source content changed');
 assert.equal(canonicalDigest(fullInstructionInventory(candidate.full_root)),origin.preserved_candidate.full_inventory_digest,'reselected candidate Full content changed');
}
