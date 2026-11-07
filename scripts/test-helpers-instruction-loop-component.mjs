import {writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {compiledMembershipFixture} from './test-helpers-instruction-environment-composition.mjs';
import {verifyAssetRegistry} from './asset-registry.mjs';
import {canonicalDigest} from './content-addressed-store.mjs';
import {captureInstructionEnvironment,exportInstructionEnvironment,instructionBytesDigest as hash} from './instruction-environment.mjs';
import {createComponentInstructionLoopConfiguration,createComponentInstructionLoopRuntime} from './instruction-loop-component-runtime.mjs';
import {advanceSupervisedInstructionLoop,inspectSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
export function componentLoopFixture(t,track='codex'){
  const f=compiledMembershipFixture(t,track),registry=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:f.challenger.snapshot_digest});
  const bundle=registry.assets.find(a=>a.record_digest===f.challenger.asset.record_digest),template=structuredClone(bundle.record);delete template.object_kind;
  const baseline=captureInstructionEnvironment({...f.options,registrySnapshotDigest:f.challenger.snapshot_digest,selectionObjectDigest:null,
    bindings:[{asset:f.challenger.asset,files:bundle.content.files.map(f=>({source:f.path,target:f.path}))}]});
  const target=join(f.root,'owner');exportInstructionEnvironment({...f.options,environmentObjectDigest:baseline.object_digest,outputRoot:target});
  writeFileSync(join(target,'README.md'),'Unrelated owner content.\n');
  const addition=structuredClone(template);addition.asset_type='prompt';addition.stable_id='ask.prompt.automatic';addition.derivation={kind:'root',parent:null,delta:null};addition.dependencies=[];addition.maintenance.rollback.target=null;
  addition.type_extension={kind:'prompt_template',adapter:f.options.adapter,entrypoint:'prompts/automatic.md',rendered_runtime_content:false};
  const script=join(f.root,'check.mjs');writeFileSync(script,'import {existsSync,readFileSync} from "node:fs";const candidate=existsSync("'+(track==='codex'?'.agents/prompts':'.claude/commands')+'/automatic.md");console.log(candidate?"new complete environment":"baseline environment");\n');
  const files=[{source:script,target:'check.mjs',digest:hash(readFileSync(script))}],input=canonicalDigest(files.map(({target,digest})=>({target,digest})));
  const command={argv:[process.execPath,'check.mjs'],pins:[{path:script,digest:hash(readFileSync(script))}],timeout_ms:5000,model_calls:false};
  const context={cli_version:'node-fixture',model:null,reasoning:null,platform:'synthetic',global_context_ref:null};
  const profile={kind:'component_practical_instruction_loop_profile_v1',protectedRoot:f.root,stateRoot:join(f.root,'state'),storeRoot:f.storeRoot,
    candidateRoot:join(f.root,'candidate'),registrySnapshotDigest:f.challenger.snapshot_digest,baselineEnvironmentObjectDigest:baseline.object_digest,
    adapter:f.options.adapter,runtime:f.options.runtime,supportPaths:['AGENTS.md'],environmentTrust:{trustedPortfolioAuthorityContexts:f.options.trustedPortfolioAuthorityContexts},
    normal:{target},bundleDescriptor:template,assetAuthority:{kind:'external_asset_lifecycle_authority',authority_id:'synthetic-owner',authority_revision:'fixture',authority_evidence_digest:canonicalDigest('synthetic lifecycle owner')},
    policy:{kind:'reference_instruction_loop_v1',id:'components-'+track,observation:{goal:'Create and revise concise instructions, excluding the obsolete prompt.'},catalog:[{id:'public',public_input_digest:input,tags:['routing'],domain:'local'}],conditions:['baseline','candidate'],repetitions:1,max_trials:2,normal_target:target,evaluation_mode:'practical_v1',formal_admission_implied:false},
    selection:{limit:1},candidate:{authoring:{editableStableIds:[f.rootAsset.stable_id],removableStableIds:[f.options.bindings[0].asset.stable_id],
      additions:[{descriptor:addition,files:[{source:'prompts/automatic.md',target:track==='codex'?'.agents/prompts/automatic.md':'.claude/commands/automatic.md'}]}],
      provider:{kind:'fixture',evidence_kind:'synthetic',response:{changes:[
        {operation:'revise',stable_id:f.rootAsset.stable_id,files:[{path:'skills/new-local/SKILL.md',text:'Check the actual boundary.\n'}]},
        {operation:'create',stable_id:addition.stable_id,files:[{path:'prompts/automatic.md',text:'Verify the applicable result.\n'}]},
        {operation:'exclude',stable_id:f.options.bindings[0].asset.stable_id}]}}}},
    practical:{root:join(f.root,'evaluation'),baselineRoot:join(f.root,'baseline'),evidence_kind:'synthetic',conditions:{baseline:{context,command,command_role:'check'},candidate:{context,command,command_role:'check'}},
      cases:[{id:'public',task_ref:'public-task',input_ref:'fixed-input',success_criteria_ref:'public-check',files}],recovery:{max_extra_trials:2,max_retries_per_row:1,allow_reference:true,allow_exclusion:true,required_dimensions:['execution','duration','quality']},global_context:{ask_presence:'unknown',change_status:'unknown'}}};
  const profilePath=join(f.root,'profile.json');writeFileSync(profilePath,JSON.stringify(profile));
  const config=createComponentInstructionLoopConfiguration(profilePath),configPath=join(f.root,'config.json');writeFileSync(configPath,JSON.stringify(config));
  const runtime=createComponentInstructionLoopRuntime({definition:config.runtime}),root=join(f.root,'run');
  return {...f,workspaceRoot:f.root,profile,profilePath,config,configPath,runtime,root,target,run:extra=>advanceSupervisedInstructionLoop({root,policy:config.policy,runtime,...extra})};
}
