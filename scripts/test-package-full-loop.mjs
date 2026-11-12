import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,cpSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildNpmPackage} from './build-npm-package.mjs';
import {initializePackageWorkspace} from './ask-package-workspace.mjs';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';

test('packaged Full filesystem loop completes human gates, actual owner apply and next-cycle baseline without Git',{timeout:180000},async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-package-full-loop-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const repo=resolve(import.meta.dirname,'..');if(process.env.ASK_TEST_USE_BUILT_PACKAGE!=='1')buildNpmPackage(repo);
 const runtimeCopy=join(root,'runtime');cpSync(join(repo,'dist'),runtimeCopy,{recursive:true});
 const workspace=join(root,'workspace');initializePackageWorkspace(workspace,{runtimeRoot:runtimeCopy});
 const load=name=>import(pathToFileURL(join(workspace,'source','scripts',name)).href);
 const {preparePackageInstructionLoop}=await load('ask-package-loop-prepare.mjs');
 const {createFullPracticalInstructionLoopRuntime}=await load('instruction-loop-practical-runtime.mjs');
 const {advanceSupervisedInstructionLoop}=await load('supervised-instruction-loop.mjs');
 const {prepareNextNativeInstructionLoopConfiguration}=await load('instruction-loop-native-configuration.mjs');
 const target=join(root,'owner');mkdirSync(target);writeFileSync(join(target,'README.md'),'# Synthetic user project\n');
 const path=process.env.PATH;process.env.PATH=join(root,'no-git');mkdirSync(process.env.PATH);symlinkSync('/usr/bin/gzip',join(process.env.PATH,'gzip'));t.after(()=>{process.env.PATH=path;});
 const skill='controlled-implementation',skillPath=`skills/${skill}/SKILL.md`,baseline=readFileSync(join(workspace,'source',skillPath),'utf8');
 const response=join(root,'response.json');writeFileSync(response,JSON.stringify({changes:[{operation:'write',path:skillPath,text:baseline+'\n<!-- Synthetic lifecycle verification only. -->\n'}]}));
 const script=join(root,'check.mjs');writeFileSync(script,'console.log("synthetic local criterion passed");\n');
 const files=[{source:script,target:'check.mjs',digest:hash(readFileSync(script))}];
 const inputDigest=canonicalDigest(files.map(({target,digest})=>({target,digest})));
 const command={argv:[process.execPath,'check.mjs'],pins:[{path:script,digest:hash(readFileSync(script))}],timeout_ms:5000,model_calls:false};
 const context={cli_version:'node-fixture',model:null,reasoning:null,platform:'synthetic',global_context_ref:null};
 const spec={skills:[skill],provider:{kind:'fixture',response:{path:response,digest:hash(readFileSync(response))}},runtime:{cli_version:'node-fixture',model:'synthetic',ambient_config:'Unknown'},
  normal:{target},assetAuthority:{kind:'external_asset_lifecycle_authority',authority_id:'synthetic-owner',authority_revision:'fixture',authority_evidence_digest:canonicalDigest('synthetic explicit lifecycle authority')},
  policy:{kind:'reference_instruction_loop_v1',id:'package-cycle',observation:{goal:'Verify the standard package lifecycle; no model effectiveness claim.'},catalog:[{id:'public',public_input_digest:inputDigest,tags:['routing'],domain:'local'}],conditions:['baseline','candidate'],repetitions:1,max_trials:2},selection:{limit:1},
  practical:{evidence_kind:'synthetic',conditions:{baseline:{context,command,command_role:'check'},candidate:{context,command,command_role:'check'}},cases:[{id:'public',task_ref:'synthetic-task',input_ref:'synthetic-frozen-input',success_criteria_ref:'synthetic-local-check',files}],recovery:{max_extra_trials:0,max_retries_per_row:0,allow_reference:true,allow_exclusion:true,required_dimensions:['execution','duration']},global_context:{ask_presence:'unknown',change_status:'unknown'}}};
 const prepared=preparePackageInstructionLoop({workspaceRoot:workspace,spec,runId:'first'});
 assert.equal(prepared.models_started,false);assert.equal(prepared.approvals_recorded,false);
 const codexPrepared=preparePackageInstructionLoop({workspaceRoot:workspace,runId:'codex-preparation-only',spec:{...spec,provider:{kind:'codex',executable:process.execPath,model:'contract-only',timeoutMs:1000,sessionRoot:'/ignored'}}});
 const codexProfile=JSON.parse(readFileSync(codexPrepared.profile_path));
 assert.equal(codexProfile.generator.provider.sessionRoot,join(workspace,'state','loops','codex-preparation-only','generation-session'));
 assert.equal(existsSync(codexProfile.generator.provider.sessionRoot),false);
 assert.equal(codexPrepared.models_started,false);assert.equal(codexPrepared.approvals_recorded,false);
 const {fullGenerationInput}=await load('instruction-loop-full-candidate.mjs');
 assert.doesNotThrow(()=>fullGenerationInput(codexProfile.generator));

 const config=JSON.parse(readFileSync(prepared.config_path)),profile=JSON.parse(readFileSync(prepared.profile_path));
 assert.ok(config.runtime.source_pins.length>0);
 for(const pin of config.runtime.source_pins)assert.ok(pin.path.startsWith(join(workspace,'source')+'/'),`worker pin escaped package workspace: ${pin.path}`);
 const runtime=createFullPracticalInstructionLoopRuntime({definition:config.runtime});
 const run=extra=>advanceSupervisedInstructionLoop({root:prepared.root,policy:config.policy,runtime,...extra});
 let state=await run();assert.equal(state.status,'awaiting_evaluation_approval',JSON.stringify(state));
 assert.equal(existsSync(join(target,'.agents')),false);assert.equal(existsSync(profile.practical.root),false);
 state=await run({decision:{disposition:'approved',packet_digest:canonicalDigest(state.pending_gate),reason:'Synthetic human approval of selected cases.'}});
 while(state.status==='awaiting_ai_recovery')state=await run({assessment:{packet_digest:canonicalDigest(state.pending_recovery),action:'use',retry_scope:null,selection_basis:'practical_reference',reason:'Synthetic check and duration suffice for lifecycle verification.',used_dimensions:state.pending_recovery.available_dimensions,comparison_limits:['No model quality or complete token claim.']}});
 assert.equal(state.status,'awaiting_change_approval',JSON.stringify(state));assert.equal(existsSync(join(target,'.agents')),false);
 state=await run({decision:{disposition:'approved',packet_digest:canonicalDigest(state.pending_gate),reason:'Synthetic human approval of exact owner change.'}});
 assert.equal(state.status,'completed',JSON.stringify(state));
 assert.match(readFileSync(join(target,'.agents',skillPath),'utf8'),/Synthetic lifecycle verification/);
 assert.equal(existsSync(join(profile.generator.stagingRoot,'changes.json')),false);
 const next=prepareNextNativeInstructionLoopConfiguration({root:prepared.root,profilePath:prepared.profile_path,configPath:prepared.config_path,outputRoot:join(workspace,'next'),id:'package-next'});
 const nextProfile=JSON.parse(readFileSync(next.profile_path));
 assert.equal(nextProfile.generator.sourceKind,'filesystem_snapshot');assert.equal(nextProfile.generator.baselineSourceRoot,profile.generator.candidateRoot);
 assert.match(nextProfile.generator.baselineRevision,/^sha256:[a-f0-9]{64}$/u);assert.equal(next.models_started,false);
});
