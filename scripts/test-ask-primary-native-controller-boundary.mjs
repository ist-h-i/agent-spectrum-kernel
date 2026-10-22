// New TEST-only sealed join. Native transports are fake; the only executed
// child is the existing ordinary Node private evaluator runner. No authority,
// production qualification, key generation, model or candidate execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chmodSync,cpSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createSealedEvaluatorExecutionForTest,executeSealedEvaluatorAsyncForTest,readEvaluatorAuthorityAnchorFromFreeze} from './ask-benchmark-evaluator-boundary.mjs';
import {createPrimaryPerformanceExecutionForTest} from './ask-primary-evaluation-scope.mjs';
import {buildMnClientProbeV2EvaluatorSource,runMnClientProbeV2ForTest} from './ask-benchmark-mn-client-probe-v2.mjs';
import {buildMnFocusedControllerEvaluatorSourceV3,MN_FOCUSED_CONTROLLER_VERSION,inspectMnFocusedControllerRouteV3,runMnFocusedProbeV2ForTest} from './ask-benchmark-mn-focused-probe-v2.mjs';
import {comparisonHash} from './ask-user-comparison-prepare.mjs';

const ROOT=resolve(import.meta.dirname,'..'),FIXTURE='mn-client-compatibility-fix',BASE='benchmarks/fixtures/checkpoint-b2/mn-client-compatibility-fix';
const LEGACY=resolve(ROOT,'../primary24-runtime-v10-assets-1/private',FIXTURE,'hidden-evaluator.mjs');
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const json=path=>JSON.parse(readFileSync(path));
const git=(root,...args)=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8',timeout:60000,maxBuffer:16777216});assert.equal(r.status,0,r.stderr||r.error?.code);return r.stdout.trim();};
const writable=path=>{const s=lstatSync(path);if(s.isDirectory()){chmodSync(path,0o700);for(const n of readdirSync(path))writable(join(path,n));}else chmodSync(path,0o600);};
async function fixture(t,kind='client'){
  const fixtureId=kind==='client'?FIXTURE:'mn-focused-regression-test',legacyPath=resolve(ROOT,'../primary24-runtime-v10-assets-1/private',fixtureId,'hidden-evaluator.mjs');
  const parent=realpathSync(mkdtempSync(join(tmpdir(),'ask-native-controller-boundary-'))),root=join(parent,'repository');
  let completed=false;
  t.after(()=>{if(!completed){t.diagnostic('Retained synthetic failure fixture: '+parent);return;}writable(parent);rmSync(parent,{recursive:true,force:true});});
  const cloned=spawnSync('git',['clone','--no-hardlinks','--no-checkout',ROOT,root],{encoding:'utf8',timeout:60000,maxBuffer:16777216});assert.equal(cloned.status,0,cloned.stderr);git(root,'checkout','--detach',git(ROOT,'rev-parse','HEAD'));
  const changed=git(ROOT,'diff','--name-only','--diff-filter=ACM','HEAD','--','scripts').split('\n').filter(Boolean);
  const added=git(ROOT,'ls-files','--others','--exclude-standard','--','scripts').split('\n').filter(Boolean);
  const sources=[...new Set([...changed,...added])].sort();
  for(const path of sources)cpSync(join(ROOT,path),join(root,path));
  git(root,'add',...sources);git(root,'-c','user.name=ASK synthetic test','-c','user.email=ask-synthetic-test@example.invalid','-c','commit.gpgsign=false','commit','--allow-empty','-m','Synthetic native controller boundary source snapshot');
  const revision=git(root,'rev-parse','HEAD');assert.equal(existsSync(join(root,'.git/objects/info/alternates')),false);
  const sourcePins=sources.map(path=>({path,digest:digest(readFileSync(join(root,path)))}));
  const sourceRecord=JSON.stringify({kind:'synthetic_native_boundary_source',fixture:fixtureId,revision,sourcePins})+'\n';
  writeFileSync(join(parent,'source-snapshot.json'),sourceRecord,{flag:'wx',mode:0o600});
  if(process.env.ASK_NATIVE_BOUNDARY_PROOF_ROOT)writeFileSync(join(process.env.ASK_NATIVE_BOUNDARY_PROOF_ROOT,'source-snapshot-'+kind+'.json'),sourceRecord,{flag:'wx',mode:0o600});
  t.diagnostic('Synthetic source snapshot '+kind+': '+digest(sourceRecord));
  const privateRoot=join(parent,'private'),authorityRoot=join(parent,'authority');mkdirSync(privateRoot);mkdirSync(authorityRoot);
  cpSync(resolve(legacyPath,'..'),privateRoot,{recursive:true});writable(privateRoot);
  const legacySource=readFileSync(legacyPath),hiddenBody=Buffer.from(kind==='client'?buildMnClientProbeV2EvaluatorSource({legacySource}):buildMnFocusedControllerEvaluatorSourceV3({legacySource,probeVersion:MN_FOCUSED_CONTROLLER_VERSION}));
  writeFileSync(join(privateRoot,'hidden-evaluator.mjs'),hiddenBody);
  // The task-specific static writer closes the actual task metadata consumed
  // by this exact body. It executes no evaluator and grants no TEST admission.
  const authority=await import(pathToFileURL(join(root,'scripts/ask-benchmark-'+fixtureId+'-authority.mjs')).href);
  const writer=Object.entries(authority).find(([name])=>/^write.*ProductionAuthority$/u.test(name))[1];
  writer({root,privateRoot,evaluatorRevision:revision,generationDate:'2026-10-22',resourceAssetsOnly:true,resultProfileName:'requirement_scope_verification_v2'});
  const manifest=json(join(privateRoot,'private-evaluator-bundle.json')),hiddenAsset=manifest.asset_inventory.find(asset=>asset.role==='hidden_tests');
  const freezeManifestPath=join(root,'benchmarks/fixtures/checkpoint-b2',fixtureId,'scoring-input-freeze-manifest.json');
  const externalAuthorityAnchor=readEvaluatorAuthorityAnchorFromFreeze({root,freezeManifestPath,freezeManifestSourceDigest:comparisonHash(readFileSync(freezeManifestPath))});
  let number=0;
  const run=async(fakeLaunchers)=>{
    const index=++number,frozenWorkspace=join(parent,'frozen-'+index),candidateWorkspace=join(parent,'candidate-'+index),evaluationInputRoot=join(parent,'input-'+index),outputRoot=join(parent,'logs-'+index),privateEvaluationRoot=join(authorityRoot,'execution-'+index);
    for(const dir of [evaluationInputRoot,outputRoot,privateEvaluationRoot])mkdirSync(dir,{mode:0o700});
    const workspace=join(root,'benchmarks/fixtures/checkpoint-b2',fixtureId,'workspace');cpSync(workspace,frozenWorkspace,{recursive:true});cpSync(workspace,candidateWorkspace,{recursive:true});
    const candidatePath=join(candidateWorkspace,kind==='client'?'src/preferences.mjs':'test/session-key.test.mjs');writeFileSync(candidatePath,readFileSync(candidatePath,'utf8')+'\n// Synthetic edit; never evaluated as candidate code.\n');
    const lineage={run_instance_id:'11111111-1111-4111-8111-111111111111',case_id:'case-'+String(index).padStart(16,'0')+'-'+'0'.repeat(16),attempt:'0001',fixture_id:fixtureId,condition:'P'};
    // Unsupported evidence is truthful synthetic metadata, not a verification
    // success. Global verification stays manual even when the packet is pass.
    const normalized={normalized_result_digest:digest('synthetic-normalized-'+index),lineage,command_evidence:{capture_support:'unsupported',evidence_level:'unavailable',references:[],required_command_ids:[],required_alternative_groups:[],cwd_unverified_command_count:0}};
    const execution=createSealedEvaluatorExecutionForTest({root,privateEvaluationRoot,privateRoot,hiddenAsset,frozenWorkspace,candidateWorkspace,evaluationInputRoot,evaluationLineage:lineage,evaluatorRevision:revision,externalAuthorityAnchor});
    const control=createPrimaryPerformanceExecutionForTest({workerTimeoutMs:120000,outputRoot,nativeProbeBody:hiddenBody,nativeProbeFixture:fixtureId,signal:AbortSignal.timeout(300000)});
    try{
      const result=await executeSealedEvaluatorAsyncForTest({execution,externalAuthorityAnchor,repositoryRoot:root,normalized,timeout:120000,label:'synthetic client controller sealed join'}, {executionControl:control,...(fakeLaunchers?{nativeProbeLaunchers:fakeLaunchers}:{})});
      return {result,summary:control.summary(),outputRoot};
    }catch(error){error.syntheticSummary=control.summary();error.syntheticOutputRoot=outputRoot;throw error;}
    finally{await control.close();}
  };
  return {run,revision,sourcePins,hiddenBody,complete:()=>{completed=true;}};
}

