// Explicit bounded operation: routine completion advances to the next cycle,
// while each fresh case/application packet still needs its own human decision.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonicalDigest,readJsonFileStrict,readStableBytes,assertNoSymlinkPathSegments,writeCanonicalJsonNoReplace} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {readRunJournal,appendRunJournal,lockRunJournal} from './instruction-run-journal.mjs';
import {advanceSupervisedInstructionLoop,inspectSupervisedInstructionLoop} from './supervised-instruction-loop.mjs';
import {createConfiguredInstructionLoopRuntime} from './instruction-loop-runtime.mjs';
import {createNativeInstructionLoopConfiguration,buildNextNativeInstructionLoopProfile} from './instruction-loop-native-configuration.mjs';
import {buildNextComponentInstructionLoopProfile} from './instruction-loop-component-continuation.mjs';
const sourceNames=['instruction-loop-operation.mjs','instruction-loop-runtime.mjs','instruction-loop-native-configuration.mjs','instruction-loop-component-continuation.mjs'];
const filePin=path=>({path,digest:hash(readStableBytes(path,'operation source',16*1024*1024))});
function checkedConfig(path){const c=readJsonFileStrict(path,'operation cycle configuration',16*1024*1024);assert.equal(c.policy.runtime_digest,canonicalDigest(c.runtime));return c;}
function record(root,cycle,journalDigest){return {root,run_id:cycle.run_id,outcome:cycle.final.outcome,journal_digest:journalDigest,
  ...(cycle.result_disposition?{result_disposition:cycle.result_disposition}:{}),
  candidate_digest:canonicalDigest(cycle.final.candidate),report_digest:cycle.report?canonicalDigest(cycle.report):null,
  resources_all_attempts:cycle.report?.resources_all_attempts??null,generation_observation:cycle.final.candidate.execution??null};}
