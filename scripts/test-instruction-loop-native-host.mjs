import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('report settings cannot replace the actual approved retained-plan or execution identity',async t=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-native-host-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  t.mock.module('./instruction-loop-reference-report.mjs',{namedExports:{buildInstructionLoopReferenceReport:input=>({received:input})}});
  const {executeNativeInstructionLoopStage}=await import('./instruction-loop-native-host.mjs');
  const profile={kind:'full_native_reference_loop_profile_v1',stateRoot:join(root,'state'),protectedRoot:root,storeRoot:join(root,'store'),
    generator:{storeRoot:join(root,'store'),candidateRoot:join(root,'candidate'),fullRoot:join(root,'full'),stagingRoot:join(root,'staging')},normal:{target:join(root,'owner')},
    native:{protectedRoot:root,root:join(root,'native'),workRoot:join(root,'work'),executionKind:'real_codex'},
    report:{storeRoot:'wrong-store',planObjectDigest:'wrong-plan',executionKind:'wrong-kind',criteria:{path:'fixed-criteria',digest:'fixture'}}};
  const report=await executeNativeInstructionLoopStage(profile,{kind:'report',input:{selection:{execution_binding:{plan_object_digest:'actual-approved-plan'}},candidate:{source_revision:'actual-source'},trials:[]}});
  assert.equal(report.received.planObjectDigest,'actual-approved-plan');assert.equal(report.received.storeRoot,profile.storeRoot);assert.equal(report.received.executionKind,'real_codex');
});
