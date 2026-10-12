// Synthetic saved records only. No controller start or process observer is used.
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { comparisonExecutionPolicy, comparisonHash, inventoryUserTree } from './ask-user-comparison-prepare.mjs';
import { buildPrimaryFixtureRecipe } from './ask-primary-fixture-recipe.mjs';
import { buildAgentsBlock } from './installer-lifecycle.mjs';
import { principlesCapability, renderKernelPrinciples } from './kernel-principles.mjs';
import { kernelPrinciplesV2FixtureDescriptor, principlesV2Capability, renderKernelPrinciplesV2 } from './kernel-principles-v2.mjs';
import { primaryProfileForKernel } from './ask-primary-evaluation-profile.mjs';
import { renderCommandEvent } from './ask-benchmark-command-evidence.mjs';
const hash = comparisonHash, raw = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export function syntheticPrimarySource(t, { scenario = 'completed', command = 'pass', fixtureId = 'mn-build-option-update', mutate = false, kernelCondition = 'kernel_principles_v1' } = {}) {
  const profile = primaryProfileForKernel(kernelCondition), CONDITIONS = profile.conditions, v2 = kernelCondition === 'kernel_principles_v2';
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'primary-producer-')));
  t.after(() => {
    // Existing terminal candidate helper seals owned files0444/dirs0555.
    // Restore this fixture's modes before removal; there is no async writer.
    const unseal = path => { const stat=lstatSync(path);if(stat.isSymbolicLink())return;
      if(stat.isDirectory()){chmodSync(path,0o700);for(const name of readdirSync(path))unseal(join(path,name));}else chmodSync(path,0o600); };
    unseal(root);rmSync(root,{recursive:true,force:true});
  });
  const write = (path, bytes) => { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); writeFileSync(path, bytes, { mode: 0o600 }); };
  const base = new URL(`../benchmarks/fixtures/checkpoint-b2/${fixtureId}/`, import.meta.url), recipe = buildPrimaryFixtureRecipe(fixtureId);
  const inputRaw = readFileSync(new URL('input-manifest.json', base)), input = JSON.parse(inputRaw), comparison = join(root, 'comparison'), publicRoot = join(root, 'public');
  const source = readFileSync(new URL('../AGENTS.md', import.meta.url)), renderer = readFileSync(new URL(v2 ? './kernel-principles-v2.mjs' : './kernel-principles.mjs', import.meta.url)), generated = v2 ? renderKernelPrinciplesV2(source) : renderKernelPrinciples(source);
  const metadata = v2 ? readFileSync(new URL('metadata.json', base)) : null;
  const descriptor = v2 ? kernelPrinciplesV2FixtureDescriptor(fixtureId, readFileSync(new URL('task.md', base)), metadata) : null;
  const closure = v2 ? ['scripts/kernel-principles-v2.mjs','scripts/kernel-principles-candidate-v2.mjs','scripts/kernel-principles.mjs'].map(source_path => {
    const bytes = readFileSync(new URL(`../${source_path}`, import.meta.url)), path = `control/kernel-principles-renderer-closure/${source_path.split('/').at(-1)}`;
    write(join(comparison, path), bytes); return { source_path, path, digest: hash(bytes) };
  }) : [];
  if (v2) write(join(comparison, 'control/kernel-principles-task-metadata.json'), metadata);
  write(join(comparison,'control/kernel-principles-source.md'),source); write(join(comparison,'control/kernel-principles-renderer.mjs'),renderer);
  const arms = {};
  for (const condition of CONDITIONS) {
    const baselinePath = `control/baselines/${condition}`;
    for (const file of input.fixtures[fixtureId].files) {
      const content = readFileSync(new URL(file.path, base)); write(join(comparison,baselinePath,file.path),content);
      if (condition === 'plain') write(join(publicRoot,file.path),content);
    }
    const assets = [];
    if (condition === kernelCondition) { const agents = Buffer.from(buildAgentsBlock(generated.body)); write(join(comparison,baselinePath,'AGENTS.md'),agents); }
    const inventory = inventoryUserTree(join(comparison,baselinePath));
    if (condition === kernelCondition) assets.push({path:'AGENTS.md',...inventory['AGENTS.md'],kind:'generated_principles_with_preserved_custom_instructions',origin:'canonical_principles_projection'});
    arms[condition] = {path:`arms/${condition}`,baseline_path:baselinePath,baseline_inventory:inventory,configuration:{},assets,
      capability:condition === kernelCondition ? (v2 ? principlesV2Capability(descriptor) : principlesCapability(source,generated.body,generated.generation,recipe.runner_task_class)) : {status:'available'},
      ...(condition === kernelCondition ? {label:'K-principles'} : {})};
  }
  const plan = {kind:'ask_user_comparison_plan_v1',root:comparison,run_id:`fake-primary-${fixtureId}`, config:{evidence_kind:'synthetic',kernel_condition:kernelCondition,task_class:recipe.runner_task_class,
    global_ask_presence:'unknown',cli_version:'fake-not-launched',model:null,reasoning:null,timeout_ms:100,verification_timeout_ms:100,overall_timeout_ms:1000,token_budget:null},
    policy:comparisonExecutionPolicy('single_shot_v1'),execution_protocol:{resume:'forbidden'}, kernel_definition:{canonical_source:{path:'control/kernel-principles-source.md',digest:hash(source)},renderer_source:{path:'control/kernel-principles-renderer.mjs',digest:hash(renderer)},source_commit:'f'.repeat(40),generation:generated.generation,...(v2 ? { assessment:descriptor,task_metadata:{path:'control/kernel-principles-task-metadata.json',digest:hash(metadata)},renderer_closure:closure } : {})},
    source_installation:{preserved_custom_agents_digest:hash('')},source:{commit:'f'.repeat(40),digest:hash('fake source'),inventory:inventoryUserTree(publicRoot)},
    input:{path:'inputs/prompt.md',digest:hash('fake prompt')},task:{path:'control/task.md',digest:inventoryUserTree(publicRoot)['task.md'].digest},
    verification:{path:'control/verification.json',digest:hash(raw(recipe)),recipe,reporter:{path:'control/node-test-reporter.mjs',format:'ask_node_summary_jsonl_v1',digest:hash('fake reporter')}},mutable_paths:recipe.mutable_paths,arms,unknowns:[],condition_differences:[]};
  write(join(comparison,'control/task.md'),readFileSync(new URL('task.md',base))); write(join(comparison,'inputs/prompt.md'),'fake prompt');
  write(join(comparison,'control/verification.json'),raw(recipe)); write(join(comparison,'control/node-test-reporter.mjs'),'fake reporter');
  const planDigest=hash(raw(plan)); write(join(comparison,'control/plan.json'),raw(plan)); write(join(comparison,'control/plan.digest'),planDigest);
  const publicInputPath=join(root,'input.json'); write(publicInputPath,inputRaw);
  const reference=JSON.parse(readFileSync(new URL('evaluator-reference.json',base)));
  const block={root:comparison,fixture_id:fixtureId,run_id:plan.run_id,plan_digest:planDigest,source_digest:plan.source.digest,task_digest:plan.task.digest,verification_digest:plan.verification.digest,
    public_input_root:publicRoot,input_manifest:{path:publicInputPath,digest:hash(inputRaw)},grading:{binding:{fixture_id:fixtureId,input_manifest_digest:hash(inputRaw),evaluator_bundle_digest:reference.evaluator_bundle_digest,
      scoring_input_freeze_digest:hash(readFileSync(new URL('scoring-input-freeze-manifest.json',base))),profile_id:profile.id}}};
  if(scenario==='pending')return{root,block,plan};
  const contract=JSON.parse(readFileSync(new URL('verification-command-contract.json',base))),terminalDigests={};
  for(const condition of CONDITIONS){
    const folder=join(comparison,'control/slots',condition),baseline=arms[condition].baseline_inventory;
    const events=[];
    for(const [index,c]of contract.commands.entries())if(command!=='missing'){
      const status=command==='failed'?'failed':'completed',exit=command==='failed'?5:0,id=`fake-${index}`;
      events.push({type:'item.started',item:{id,type:'command_execution',command:renderCommandEvent(c),status:'in_progress'}},
        {type:'item.completed',item:{id,type:'command_execution',command:renderCommandEvent(c),status,exit_code:exit,aggregated_output:'fake model command output'}});
    }
    events.push({type:'turn.completed',usage:{input_tokens:20,output_tokens:5}});
    const artifacts={},save=(name,content)=>{const b=Buffer.isBuffer(content)?content:typeof content==='string'?Buffer.from(content):raw(content);write(join(folder,name),b);artifacts[name]=hash(b);};
    save('stdout.jsonl',Buffer.from(events.map(event=>JSON.stringify(event)).join('\n')+'\n'));save('stderr.log','');save('last-message.txt','synthetic final output');
    const after=structuredClone(baseline),changedPath=mutate?recipe.mutable_paths.find(path=>Object.hasOwn(baseline,path)):null;
    if(mutate){if(!changedPath)throw new Error('fake mutable file missing');const content=Buffer.concat([readFileSync(join(comparison,arms[condition].baseline_path,changedPath)),Buffer.from('\nsynthetic offline delta\n')]);
      write(join(comparison,'control/patch-workspaces',condition,changedPath),content);after[changedPath]={...baseline[changedPath],bytes:content.length,digest:hash(content)};}
    const scope={status:'pass',changed_paths:changedPath?[changedPath]:[],violations:[]};save('changes.json',{before:baseline,after,scope});
    const checks=recipe.checks.map((c,index)=>{
      const cwd=join(comparison,'verification',condition,c.cwd),request={run_id:plan.run_id,plan_digest:planDigest,condition,evidence_kind:'synthetic',command_id:c.id,command_contract_digest:c.contract_command_digest,
        fixture_input_digest:recipe.input_manifest_digest,observation_origin:'controller_native_fixture_command',executable:c.executable,argv:c.argv,cwd};
      save(`verification-${index}.request.json`,request);save(`verification-${index}.spawn.json`,{...request,pid:1});
      const logs=[`verification-${index}.stdout.log`,`verification-${index}.stderr.log`,`verification-${index}.log`];for(const name of logs)save(name,'synthetic native check');
      return{id:c.id,command_id:c.id,command_contract_digest:c.contract_command_digest,fixture_input_digest:recipe.input_manifest_digest,verification_kind:'native_public_command',command:[c.executable,...c.argv],cwd,logs,
        log_metadata:{full_evidence_available:true},test_result:scenario==='verification_failed'?'fail':'pass',status:scenario==='verification_failed'?'fail':'pass',process_completed:true,spawn_observed:true,exit_code:scenario==='verification_failed'?2:0};});
    const terminal={run_id:plan.run_id,plan_digest:planDigest,condition,evidence_kind:'synthetic',state:['failed','verification_failed','unknown_exit'].includes(scenario)?'verification_failed':'completed',outcome:'unknown',reason:'synthetic saved terminal',artifacts,scope,
      launch_requested:true,spawn_observed:true,process_completed:true,unresolved_child:false,exit_code:scenario==='failed'?9:scenario==='unknown_exit'?null:0,metrics:{duration_ms:5,input_tokens:20,output_tokens:5,cached_tokens:null},usage_lower_bound:{known_tokens:25,complete:true},cost:null,
      verification:{checks,execution_origin:'synthetic_injected_verifier'}};
    write(join(folder,'result.json'),raw(terminal));terminalDigests[condition]=hash(raw(terminal));write(join(folder,'result.digest'),terminalDigests[condition]);
  }
  const pair=(path,value)=>{write(join(path,'record.json'),raw(value));write(join(path,'record.digest'),hash(raw(value)));return hash(raw(value));};
  write(join(comparison,'control/start.json'),raw({run_id:plan.run_id,plan_digest:planDigest,evidence_kind:'synthetic'}));
  const owner={kind:'ask_comparison_owner_v1',run_id:plan.run_id,plan_digest:planDigest,sequence:1,lease_id:'fake-lease'};
  const ownerDigest=pair(join(comparison,'control/leases/00000001/owner'),owner);
  pair(join(comparison,'control/leases/00000001/release'),{kind:'ask_comparison_owner_release_v1',run_id:plan.run_id,plan_digest:planDigest,owner_digest:ownerDigest,lease_id:'fake-lease'});
  pair(join(comparison,'control/history/00000001'),{kind:'ask_comparison_execution_event_v1',run_id:plan.run_id,plan_digest:planDigest,sequence:1,previous_digest:null,at_ms:100,started_at_ms:1,deadline_at_ms:1000,lease_id:'fake-lease',event:'synthetic_terminal',
    slots:Object.fromEntries(CONDITIONS.map(condition=>[condition,{phase:'terminal',attempts:1,terminal_digest:terminalDigests[condition]}]))});
  return{root,block,plan};
}
