import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePackageInstructionLoop} from './ask-package-loop-prepare.mjs';
test('package loop preparation requires scope and explicit normal target before creating state',()=>{
  const base={workspaceRoot:'/does-not-exist',runId:'new',spec:{skills:['review'],provider:{},runtime:{},policy:{},selection:{},practical:{}}};
  assert.throws(()=>preparePackageInstructionLoop({...base,runId:'../escape'}),/portable/);
  assert.throws(()=>preparePackageInstructionLoop({...base,spec:{...base.spec,skills:['review','review']}}),/distinct/);
  assert.throws(()=>preparePackageInstructionLoop(base),/normal.target/);
  assert.throws(()=>preparePackageInstructionLoop({...base,spec:{...base.spec,normal:{target:null}}}),/lifecycle authority/);
  const assetAuthority={kind:'external_asset_lifecycle_authority',authority_id:'operator',authority_revision:'1',authority_evidence_digest:'sha256:'+ 'a'.repeat(64)};
  assert.throws(()=>preparePackageInstructionLoop({...base,spec:{...base.spec,normal:{target:null},assetAuthority}}),/observation.goal/);
  const codexSpec={...base.spec,normal:{target:null},assetAuthority,policy:{observation:{goal:'Preserve correctness.'}},provider:{kind:'codex',executable:'relative',model:null,timeoutMs:1000}};
  assert.throws(()=>preparePackageInstructionLoop({...base,spec:codexSpec}),/absolute authoring/);
  assert.throws(()=>preparePackageInstructionLoop({...base,spec:{...codexSpec,provider:{...codexSpec.provider,executable:process.execPath,timeoutMs:0}}}),/bounded authoring/);
});