function summary(s,cycle){
  const records=[...s.records,...(cycle.status==='completed'?[record(s.current.root,cycle,readRunJournal(s.current.root).previous)]:[])];
  const dimensions=[...new Set(records.flatMap(r=>Object.keys(r.resources_all_attempts??{})))];
  const resources=Object.fromEntries(dimensions.map(key=>{
    const rows=records.map(r=>r.resources_all_attempts?.[key]).filter(Boolean),known=rows.filter(r=>r.known_total!==null);
    return [key,{known_total:known.length?known.reduce((sum,r)=>sum+r.known_total,0):null,
      observed_count:rows.reduce((sum,r)=>sum+r.observed_count,0),unknown_count:rows.reduce((sum,r)=>sum+r.unknown_count,0)}];
  }));
  return {operation_status:s.status,cycle_number:s.records.length+1,max_cycles:s.binding.max_cycles,current_cycle:s.current,completed_cycles:s.records,
    operation_report:{cycles:records,all_attempt_resources:resources,quality_pooled_across_cycles:false,
      complete_cost:null,assessment_and_grading_overhead:'See each preserved report; unavailable costs remain Unknown.'},...cycle};
}
export function inspectInstructionLoopOperation(root){
  root=resolve(root);assertNoSymlinkPathSegments(root,'operation journal');const s=readRunJournal(root).state;assert.ok(s,'operation not initialized');
  return summary(s,inspectSupervisedInstructionLoop(s.current.root));
}
export async function advanceInstructionLoopOperation({root,profilePath,configPath,maxCycles,modelCallsAuthorized=false,decision=null,assessment=null,feedback=null,requestRestore=false,reportRevision=null}){
  root=resolve(root);profilePath=resolve(profilePath);configPath=resolve(configPath);
  assert.ok(Number.isSafeInteger(maxCycles)&&maxCycles>=1&&maxCycles<=10,'explicit operation budget of 1..10 cycles required');
  assertNoSymlinkPathSegments(root,'operation root',{allowMissingLeaf:true});
  const initial=checkedConfig(configPath),profile=readJsonFileStrict(profilePath,'operation initial profile',16*1024*1024);
  const profileDigest=filePin(profilePath).digest;
  assert.ok(initial.runtime.profile_path?initial.runtime.profile_path===profilePath&&initial.runtime.profile_digest===profileDigest:
    Object.values(initial.runtime.commands??{}).length===10&&Object.values(initial.runtime.commands).every(c=>c.pins.some(pin=>pin.path===profilePath&&pin.digest===profileDigest)),
    'initial operation profile is not pinned by its runtime');
  assert.equal(canonicalDigest(initial.policy),canonicalDigest({...profile.policy,runtime_digest:canonicalDigest(initial.runtime)}),'initial operation policy/profile drift');
  for(const pin of [...(initial.runtime.source_pins??[]),...Object.values(initial.runtime.commands??{}).flatMap(c=>c.pins)])
    assert.equal(filePin(pin.path).digest,pin.digest,'original operation runtime source drift');
  assert.ok(root.startsWith(profile.protectedRoot+'/'),'operation must stay inside its configured protected root');
  const protectedPaths=[profile.stateRoot,profile.storeRoot,profile.candidateRoot,profile.generator?.baselineSourceRoot,profile.generator?.candidateRoot,
    profile.generator?.fullRoot,profile.generator?.stagingRoot,profile.generator?.provider.sessionRoot,
    profile.practical?.root,profile.practical?.baselineRoot,profile.native?.root,profile.native?.workRoot,profile.native?.baselineFullRoot,
    ...(profile.normal.target===null?[]:[profile.normal.target])].filter(Boolean);
  for(const path of protectedPaths)assert.ok(root!==path&&!root.startsWith(path+'/')&&!path.startsWith(root+'/'),'operation overlaps source, state or owner');
  if(!existsSync(root))mkdirSync(root,{mode:0o700});const unlock=lockRunJournal(root);
  try{
    const originalBinding={profile_path:profilePath,profile_digest:filePin(profilePath).digest,config_path:configPath,config_digest:canonicalDigest(initial),max_cycles:maxCycles};
    let s=readRunJournal(root).state;
    if(!s){s={binding:{...originalBinding,source_pins:sourceNames.map(name=>filePin(join(import.meta.dirname,name)))},status:'advancing',records:[],
      current:{root:join(root,'first-run'),profile_path:profilePath,profile_digest:profileDigest,config_path:configPath,config_digest:canonicalDigest(initial)},preparation:null};appendRunJournal(root,'operation_created',s);}
    const {source_pins,...binding}=s.binding;assert.equal(canonicalDigest(binding),canonicalDigest(originalBinding),'operation configuration/budget drift');
    for(const pin of source_pins)assert.equal(filePin(pin.path).digest,pin.digest,'operation implementation drift');
    for(;;){
      if(s.preparation){
        const planned=s.preparation,profileFile=join(planned.output_root,'profile.json'),configFile=join(planned.output_root,'config.json');
        assert.equal(readRunJournal(s.current.root).previous,planned.previous_journal_digest,'completed cycle changed after next-cycle reservation');
        assert.equal(canonicalDigest(planned.profile),planned.profile_digest,'reserved profile intent drift');
        assert.equal(planned.profile.policy.observation.previous.journal_digest,planned.previous_journal_digest);
        assertNoSymlinkPathSegments(planned.output_root,'reserved preparation root',{allowMissingLeaf:true});
        if(!existsSync(planned.output_root))mkdirSync(planned.output_root,{mode:0o700});
        if(!existsSync(configFile))assert.ok(readdirSync(planned.output_root).every(name=>name==='profile.json'||/^\.(?:profile|config)\.json\.staging-[a-f0-9-]{36}$/u.test(name)),
          'unexpected files in incomplete preparation; preserve for inspection');
        // Atomic, no-replace writes may safely finish an empty/profile-only
        // preparation. Published differing content is never overwritten.
        writeCanonicalJsonNoReplace({outputPath:profileFile,artifact:planned.profile,label:'reserved cycle profile',maximumBytes:16*1024*1024});
        const expected=createNativeInstructionLoopConfiguration(profileFile);
        if(existsSync(configFile))assert.equal(canonicalDigest(checkedConfig(configFile)),canonicalDigest(expected),'reserved next-cycle runtime/configuration drift');
        else writeCanonicalJsonNoReplace({outputPath:configFile,artifact:expected,label:'reserved cycle configuration',maximumBytes:16*1024*1024});
        createConfiguredInstructionLoopRuntime({definition:expected.runtime,modelCallsAuthorized});
        const next={profile_path:profileFile,config_path:configFile,run_root:join(planned.output_root,'run')};
        const prior=inspectSupervisedInstructionLoop(s.current.root);assert.equal(prior.status,'completed');
        s.records.push(record(s.current.root,prior,planned.previous_journal_digest));
        s.current={root:next.run_root,profile_path:next.profile_path,profile_digest:filePin(next.profile_path).digest,
          config_path:next.config_path,config_digest:canonicalDigest(checkedConfig(next.config_path))};s.preparation=null;
        appendRunJournal(root,'next_cycle_prepared',s);
      }
      const config=checkedConfig(s.current.config_path);
      assert.equal(canonicalDigest(config),s.current.config_digest,'operation current configuration drift');
      assert.equal(filePin(s.current.profile_path).digest,s.current.profile_digest,'operation current profile drift');
      if(s.status==='completed'&&!requestRestore){assert.ok(!decision&&!assessment&&!reportRevision,'completed operation has no pending judgment');return summary(s,inspectSupervisedInstructionLoop(s.current.root));}
      const runtime=createConfiguredInstructionLoopRuntime({definition:config.runtime,modelCallsAuthorized});
      const cycle=await advanceSupervisedInstructionLoop({root:s.current.root,policy:config.policy,runtime,decision,assessment,requestRestore,reportRevision});
      decision=null;assessment=null;requestRestore=false;reportRevision=null;
      if(cycle.status!=='completed'){s.status=cycle.status;appendRunJournal(root,'cycle_paused',s);return summary(s,cycle);}
      if(cycle.result_disposition?.disposition==='discarded'||cycle.final.outcome==='no_change'||s.records.length+1>=maxCycles||cycle.final.outcome==='restored'){
        s.status='completed';appendRunJournal(root,'operation_completed',s);return summary(s,cycle);
      }
      const index=s.records.length+2,journal=readRunJournal(s.current.root);
      s.status='advancing';s.preparation={output_root:join(root,'cycle-'+String(index).padStart(3,'0')),
        id:initial.policy.id.slice(0,70)+'.cycle-'+index,previous_journal_digest:journal.previous,feedback};
      const old=readJsonFileStrict(s.current.profile_path,'completed operation profile',16*1024*1024);
      const build=old.kind==='component_practical_instruction_loop_profile_v1'?buildNextComponentInstructionLoopProfile:buildNextNativeInstructionLoopProfile;
      s.preparation.profile=build({root:s.current.root,profilePath:s.current.profile_path,configPath:s.current.config_path,
        outputRoot:s.preparation.output_root,id:s.preparation.id,feedback}).profile;
      s.preparation.profile_digest=canonicalDigest(s.preparation.profile);
      appendRunJournal(root,'next_cycle_reserved',s);
    }
  }finally{unlock();}
}
