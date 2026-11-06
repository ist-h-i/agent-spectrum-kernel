import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {prepareGitBaseline} from './ask-user-comparison-prepare.mjs';
import {canonicalDigest} from './content-addressed-store.mjs';
import {fullInstructionInventory} from './instruction-loop-full-candidate.mjs';
import {bindMeasuredNormalOwnerSource,verifyNormalOwnerSourceBinding} from './instruction-loop-source-binding.mjs';
import {runNormalOwnerLoopOperation} from './instruction-loop-normal-owner-worker.mjs';
function fixture(t){
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-source-binding-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const source=join(root,'source'),target=join(root,'target'),staging=join(root,'staging'),marker=join(root,'MUST-NOT-EXECUTE');
  for(const p of [source,target,staging])mkdirSync(p);mkdirSync(join(source,'scripts'));mkdirSync(join(source,'skills/demo'),{recursive:true});
  writeFileSync(join(source,'skills/demo/SKILL.md'),'Measured Skill bytes.');
  writeFileSync(join(source,'scripts/ask-setup-apply-state.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'unsafe source imported');`);
  const revision=prepareGitBaseline(source),candidate={source_root:source,source_revision:revision};
  const operation=(kind='plan',input={candidate,target,report:{}})=>runNormalOwnerLoopOperation({sourceRoot:source,baselineSourceRoot:source,target,stagingRoot:staging,job:{kind,input}});
  return {root,source,target,staging,marker,candidate,operation};
}
test('wrong measured revision refuses before loading any candidate executable',async t=>{
  const f=fixture(t);await assert.rejects(f.operation('plan',{target:f.target,report:{},candidate:{...f.candidate,source_revision:'0'.repeat(40)}}),/revision drift/);assert.equal(existsSync(f.marker),false);
});
test('uncommitted measured Skill changes refuse before source import',async t=>{
  const f=fixture(t);writeFileSync(join(f.source,'skills/demo/SKILL.md'),'Unmeasured change.');await assert.rejects(f.operation(),/not clean/);assert.equal(existsSync(f.marker),false);
});
test('apply refuses an unbound historical normal plan before source import',async t=>{
  const f=fixture(t);await assert.rejects(f.operation('apply',{plan:{normal_plan:{source:{revision:f.candidate.source_revision}}},decision:{disposition:'approved'}}),/bound measured candidate identity required/);assert.equal(existsSync(f.marker),false);
});
test('owned manifest detects measured-file drift even if Git index hides it',t=>{
  const f=fixture(t),manifest={path:f.source,source_revision:f.candidate.source_revision,tracked_files:fullInstructionInventory(f.source)},file=join(f.root,'owned.json');writeFileSync(file,JSON.stringify(manifest));
  const candidate={...f.candidate,owned_version:{manifest:file,manifest_digest:canonicalDigest(manifest)}};
  const binding=bindMeasuredNormalOwnerSource({sourceRoot:f.source,candidate});assert.equal(verifyNormalOwnerSourceBinding({sourceRoot:f.source,binding}).source_revision,f.candidate.source_revision);
  assert.equal(spawnSync('git',['update-index','--assume-unchanged','skills/demo/SKILL.md'],{cwd:f.source}).status,0);
  writeFileSync(join(f.source,'skills/demo/SKILL.md'),'Hidden unmeasured bytes.');
  assert.throws(()=>verifyNormalOwnerSourceBinding({sourceRoot:f.source,binding}),/file inventory drift/);assert.equal(existsSync(f.marker),false);
});
test('candidate binding cannot be moved to another source root',t=>{
  const f=fixture(t),binding=bindMeasuredNormalOwnerSource({sourceRoot:f.source,candidate:f.candidate});assert.throws(()=>verifyNormalOwnerSourceBinding({sourceRoot:f.target,binding}),/root mismatch/);
});
