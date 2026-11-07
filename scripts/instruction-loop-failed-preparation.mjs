// Prepare new work only from positive closed pre-case failure evidence.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {canonicalDigest,stableCanonicalJson,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readRunJournal} from './instruction-run-journal.mjs';
import {createNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
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
