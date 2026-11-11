// Narrow host recovery for an already approved, merged source adoption whose
// version stage stopped before Registry access because authority was omitted.
import assert from 'node:assert/strict';
import {existsSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {verifyRetainedSourceApplication} from './instruction-loop-source-application.mjs';
import {verifyAssetRegistry} from './asset-registry.mjs';
import {transitionInstructionLoopAssets,validateInstructionLoopAssetAuthority} from './instruction-loop-assets.mjs';
const read=p=>readJsonFileStrict(p,'version recovery input',16*1024*1024);
const pin=p=>{assert.equal(resolve(p),p);assertNoSymlinkPathSegments(p,'version recovery input');return {path:p,digest:hash(readStableBytes(p,'version recovery input',16*1024*1024))};};
const save=(p,v)=>writeCanonicalJsonNoReplace({outputPath:p,artifact:v,label:'version recovery receipt',maximumBytes:16*1024*1024});
function checked({root,configPath,authorization}){
 const config=read(configPath),def=config.runtime;assert.equal(def.kind,'full_practical_instruction_loop_runtime_v1');
 for(const ref of [...def.source_pins,{path:def.profile_path,digest:def.profile_digest},authorization])assert.equal(pin(ref.path).digest,ref.digest,'frozen recovery input drift');
 const p=read(def.profile_path),j=readRunJournal(root),s=j.state,job=s.pending;assert.equal(p.normal.kind,'ask_source_repository_v1');
 assert.equal(s.policy.runtime_digest,canonicalDigest(def));assert.equal(canonicalDigest(s.policy),canonicalDigest(config.policy));
 assert.equal(s.status,'operation_uncertain');assert.equal(job?.kind,'version');assert.equal(job.input.action,'activate');assert.equal(p.assetAuthority,undefined,'only omitted-authority recovery is supported');
 assert.equal(s.gate,null);assert.equal(s.change_decision?.disposition,'approved');assert.equal(canonicalDigest(job.input.decision),canonicalDigest(s.change_decision));
 assert.ok(j.events.some(e=>e.kind==='operation_uncertain'&&canonicalDigest(e.state.pending)===canonicalDigest(job)&&e.detail.reason==="Cannot read properties of undefined (reading 'kind')"),'missing retained pre-Registry authority failure');
 verifyRetainedSourceApplication(p,job.input.application,{root,job});
 const dir=join(p.stateRoot,'stages',canonicalDigest(job).slice(7));assertNoSymlinkPathSegments(dir,'version stage');
 assert.deepEqual(readdirSync(dir).sort(),['request.json'],'version stage already has recovery or result; inspect it, never replay');assert.equal(canonicalDigest(read(join(dir,'request.json'))),canonicalDigest(job));
 const c=job.input.candidate,r=c.registry,registry=verifyAssetRegistry({storeRoot:p.storeRoot,snapshotDigest:r.snapshot_digest,trustedAuthorityContexts:r.trusted_authority_contexts});
 assert.ok(c.candidate_assets.length>0);assert.ok(c.candidate_assets.every(a=>registry.assets.some(e=>e.record_digest===a.record_digest&&e.state==='candidate')),'expected unchanged candidate state');
 const receipt={kind:'missing_asset_authority_recovery_v1',root,journal_digest:j.previous,job_digest:canonicalDigest(job),config:pin(configPath),profile:pin(def.profile_path),authorization,decision:s.change_decision,application_digest:canonicalDigest(job.input.application),predecessor_snapshot:r.snapshot_digest,candidate_assets:c.candidate_assets,baseline_assets:c.baseline_assets??p.generator.parentAssets,no_prior_version_write:{stage_files:['request.json'],candidate_states:'candidate',failure_before_registry_access:true,reason:'Pinned transitionInstructionLoopAssets reads missing authority.kind before Registry verification or transition writes.'}};
 return {p,job,dir,receipt};
}
export function prepareMissingAssetAuthorityRecovery(options){const unlock=lockRunJournal(options.root);try{return checked(options).receipt;}finally{unlock();}}
export function recoverMissingAssetAuthorityVersion(options){const unlock=lockRunJournal(options.root);try{
 const {p,job,dir,receipt}=checked(options);assert.equal(canonicalDigest(receipt),options.expectedReceiptDigest,'recovery plan changed');
 const authority={kind:'external_asset_lifecycle_authority',authority_id:options.authorityId,authority_revision:canonicalDigest(receipt),authority_evidence_digest:canonicalDigest(receipt)};validateInstructionLoopAssetAuthority(authority);
 // This intent makes any subsequent attempt stop, even if a process dies after
 // one of the Registry writes. A partial execution requires receipt inspection.
 save(join(dir,'host-recovery-intent.json'),{...receipt,authority});
 const c=job.input.candidate,r=c.registry,output=transitionInstructionLoopAssets({storeRoot:p.storeRoot,snapshotDigest:r.snapshot_digest,trustedAuthorityContexts:r.trusted_authority_contexts,candidateAssets:c.candidate_assets,baselineAssets:receipt.baseline_assets,action:'activate',authority});
 const verified=verifyAssetRegistry({storeRoot:p.storeRoot,snapshotDigest:output.snapshot_digest,trustedAuthorityContexts:output.trusted_authority_contexts});assert.ok(c.candidate_assets.every(a=>verified.assets.some(e=>e.record_digest===a.record_digest&&e.state==='current')));
 const result={request_digest:canonicalDigest(job),status:'completed',output,inspection:{recovered_by_host:true,recovery_receipt_digest:canonicalDigest(receipt),original_failure_preserved:true}};
 save(join(dir,'host-recovery-completion.json'),result);save(join(dir,'result.json'),result);return result;
 }finally{unlock();}}