test('full TEST sealed client consumes controller packet through owned ordinary Node workers; production null gate starts no worker',{skip:!existsSync(LEGACY)},async t=>{
  const f=await fixture(t);let fakeCalls=0;
  const fakeLaunchers={client:args=>{fakeCalls++;return runMnClientProbeV2ForTest(args,{platform:'darwin',signalProcess:()=>{throw Object.assign(new Error('synthetic group absent'),{code:'ESRCH'});},executeSession:async request=>{
    assert.equal(request.executable,'/usr/bin/sandbox-exec'); // inspected only
    request.onSpawn({pid:777});request.onOutput({stream:'stdout',chunk:Buffer.from(JSON.stringify({passed:true,modes:2,observations:[[true]]}))});return {pid:777,spawnObserved:true,exitCode:0,signal:null};
  }});},focused:async()=>{throw Error('unexpected synthetic focused route');}};
  const {result,summary,outputRoot}=await f.run(fakeLaunchers);
  assert.equal(fakeCalls,2);assert.deepEqual(result.firstFragment,result.secondFragment);assert.deepEqual(result.firstBytes,result.secondBytes);
  assert.equal(summary.worker_starts,2);assert.equal(summary.probe_starts,2);
  for(const fragment of [result.firstFragment,result.secondFragment]){
    assert.equal(fragment.evaluator_rerun.contributes_to_agent_verification_requirement,false);
    assert.equal(fragment.evaluator_rerun.results.length,1);assert.equal(fragment.evaluator_rerun.results[0].outcome,'succeeded');
    assert.equal(fragment.verification_correctness.state,'manual_review_required');assert.equal(fragment.scoring_ready,false);
  }
  const audits=readdirSync(outputRoot).filter(name=>/^native-round-\d+\.controller\.json$/u.test(name));assert.equal(audits.length,2);
  assert.equal(audits.every(name=>json(join(outputRoot,name)).qualification===false),true);
  await assert.rejects(f.run(),error=>{assert.match(error.message,/native_controller_qualification_unavailable/u);assert.equal(error.syntheticSummary.worker_attempts,0);assert.equal(error.syntheticSummary.probe_starts,0);return true;});
  f.complete();
});


