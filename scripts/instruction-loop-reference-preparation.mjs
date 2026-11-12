// Import a closed, already materialized Full candidate into a fresh decision-only
// coordinator. The original journal/runtime, frozen Full metadata and approvals
// remain historical evidence, never current execution or application authority.
import assert from 'node:assert/strict';
import {readInstructionSourceSnapshot,writeInstructionSourceSnapshot} from './instruction-source-version.mjs';
import {mkdirSync,existsSync,writeFileSync,chmodSync,lstatSync,readdirSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {devNull} from 'node:os';
import {canonicalDigest,readJsonFileStrict,readStableBytes,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash,verifyInstructionEnvironment,instructionEnvironmentTrustOptions} from './instruction-environment.mjs';
import {fullInstructionInventory} from './instruction-loop-full-candidate.mjs';
import {verifyOwnedFullCandidate} from './instruction-loop-native-host.mjs';
import {withClosedFullAuthoring,retainedAuthoringPin as pin} from './instruction-loop-retained-authoring.mjs';
import {createNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
import {appendRunJournal,readRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {inspectInstructionReferenceEvidence,prepareInstructionReferenceEvidence,readInstructionReferenceEvidence,referenceEvidenceGate} from './instruction-loop-reference-evidence.mjs';
const save=(path,artifact)=>writeCanonicalJsonNoReplace({outputPath:path,artifact,label:'retained reference preparation',maximumBytes:16*1024*1024});
const json=path=>readJsonFileStrict(path,'retained reference preparation',16*1024*1024);
// Missing reserved path components have no filesystem spelling to resolve.
// Conservatively treat normalized case aliases as overlapping on every host.
const overlap=(a,b)=>{a=a.normalize('NFC').toLowerCase();b=b.normalize('NFC').toLowerCase();return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');};
// Existing ancestors can have alternate casing on case-insensitive volumes.
// Canonicalize them before comparing ownership boundaries or creating anything.
function canonicalHostPath(path){
 const missing=[];let ancestor=resolve(path);
 while(!existsSync(ancestor)){missing.unshift(basename(ancestor));const parent=dirname(ancestor);assert.notEqual(parent,ancestor,'existing path ancestor required');ancestor=parent;}
 return resolve(realpathSync.native(ancestor),...missing);
}
function git(root,args){
 const r=spawnSync('git',['--no-optional-locks','-c',`core.hooksPath=${devNull}`,'-c','core.fsmonitor=false',...args],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000,
  env:{...Object.fromEntries(['PATH','TMPDIR','LANG','TZ'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),GIT_CONFIG_GLOBAL:devNull,GIT_CONFIG_SYSTEM:devNull,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'}});
 assert.equal(r.status,0,'retained source Git operation failed: '+args[0]);return r.stdout.trim();
}
function independentObjects(root){
 assert.ok(lstatSync(join(root,'.git')).isDirectory(),'independent Git directory required');
 for(const name of ['commondir','objects/info/alternates','objects/info/http-alternates'])assert.ok(!existsSync(join(root,'.git',name)),'retained source must not borrow Git storage');
 const walk=dir=>{for(const name of readdirSync(dir)){const path=join(dir,name),s=lstatSync(path);assert.ok(!s.isSymbolicLink(),'retained Git object symlink');if(s.isDirectory())walk(path);else assert.ok(s.isFile()&&s.nlink===1,'retained Git objects must be independently owned');}};
 walk(join(root,'.git/objects'));
}
function checkEnvironment(p,c){
 const {environment}=verifyInstructionEnvironment({storeRoot:p.storeRoot,environmentObjectDigest:c.environment_object_digest,
  trustedAssetAuthorityContexts:c.registry.trusted_authority_contexts??[],...instructionEnvironmentTrustOptions(p.practical.environmentTrust)});
 assert.equal(environment.retained_layout_object_digest,c.layout_object_digest,'reference environment and frozen Full layout differ');
 assert.equal(environment.registry_snapshot_digest,c.registry.snapshot_digest,'reference Registry differs from retained environment');
 assert.equal(canonicalDigest(environment.bindings.map(b=>b.asset).sort((a,b)=>a.stable_id.localeCompare(b.stable_id))),canonicalDigest([...c.environment_assets].sort((a,b)=>a.stable_id.localeCompare(b.stable_id))),'retained environment Asset identities differ');
}
function copyFull(source,destination,inventory){
 mkdirSync(destination,{mode:0o700});
 for(const file of inventory){const bytes=readStableBytes(join(source,file.path),'retained Full copy',16*1024*1024);assert.equal(hash(bytes),file.sha256);assert.equal(bytes.length,file.bytes);
  const path=join(destination,file.path);mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,bytes,{flag:'wx',mode:file.mode});chmodSync(path,file.mode);}
 assert.equal(canonicalDigest(fullInstructionInventory(destination)),canonicalDigest(inventory),'retained Full copy differs');
}
export function prepareReferenceEvidenceInstructionLoop({root,profilePath,configPath,outputRoot,id,referenceEvidence}){
 root=resolve(root);profilePath=resolve(profilePath);configPath=resolve(configPath);outputRoot=resolve(outputRoot);
 for(const path of [root,profilePath,configPath,outputRoot])assertNoSymlinkPathSegments(path,'retained reference preparation',{allowMissingLeaf:true});
 assert.equal(outputRoot,canonicalHostPath(outputRoot),'fresh reference output requires canonical existing ancestor casing');
 return withClosedFullAuthoring({root,profilePath,configPath,preEvaluation:true},inspected=>{
  const old=inspected.profile,history=readRunJournal(root),previous=history.state,c=previous.outputs.register;
  assert.ok(old.normal.target===null||old.normal.kind==='ask_source_repository_v1','reference evidence supports source application or explicit result-only review');
  assert.equal(history.previous,inspected.origin.journal_digest,'old coordinator changed during inspection');
  assert.ok(!previous.reference_evidence&&!previous.reference_decision&&!previous.change_decision&&!previous.result_decision,'fresh reference and application decisions required');
  assert.equal(c.no_change,false,'reference adoption requires a changed retained candidate');
  const owned=verifyOwnedFullCandidate(old,c);checkEnvironment(old,c);
  inspectInstructionReferenceEvidence(referenceEvidence,c);
  const filesystem=c.source_revision.startsWith('sha256:');
  const sourceTree=filesystem?readInstructionSourceSnapshot(c.source_root)?.revision:git(c.source_root,['rev-parse','HEAD^{tree}']),fullInventory=fullInstructionInventory(c.full_root);
  assert.match(id,/^[A-Za-z0-9._-]{1,100}$/u);assert.notEqual(id,old.policy.id);assert.ok(outputRoot.startsWith(canonicalHostPath(old.protectedRoot)+'/'),'fresh reference run must remain in the protected root');
  const protectedPaths=[root,profilePath,configPath,old.storeRoot,old.stateRoot,old.generator.baselineSourceRoot,old.generator.candidateRoot,old.generator.fullRoot,old.generator.stagingRoot,old.generator.provider.sessionRoot,
   old.practical.root,old.practical.baselineRoot,old.normal.target,owned.archive,c.owned_version.manifest,...json(configPath).runtime.source_pins.map(p=>p.path),...referenceEvidence.artifacts.map(a=>a.path)].filter(Boolean);
  for(const path of protectedPaths)assert.ok(!overlap(outputRoot,canonicalHostPath(path)),'fresh reference output overlaps original source, evidence, run or owner');
  const origin={...inspected.origin,kind:'retained_reference_candidate_origin_v1',candidate_digest:canonicalDigest(c),candidate:c,
   original_policy_digest:canonicalDigest(previous.policy),original_runtime_digest:previous.policy.runtime_digest,original_gate:previous.gate,original_selection:previous.outputs.select,
   source_tree:sourceTree,full_inventory_digest:canonicalDigest(fullInventory),owned_manifest_digest:canonicalDigest(owned),models_started:false,retained_candidate:true,standard_evaluation_executed:false};
  const intent={origin_digest:canonicalDigest(origin),manifest_digest:canonicalDigest(referenceEvidence),id,output_root:outputRoot},receiptPath=join(outputRoot,'reference-prepared.json');
  if(existsSync(outputRoot)){
   assert.ok(existsSync(receiptPath),'partial reference preparation preserved; select a fresh output root');const receipt=json(receiptPath);
   assert.equal(receipt.intent_digest,canonicalDigest(intent),'different retained reference preparation intent');
   for(const ref of [receipt.profile,receipt.config,receipt.origin])assert.deepEqual(pin(ref.path),ref,'prepared reference input drift');
   const next=json(receipt.profile.path);assert.equal(canonicalDigest(json(receipt.config.path)),canonicalDigest(createNativeInstructionLoopConfiguration(receipt.profile.path)),'prepared reference runtime drift');
   const h=readRunJournal(receipt.result.run_root);assert.equal(h.previous,receipt.journal_digest,'prepared reference coordinator already advanced');
   verifyOwnedFullCandidate(next,h.state.outputs.register);if(filesystem)assert.equal(readInstructionSourceSnapshot(next.generator.candidateRoot)?.revision,c.source_revision);else independentObjects(next.generator.candidateRoot);readInstructionReferenceEvidence({root:receipt.result.run_root,state:h.state,verifySource:true});return receipt.result;
  }
  const p=structuredClone(old);
  p.stateRoot=join(outputRoot,'state');p.generator.candidateRoot=join(outputRoot,'candidate');p.generator.fullRoot=join(outputRoot,'full');p.generator.stagingRoot=join(outputRoot,'staging');
  p.generator.provider.sessionRoot=join(outputRoot,'generation-session');p.practical.root=join(outputRoot,'evaluation');p.policy={...p.policy,id};delete p.policy.runtime_digest;
  const nextProfile=join(outputRoot,'profile.json'),nextConfig=join(outputRoot,'config.json'),nextRoot=join(outputRoot,'run'),originPath=join(outputRoot,'reference-origin.json');
  for(const path of [p.stateRoot,p.generator.candidateRoot,p.generator.fullRoot,p.generator.stagingRoot,p.generator.provider.sessionRoot,p.practical.root,nextRoot]){
   assertNoSymlinkPathSegments(path,'fresh reference destination',{allowMissingLeaf:true});assert.ok(!existsSync(path),'fresh reference destination required');}
  mkdirSync(outputRoot,{mode:0o700});mkdirSync(p.stateRoot,{mode:0o700});
  if(filesystem){
   copyFull(c.source_root,p.generator.candidateRoot,owned.tracked_files);
   writeInstructionSourceSnapshot(p.generator.candidateRoot,{contextDigest:readInstructionSourceSnapshot(c.source_root).context_digest});
   assert.equal(readInstructionSourceSnapshot(p.generator.candidateRoot)?.revision,sourceTree,'retained filesystem source differs');
  } else {
  mkdirSync(p.generator.candidateRoot,{mode:0o700});
  git(p.generator.candidateRoot,['init','--quiet','--template=']);
  // Local fetch copies objects through Git transport. No --shared, alternates,
  // hardlinks, worktrees, copied hooks/config, or historical runtime execution.
  git(p.generator.candidateRoot,['fetch','--quiet','--no-tags','--no-recurse-submodules',c.source_root,c.source_revision,c.baseline_revision]);
  git(p.generator.candidateRoot,['checkout','--quiet','--detach',c.source_revision]);independentObjects(p.generator.candidateRoot);
  assert.equal(git(p.generator.candidateRoot,['rev-parse','HEAD^{tree}']),sourceTree,'retained source tree differs');
  }
  // Git stores executable bits, not all frozen permissions. Restore the exact
  // inventory modes without changing any source bytes or commit identity.
  for(const file of owned.tracked_files)chmodSync(join(p.generator.candidateRoot,file.path),file.mode);
  assert.equal(canonicalDigest(fullInstructionInventory(p.generator.candidateRoot)),canonicalDigest(owned.tracked_files),'retained source inventory differs');
  copyFull(c.full_root,p.generator.fullRoot,fullInventory);
  mkdirSync(p.generator.stagingRoot,{mode:0o700});save(join(p.generator.stagingRoot,'owned-files.json'),{files:[]});
  const archive=join(p.stateRoot,'owned-candidate-version.tar.gz');const tar=spawnSync('/usr/bin/tar',['-czf',archive,'-C',p.generator.candidateRoot,'.'],{encoding:'utf8',timeout:120000});assert.equal(tar.status,0,'retained candidate archive failed');
  const version={path:p.generator.candidateRoot,source_revision:c.source_revision,archive,archive_digest:hash(readStableBytes(archive,'retained owned source archive',512*1024*1024)),tracked_files:owned.tracked_files},manifest=join(p.stateRoot,'owned-version.json');save(manifest,version);
  const retained={...c,source_root:p.generator.candidateRoot,full_root:p.generator.fullRoot,staging_root:p.generator.stagingRoot,
   owned_version:{path:version.path,source_revision:version.source_revision,archive,archive_digest:version.archive_digest,manifest,manifest_digest:canonicalDigest(version)},
   generated_by_this_loop:false,retained_from_prior_loop:true,execution:{kind:'retained_full_candidate_copy',model_calls:0,original_candidate_digest:canonicalDigest(c),prior_usage_recounted:false}};
  verifyOwnedFullCandidate(p,retained);checkEnvironment(p,retained);
  // Recheck every old binding while its coordinator remains reserved. Arbitrary
  // filesystem writers are not made safe by a controller lock.
  assert.equal(readRunJournal(root).previous,history.previous,'old coordinator changed during copy');verifyOwnedFullCandidate(old,c);
  for(const ref of [inspected.origin.profile,inspected.origin.config,inspected.origin.execution,inspected.origin.response])assert.deepEqual(pin(ref.path),ref,'old retained origin changed during copy');
  const oldConfig=json(configPath);for(const ref of oldConfig.runtime.source_pins)assert.deepEqual(pin(ref.path),ref,'old runtime changed during copy');
  save(originPath,origin);save(nextProfile,p);const config=createNativeInstructionLoopConfiguration(nextProfile);save(nextConfig,config);
  mkdirSync(nextRoot,{mode:0o700});const unlock=lockRunJournal(nextRoot);
  try{
   // A retained-state import is recorded as such, not as fake generate/register/
   // select execution. The original selection has no execution binding here.
   const state={policy:config.policy,status:'awaiting_evaluation_approval',pending:null,gate:structuredClone(previous.gate),trials:[],rows:[],
    outputs:{generate:retained,register:retained,select:{kind:'retained_reference_selection_v1',case_ids:[],source_profile_digest:canonicalDigest(p),original_selection_digest:canonicalDigest(previous.outputs.select),standard_evaluation_executable:false}},
    reference_origin:origin};
   // Never persist the temporary pre-evaluation shape. A crash during snapshot
   // preparation must not expose the old evaluation gate as fresh authority.
   state.reference_evidence=prepareInstructionReferenceEvidence({root:nextRoot,state,journalDigest:null,manifest:referenceEvidence});
   state.gate=referenceEvidenceGate(state);state.status='awaiting_reference_review';
   appendRunJournal(nextRoot,'retained_reference_prepared',state,{original_journal_digest:history.previous,models_started:false,approval_carried_forward:false});
  }finally{unlock();}
  const result={status:'prepared',profile_path:nextProfile,config_path:nextConfig,run_root:nextRoot,previous_journal_digest:history.previous,previous_state_completed:false,models_started:false,retained_candidate:true,approval_carried_forward:false,standard_evaluation_executed:false};
  save(receiptPath,{intent_digest:canonicalDigest(intent),profile:pin(nextProfile),config:pin(nextConfig),origin:pin(originPath),journal_digest:readRunJournal(nextRoot).previous,result});return result;
 });
}
