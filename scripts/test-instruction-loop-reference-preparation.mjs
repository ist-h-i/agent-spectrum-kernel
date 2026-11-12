import test from 'node:test';
import {writeInstructionSourceSnapshot} from './instruction-source-version.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync,lstatSync,chmodSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {devNull} from 'node:os';
import {spawnSync} from 'node:child_process';
import {canonicalDigest} from './content-addressed-store.mjs';
import {captureInstructionEnvironment,instructionBytesDigest as hash} from './instruction-environment.mjs';
import {captureRetainedInstructionLayout} from './retained-instruction-layout.mjs';
import {environmentFixture} from './test-helpers-instruction-environment.mjs';
import {referenceFixture} from './test-helpers-instruction-reference.mjs';
import {fullGenerationInput,fullInstructionInventory} from './instruction-loop-full-candidate.mjs';
import {createNativeInstructionLoopConfiguration,prepareNextNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
import {readRunJournal,appendRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {withClosedFullAuthoring} from './instruction-loop-retained-authoring.mjs';
import {prepareReferenceEvidenceInstructionLoop} from './instruction-loop-reference-preparation.mjs';
import {readInstructionReferenceEvidence} from './instruction-loop-reference-evidence.mjs';
import {advanceSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {createConfiguredInstructionLoopRuntime} from './instruction-loop-runtime.mjs';
const json=p=>JSON.parse(readFileSync(p));
const put=(path,value)=>{mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,typeof value==='string'?value:JSON.stringify(value));};
function git(root,args){const r=spawnSync('git',['-c','core.hooksPath='+devNull,'-c','user.name=Fixture','-c','user.email=fixture@invalid','-c','commit.gpgsign=false',...args],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function fixture(t,{owner=false,filesystem=false}={}){
 const f=environmentFixture(t,'codex','challenger'),base=f.root,source=join(base,'source'),candidateRoot=join(base,'old-candidate'),fullRoot=join(base,'old-full'),stateRoot=join(base,'old-state'),root=join(base,'old-run'),session=join(base,'old-session');
 put(join(source,'skills/demo/SKILL.md'),'Original instruction.\n');git(source,['init','--quiet']);git(source,['add','.']);git(source,['commit','--quiet','-m','baseline']);let baseline=git(source,['rev-parse','HEAD']);
 git(source,['clone','--quiet','--no-local','--no-hardlinks',source,candidateRoot]);put(join(candidateRoot,'skills/demo/SKILL.md'),'Changed instruction.\n');git(candidateRoot,['add','.']);git(candidateRoot,['commit','--quiet','-m','candidate']);let revision=git(candidateRoot,['rev-parse','HEAD']);
 if(filesystem){rmSync(join(source,'.git'),{recursive:true});rmSync(join(candidateRoot,'.git'),{recursive:true});baseline=writeInstructionSourceSnapshot(source);revision=writeInstructionSourceSnapshot(candidateRoot);}
 for(const path of ['skills/demo/SKILL.md','.agents/skills/demo/SKILL.md'])put(join(fullRoot,path),'Changed instruction.\n');
 put(join(fullRoot,'AGENTS.md'),'Synthetic retained full context.\n');put(join(fullRoot,'.agent-spectrum-kernel/codex-install-state.json'),{selected_profile:'full',selected_skills:['demo'],target:fullRoot,source_root:candidateRoot});
 chmodSync(join(fullRoot,'AGENTS.md'),0o640);
 for(const mapping of f.options.bindings[0].files){const file=f.content.files.find(v=>v.path===mapping.source);put(join(fullRoot,mapping.target),Buffer.from(file.bytes_base64,'base64').toString('utf8'));}
 const inventory=fullInstructionInventory(fullRoot),layout=captureRetainedInstructionLayout({storeRoot:f.storeRoot,sourceRoot:fullRoot,expectedFiles:inventory,expectedInventoryDigest:canonicalDigest(inventory)});
 const mapped=new Set(f.options.bindings.flatMap(v=>v.files.map(v=>v.target)));
 const environment=captureInstructionEnvironment({...f.options,sourceRoot:fullRoot,selectionObjectDigest:null,supportPaths:inventory.map(f=>f.path).filter(v=>!mapped.has(v)),retainedLayoutObjectDigest:layout.object_digest});
 mkdirSync(stateRoot);const archive=join(stateRoot,'owned-candidate-version.tar.gz');assert.equal(spawnSync('/usr/bin/tar',['-czf',archive,'-C',candidateRoot,'.']).status,0);
 const owned={path:candidateRoot,source_revision:revision,archive,archive_digest:hash(readFileSync(archive)),tracked_files:fullInstructionInventory(candidateRoot)},ownedPath=join(stateRoot,'owned-version.json');put(ownedPath,owned);
 const c={kind:'generated_full_instruction_candidate_v1',source_root:candidateRoot,source_revision:revision,baseline_revision:baseline,full_root:fullRoot,staging_root:join(base,'old-staging'),changed_paths:['skills/demo/SKILL.md'],layout_object_digest:layout.object_digest,environment_object_digest:environment.object_digest,
  registry:{snapshot_digest:f.options.registrySnapshotDigest,trusted_authority_contexts:[]},candidate_assets:f.options.bindings.map(b=>b.asset),baseline_assets:[],environment_assets:f.options.bindings.map(b=>b.asset),no_change:false,generated_by_this_loop:true,execution:{kind:'synthetic_retained_authoring'},owned_version:{...owned,manifest:ownedPath,manifest_digest:canonicalDigest(owned)},formal_admission_implied:false};delete c.owned_version.tracked_files;
 const command={argv:[process.execPath,'-e','throw Error("no cases may run")'],pins:[],timeout_ms:5000,model_calls:false},context={cli_version:'fixture',model:null,reasoning:null,platform:'synthetic',global_context_ref:null};
 if(owner)git(source,['remote','add','origin','https://github.com/example/synthetic.git']);
 const normal=owner?{kind:'ask_source_repository_v1',target:source,repository:'github.com/example/synthetic',remote_url:'https://github.com/example/synthetic.git',base_branch:'main',base_revision:baseline,publication_branch:'reference/synthetic'}:{target:null};
 const p={kind:'full_practical_instruction_loop_profile_v1',protectedRoot:base,stateRoot,storeRoot:f.storeRoot,normal,baselineEnvironmentObjectDigest:environment.object_digest,
  assetAuthority:{kind:'external_asset_lifecycle_authority',authority_id:'synthetic-owner',authority_revision:'fixture',authority_evidence_digest:canonicalDigest('synthetic lifecycle owner')},
  generator:{...(filesystem?{sourceKind:'filesystem_snapshot'}:{}),storeRoot:f.storeRoot,baselineSourceRoot:source,baselineRevision:baseline,skills:['demo'],goal:'Improve public instructions.',candidateRoot,fullRoot,stagingRoot:c.staging_root,provider:{kind:'codex',sessionRoot:session},registrySnapshotDigest:f.options.registrySnapshotDigest,parentAssets:[],environmentId:'historical-environment'},selection:{limit:1},
  policy:{kind:'reference_instruction_loop_v1',id:'old-loop',observation:{goal:'Improve public instructions.'},catalog:[{id:'old-unapproved',public_input_digest:canonicalDigest('synthetic')}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:normal.target,evaluation_mode:'practical_v1',formal_admission_implied:false},
  practical:{root:join(base,'old-evaluation'),baselineRoot:join(base,'baseline-full'),conditions:{baseline:{context,command,command_role:'check'},candidate:{context,command,command_role:'check'}}}};
 const profilePath=join(base,'profile.json'),configPath=join(base,'config.json');put(profilePath,p);const config=createNativeInstructionLoopConfiguration(profilePath);
 // The historical runtime is distinct from the current controller and stays pinned.
 const historicalRuntime=join(base,'historical-runtime.mjs');put(historicalRuntime,'// retained historical runtime, never executed\n');config.runtime.source_pins=[{path:historicalRuntime,digest:hash(readFileSync(historicalRuntime))}];config.policy.runtime_digest=canonicalDigest(config.runtime);put(configPath,config);
 mkdirSync(root);const pending={kind:'generate',key:'generate',input:{observation:p.policy.observation}};appendRunJournal(root,'synthetic_closed_authoring',{policy:config.policy,status:'advancing',pending,outputs:{},trials:[],rows:[]});
 const gate={kind:'evaluation',packet:{candidate:c,selection:{case_ids:['old-unapproved']},rows:[],runtime_digest:config.policy.runtime_digest,normal_target:normal.target}};
 appendRunJournal(root,'human_gate',{policy:config.policy,status:'awaiting_evaluation_approval',pending:null,gate,outputs:{generate:c,register:c,select:{case_ids:['old-unapproved'],source_profile_digest:canonicalDigest(p)}},trials:[],rows:[]});
 const response={changes:[{operation:'write',path:'skills/demo/SKILL.md',text:'Changed instruction.\n'}]},responsePath=join(session,'last-message.json');put(responsePath,response);
 const stdout=[{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(response)}},{type:'turn.completed'}].map(JSON.stringify).join('\n')+'\n';
 put(join(session,'provider-execution.json'),{kind:'full_authoring_execution_v1',closure_scope:'synthetic direct local child only',model_call_authorized:true,spawn_observed:true,termination_confirmed:true,exit_code:0,signal:null,error:null,timed_out:false,interrupted:false,output_limited:false,stdout:{text:stdout,total_bytes:Buffer.byteLength(stdout),truncated:false},input_digest:canonicalDigest(fullGenerationInput({...p.generator,observation:p.policy.observation})),response_ref:{path:responsePath,digest:hash(readFileSync(responsePath))}});
 return {base,root,profilePath,configPath,p,c,outputRoot:join(base,'fresh'),id:'reference-copy',referenceEvidence:referenceFixture(base,c),historicalRuntime};
}
test('retained historical candidate gets independent source/Full/archive and a fresh reference-only gate',async t=>{
 const f=fixture(t),before=readRunJournal(f.root).previous,oldFull=fullInstructionInventory(f.p.generator.fullRoot),oldConfig=readFileSync(f.configPath);
 const r=prepareReferenceEvidenceInstructionLoop(f),p=json(r.profile_path),config=json(r.config_path),h=readRunJournal(r.run_root),c=h.state.outputs.register;
 assert.equal(r.models_started,false);assert.equal(r.approval_carried_forward,false);assert.equal(r.previous_state_completed,false);assert.equal(h.state.status,'awaiting_reference_review');assert.equal(h.state.evaluation_decision,undefined);assert.deepEqual(h.state.trials,[]);assert.equal(h.state.outputs.evaluate,undefined);
 assert.equal(h.state.reference_origin.candidate_digest,canonicalDigest(f.c));assert.equal(c.generated_by_this_loop,false);assert.equal(c.retained_from_prior_loop,true);assert.notEqual(c.source_root,f.c.source_root);assert.notEqual(c.owned_version.archive,f.c.owned_version.archive);assert.notEqual(c.owned_version.manifest,f.c.owned_version.manifest);
 assert.equal(git(c.source_root,['rev-parse','HEAD']),f.c.source_revision);assert.equal(git(c.source_root,['rev-parse','HEAD^{tree}']),git(f.c.source_root,['rev-parse','HEAD^{tree}']));assert.deepEqual(fullInstructionInventory(p.generator.fullRoot),oldFull);
 assert.equal(c.layout_object_digest,f.c.layout_object_digest);assert.equal(c.environment_object_digest,f.c.environment_object_digest);assert.deepEqual(c.registry,f.c.registry);assert.deepEqual(json(join(c.full_root,'.agent-spectrum-kernel/codex-install-state.json')),json(join(f.c.full_root,'.agent-spectrum-kernel/codex-install-state.json')));
 assert.equal(lstatSync(join(c.source_root,'.git')).isDirectory(),true);assert.equal(existsSync(join(c.source_root,'.git/commondir')),false);assert.equal(existsSync(join(c.source_root,'.git/objects/info/alternates')),false);
 const check=dir=>{for(const x of readdirSync(dir)){const file=join(dir,x),s=lstatSync(file);assert.equal(s.isSymbolicLink(),false);if(s.isDirectory())check(file);else assert.equal(s.nlink,1);}};check(join(c.source_root,'.git/objects'));
 assert.equal(readRunJournal(f.root).previous,before);assert.deepEqual(readFileSync(f.configPath),oldConfig);assert.ok(config.runtime.source_pins.some(pin=>pin.path.endsWith('/instruction-loop-reference-evidence.mjs')));assert.equal(config.runtime.source_pins.some(pin=>pin.path===f.historicalRuntime),false);
 const snapshot=readInstructionReferenceEvidence({root:r.run_root,state:h.state,verifySource:true});assert.equal(snapshot.manifest.candidate_digest,canonicalDigest(f.c));assert.deepEqual(prepareReferenceEvidenceInstructionLoop(f),r);
 const runtime=createConfiguredInstructionLoopRuntime({definition:config.runtime,modelCallsAuthorized:false});const s=await advanceSupervisedInstructionLoop({root:r.run_root,policy:config.policy,runtime});assert.equal(s.status,'awaiting_reference_review');assert.equal(existsSync(p.practical.root),false);assert.equal(existsSync(p.generator.provider.sessionRoot),false);
});
test('original coordinator is reserved throughout inspection and released without a journal mutation',t=>{
 const f=fixture(t),before=readRunJournal(f.root).previous;
 withClosedFullAuthoring({...f,preEvaluation:true},()=>{assert.ok(existsSync(join(f.root,'.advance-lock/pid')));assert.throws(()=>lockRunJournal(f.root),/running|PID/);});
 assert.equal(existsSync(join(f.root,'.advance-lock')),false);assert.equal(readRunJournal(f.root).previous,before);
});
for(const [name,mutate] of [
 ['active old coordinator',f=>{mkdirSync(join(f.root,'.advance-lock'));put(join(f.root,'.advance-lock/pid'),String(process.pid));}],
 ['old approval',f=>{const h=readRunJournal(f.root);h.state.evaluation_decision={disposition:'approved'};appendRunJournal(f.root,'changed',h.state);}],
 ['old trial',f=>{const h=readRunJournal(f.root);h.state.trials.push({});appendRunJournal(f.root,'changed',h.state);}],
 ['source drift',f=>put(join(f.c.source_root,'skills/demo/SKILL.md'),'changed after retention')],
 ['Full drift',f=>put(join(f.c.full_root,'AGENTS.md'),'changed after retention')],
 ['archive drift',f=>put(f.c.owned_version.archive,'invalid archive')],
 ['wrong reference candidate',f=>f.referenceEvidence.candidate_digest=canonicalDigest('other')],
 ['old runtime drift',f=>put(f.historicalRuntime,'changed runtime')],
 ['overlapping destination',f=>f.outputRoot=join(f.c.source_root,'nested')]
])test(`bridge refuses ${name} before fresh allocation`,t=>{const f=fixture(t);mutate(f);assert.throws(()=>prepareReferenceEvidenceInstructionLoop(f));assert.equal(existsSync(join(f.base,'fresh')),false);});
test('reference rejection disposes only the independent copy, preserving original source/Full/archive and frozen approval',async t=>{
 const f=fixture(t,{owner:true}),before=readRunJournal(f.root).previous,r=prepareReferenceEvidenceInstructionLoop(f),config=json(r.config_path),p=json(r.profile_path),runtime=createConfiguredInstructionLoopRuntime({definition:config.runtime,modelCallsAuthorized:false});
 const gate=readRunJournal(r.run_root).state.gate,s=await advanceSupervisedInstructionLoop({root:r.run_root,policy:config.policy,runtime,decision:{disposition:'rejected',packet_digest:canonicalDigest(gate),reason:'Synthetic reference refusal.'}});
 assert.equal(s.status,'completed',JSON.stringify(readRunJournal(r.run_root).events.at(-1)));assert.equal(s.final.outcome,'reference_rejected');assert.equal(existsSync(p.generator.candidateRoot),false);assert.equal(existsSync(p.generator.fullRoot),false);assert.equal(existsSync(join(p.stateRoot,'owned-candidate-version.tar.gz')),true);
 for(const path of [f.c.source_root,f.c.full_root,f.c.owned_version.archive])assert.equal(existsSync(path),true);assert.equal(readRunJournal(f.root).previous,before);assert.equal(readRunJournal(f.root).state.status,'awaiting_evaluation_approval');
});

test('fresh reference approval and exact change rejection retire only the copy and prepare an unapproved next cycle',async t=>{
 const f=fixture(t,{owner:true}),before=readRunJournal(f.root).previous,r=prepareReferenceEvidenceInstructionLoop(f),config=json(r.config_path),p=json(r.profile_path),runtime=createConfiguredInstructionLoopRuntime({definition:config.runtime,modelCallsAuthorized:false});
 const run=extra=>advanceSupervisedInstructionLoop({root:r.run_root,policy:config.policy,runtime,...extra}),decision=(gate,disposition)=>({disposition,packet_digest:canonicalDigest(gate),reason:'Synthetic fresh host judgment.'});
 let s=await run({decision:decision(readRunJournal(r.run_root).state.gate,'approved')});assert.equal(s.status,'awaiting_change_approval',JSON.stringify(readRunJournal(r.run_root).events.at(-1)));
 assert.equal(s.pending_gate.packet.plan.candidate_binding.source_root,p.generator.candidateRoot);assert.equal(existsSync(join(p.stateRoot,'source-applications')),false);
 s=await run({decision:decision(s.pending_gate,'rejected')});assert.equal(s.status,'completed',JSON.stringify(readRunJournal(r.run_root).events.at(-1)));assert.equal(s.final.outcome,'change_rejected');assert.equal(existsSync(p.generator.candidateRoot),false);assert.equal(existsSync(f.c.source_root),true);
 const next=prepareNextNativeInstructionLoopConfiguration({root:r.run_root,profilePath:r.profile_path,configPath:r.config_path,outputRoot:join(f.base,'next'),id:'next-unapproved'}),np=json(next.profile_path);
 assert.equal(next.models_started,false);assert.equal(next.approval_carried_forward,false);assert.equal(np.generator.baselineSourceRoot,f.p.generator.baselineSourceRoot);assert.equal(np.generator.baselineRevision,f.c.baseline_revision);assert.equal(np.practical.baselineRoot,f.p.practical.baselineRoot);assert.equal(np.baselineEnvironmentObjectDigest,f.p.baselineEnvironmentObjectDigest);
 assert.notEqual(np.generator.registrySnapshotDigest,f.c.registry.snapshot_digest);assert.equal(np.generator.provider.kind,'codex');assert.equal(existsSync(next.run_root),false);assert.equal(np.policy.observation.previous.reference_evidence.standard_evaluation,'not_executed');assert.equal(np.policy.observation.previous.evaluation_summary,undefined);assert.equal(readRunJournal(f.root).previous,before);
});
test('CLI creates only a fresh reference gate and rejects execution authorization flags',t=>{
 const f=fixture(t),manifest=join(f.base,'reference-manifest.json');put(manifest,f.referenceEvidence);
 const args=[join(import.meta.dirname,'supervised-instruction-loop-cli.mjs'),'prepare-reference-evidence','--root',f.root,'--profile',f.profilePath,'--config',f.configPath,'--output-root',f.outputRoot,'--id',f.id,'--reference-evidence',manifest];
 const rejected=spawnSync(process.execPath,[...args,'--allow-model-calls'],{encoding:'utf8'});assert.equal(rejected.status,1);assert.equal(existsSync(f.outputRoot),false);
 const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stderr);const prepared=JSON.parse(result.stdout);assert.equal(prepared.models_started,false);assert.equal(readRunJournal(prepared.run_root).state.status,'awaiting_reference_review');
});

test('bridge rejects unsupported consumer installation before fresh allocation',t=>{
 const f=fixture(t),p=f.p;p.normal={target:join(f.base,'consumer-owner')};p.policy.normal_target=p.normal.target;put(f.profilePath,p);
 const config=createNativeInstructionLoopConfiguration(f.profilePath);put(f.configPath,config);const history=readRunJournal(f.root);history.state.policy=config.policy;appendRunJournal(f.root,'synthetic_consumer_profile',history.state);
 const before=readRunJournal(f.root).previous;assert.throws(()=>prepareReferenceEvidenceInstructionLoop(f),/source application or explicit result-only review/);assert.equal(existsSync(f.outputRoot),false);assert.equal(readRunJournal(f.root).previous,before);assert.equal(existsSync(p.normal.target),false);
});

test('case-insensitive ancestor aliases cannot allocate inside the original candidate',t=>{
 const f=fixture(t),alias=join(dirname(f.c.source_root),basename(f.c.source_root).toUpperCase());
 if(!existsSync(alias)){t.skip('filesystem is case-sensitive');return;}
 const before=readRunJournal(f.root).previous,inventory=fullInstructionInventory(f.c.source_root),outputRoot=join(alias,'bridge-output');
 assert.throws(()=>prepareReferenceEvidenceInstructionLoop({...f,outputRoot}),/canonical existing ancestor casing|overlaps/);
 assert.equal(existsSync(outputRoot),false);assert.equal(git(f.c.source_root,['status','--porcelain','--untracked-files=normal']),'');assert.deepEqual(fullInstructionInventory(f.c.source_root),inventory);assert.equal(readRunJournal(f.root).previous,before);
});

test('case aliases of missing reserved old roots are refused before allocation',t=>{
 const f=fixture(t),before=readRunJournal(f.root).previous;
 for(const reserved of [f.p.generator.stagingRoot,f.p.practical.root]){
  assert.equal(existsSync(reserved),false);const outputRoot=join(dirname(reserved),basename(reserved).toUpperCase());
  assert.throws(()=>prepareReferenceEvidenceInstructionLoop({...f,outputRoot}),/overlaps/);assert.equal(existsSync(outputRoot),false);assert.equal(existsSync(reserved),false);
 }
 assert.equal(readRunJournal(f.root).previous,before);assert.equal(git(f.c.source_root,['status','--porcelain','--untracked-files=normal']),'');
});

test('filesystem reference preparation retains candidate without Git or carried approvals',t=>{
 const f=fixture(t,{filesystem:true}),path=process.env.PATH;const bin=join(f.base,'no-git');mkdirSync(bin);symlinkSync('/usr/bin/gzip',join(bin,'gzip'));process.env.PATH=bin;t.after(()=>{process.env.PATH=path;});
 const r=prepareReferenceEvidenceInstructionLoop(f),h=readRunJournal(r.run_root),candidate=h.state.outputs.register;
 assert.equal(h.state.status,'awaiting_reference_review');assert.equal(h.state.evaluation_decision,undefined);
 assert.equal(candidate.source_revision,f.c.source_revision);assert.equal(existsSync(join(candidate.source_root,'.git')),false);
 assert.ok(readInstructionReferenceEvidence({root:r.run_root,state:h.state,verifySource:true}));
 assert.deepEqual(prepareReferenceEvidenceInstructionLoop(f),r);
});