test('full TEST sealed focused consumes adaptive controller observations in ordinary Node workers',{skip:!existsSync(resolve(ROOT,'../primary24-runtime-v10-assets-1/private/mn-focused-regression-test/hidden-evaluator.mjs'))},async t=>{
  const f=await fixture(t,'focused'),plan=inspectMnFocusedControllerRouteV3({bodySource:f.hiddenBody}).plan;
  const guardTargets=new Map();
  for(const step of plan.steps)for(const guard of step.requires){const fields=guardTargets.get(guard.step_id)??{};fields[guard.field]=guard.equals;guardTargets.set(guard.step_id,fields);}
  let fakeCalls=0;
  const fakeLaunchers={client:async()=>{throw Error('unexpected synthetic client route');},focused:args=>{
    fakeCalls++;const fields=guardTargets.get(args.step_id)??{status:'succeeded',assertion_failure:false};
    const result={status:fields.status,exit_code:fields.status==='failed'?1:0,observed:true,requests:1,assertion_failure:fields.assertion_failure??false,authenticated_mixed_boundary:true};
    return runMnFocusedProbeV2ForTest({...args,...args.privateNativeProbeContext},{platform:'darwin',signalProcess:()=>{throw Object.assign(new Error('synthetic group absent'),{code:'ESRCH'});},executeSession:async request=>{
      assert.equal(request.executable,'/synthetic/focused-parent');request.onSpawn({pid:778});request.onOutput({stream:'stdout',chunk:Buffer.from(JSON.stringify({type:'result',result})+'\n')});return {pid:778,spawnObserved:true,exitCode:0,signal:null};
    }});
  }};
  const {result,summary,outputRoot}=await f.run(fakeLaunchers);
  assert.equal(fakeCalls,plan.steps.length*2);assert.equal(summary.probe_starts,plan.steps.length*2);assert.equal(summary.worker_starts,2);
  assert.deepEqual(result.firstFragment,result.secondFragment);assert.deepEqual(result.firstBytes,result.secondBytes);
  const candidateTrialCount=plan.steps.filter(step=>step.test_selector==='test').length;
  assert.equal(result.firstFragment.evaluator_rerun.results.length,candidateTrialCount);
  assert.equal(result.firstFragment.evaluator_rerun.contributes_to_agent_verification_requirement,false);
  assert.equal(result.firstFragment.verification_correctness.state,'manual_review_required');assert.equal(result.firstFragment.scoring_ready,false);
  assert.equal(readdirSync(outputRoot).filter(name=>/^native-round-\d+\.controller\.json$/u.test(name)).length,2);
  f.complete();
});
