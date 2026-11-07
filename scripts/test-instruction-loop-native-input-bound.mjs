import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {executeNativeInstructionLoopStage} from './instruction-loop-native-host.mjs';

function fixture(t,paddingBytes){
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-native-input-bound-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const base=join(root,'baseline'),candidate=join(root,'candidate-full');mkdirSync(base);mkdirSync(candidate);
  const criteria=join(root,'criteria.json'),criteriaBytes=Buffer.from(JSON.stringify([{fixture_id:'demo',requirements:[{requirement_id:'required',max_points:1}]}]));
  writeFileSync(criteria,criteriaBytes);
  const path=join(root,'template.json'),bytes=Buffer.from(JSON.stringify({rows:[{fixture_id:'demo',public_inventory:[]}],padding:'x'.repeat(paddingBytes)}));writeFileSync(path,bytes);
  const profile={kind:'full_native_reference_loop_profile_v1',protectedRoot:root,stateRoot:join(root,'state'),storeRoot:join(root,'store'),
    generator:{storeRoot:join(root,'store'),candidateRoot:join(root,'candidate-source'),fullRoot:candidate,stagingRoot:join(root,'staging'),skills:['demo']},normal:{target:null},
    native:{executionKind:'real_codex',protectedRoot:root,root:join(root,'native'),workRoot:join(root,'work'),baselineFullRoot:base,templateConfig:path,templateConfigDigest:hash(bytes)},
    selection:{changedTags:[],limit:1},report:{criteria:{path:criteria,digest:hash(criteriaBytes)}}};
  const job={kind:'select',input:{observation:{goal:'Check bounded host configuration.'},candidate:{full_root:candidate},
    catalog:[{id:'demo',domain:'demo',tags:[],public_input_digest:canonicalDigest('intentionally mismatched public input')} ]}};
  return {root,profile,job};
}
test('native selection reads a pinned configuration above the CAS default before enforcing public input identity',async t=>{
  const {root,profile,job}=fixture(t,1100*1024);
  await assert.rejects(executeNativeInstructionLoopStage(profile,job),/selected public input differs from approved catalog/u);
  assert.equal(existsSync(profile.native.root),false);assert.equal(existsSync(join(root,'state/native-preparation-request.json')),false);
});
test('native selection retains the 16MiB bound for host configuration',async t=>{
  const {profile,job}=fixture(t,17*1024*1024);
  await assert.rejects(executeNativeInstructionLoopStage(profile,job),/bounded non-empty file/u);
  assert.equal(existsSync(profile.native.root),false);
});
test('native selection still rejects a mismatched pinned configuration digest',async t=>{
  const {profile,job}=fixture(t,1100*1024);profile.native.templateConfigDigest=hash(Buffer.from('different content'));
  await assert.rejects(executeNativeInstructionLoopStage(profile,job),/native host input drift/u);
  assert.equal(existsSync(profile.native.root),false);
});
test('prepared native trial configuration above the CAS default reaches the unchanged case guard before any control launch',async t=>{
  const {root,profile}=fixture(t,0);mkdirSync(profile.stateRoot);mkdirSync(profile.native.root);
  const selection={synthetic:'no execution binding'},row={trial_id:'not-launched',fixture_id:'prepared-not-approved'};
  writeFileSync(join(profile.stateRoot,'native-selection.json'),JSON.stringify(selection));
  writeFileSync(join(profile.native.root,'config.json'),JSON.stringify({rows:[row],padding:'x'.repeat(1100*1024)}));
  const job={kind:'trial',input:{evaluation_decision:{disposition:'approved'},selection,row:{id:row.trial_id,case:{id:'approved-different'}}}};
  await assert.rejects(executeNativeInstructionLoopStage(profile,job,{modelCallsAuthorized:true}),/prepared-not-approved/u);
  assert.equal(existsSync(join(profile.native.root,'release-1.json')),false);assert.equal(existsSync(join(root,'work')),false);
});
