import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
test('report settings cannot replace the actual approved retained-plan or execution identity',async t=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-native-host-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  t.mock.module('./instruction-loop-reference-report.mjs',{namedExports:{buildInstructionLoopReferenceReport:input=>({received:input})}});
  // Configuration imports may preload the host; instantiate this test's host
  // after its mock is installed, independently of that preparation import.
  const {executeNativeInstructionLoopStage}=await import('./instruction-loop-native-host.mjs?report-settings');
  const profile={kind:'full_native_reference_loop_profile_v1',stateRoot:join(root,'state'),protectedRoot:root,storeRoot:join(root,'store'),
    generator:{storeRoot:join(root,'store'),candidateRoot:join(root,'candidate'),fullRoot:join(root,'full'),stagingRoot:join(root,'staging')},normal:{target:join(root,'owner')},
    native:{protectedRoot:root,root:join(root,'native'),workRoot:join(root,'work'),executionKind:'real_codex'},
    report:{storeRoot:'wrong-store',planObjectDigest:'wrong-plan',executionKind:'wrong-kind',criteria:{path:'fixed-criteria',digest:'fixture'}}};
  const report=await executeNativeInstructionLoopStage(profile,{kind:'report',input:{selection:{execution_binding:{plan_object_digest:'actual-approved-plan'}},candidate:{source_revision:'actual-source'},trials:[]}});
  assert.equal(report.received.planObjectDigest,'actual-approved-plan');assert.equal(report.received.storeRoot,profile.storeRoot);assert.equal(report.received.executionKind,'real_codex');
});

test('explicitly unselected native owner supports reports but rejects every owner operation',async t=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-native-no-owner-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  t.mock.module('./instruction-loop-reference-report.mjs',{namedExports:{buildInstructionLoopReferenceReport:input=>({received:input})}});
  const {executeNativeInstructionLoopStage}=await import('./instruction-loop-native-host.mjs?no-owner');
  const profile={kind:'full_native_reference_loop_profile_v1',stateRoot:join(root,'state'),protectedRoot:root,storeRoot:join(root,'store'),
    generator:{storeRoot:join(root,'store'),candidateRoot:join(root,'candidate'),fullRoot:join(root,'full'),stagingRoot:join(root,'staging'),provider:{kind:'fixture'}},
    normal:{target:null},policy:{normal_target:null},native:{protectedRoot:root,root:join(root,'native'),workRoot:join(root,'work'),executionKind:'real_codex'},report:{}};
  const file=join(root,'profile.json');writeFileSync(file,JSON.stringify(profile));
  const config=createNativeInstructionLoopConfiguration(file);assert.equal(config.policy.normal_target,null);assert.ok(config.runtime.commands.report.pins.some(p=>p.path.endsWith('/practical-quality-observation.mjs')),'native-only feedback dependency is pinned');
  const report=await executeNativeInstructionLoopStage(profile,{kind:'report',input:{selection:{execution_binding:{plan_object_digest:'approved-plan'}},candidate:{source_revision:'actual-source'},trials:[]}});
  assert.equal(report.received.planObjectDigest,'approved-plan');
  for(const kind of ['plan','apply','restore','cleanup'])await assert.rejects(executeNativeInstructionLoopStage(profile,{kind,input:{}}),/normal owner target required/);
  assert.deepEqual((await import('node:fs')).readdirSync(root).sort(),['profile.json','state']);
});
