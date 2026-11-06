// Public-only controller tests. Never imports or runs a challenge implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorkspaceController} from './public-workspace.mjs';
import {inventory} from './workspace-data.mjs';
import {planServiceBatches} from './service-batches.mjs';
const packageRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sharedRuntimeRoot=process.env.CEILING_V1_RUNTIME_ROOT??resolve(packageRoot,'../ceiling-v1');
const api=createWorkspaceController({packageRoot,sharedRuntimeRoot});
function temporary(fn){const dir=mkdtempSync(resolve(realpathSync(tmpdir()),'ceiling-public-metadata-'));try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
test('six public input manifests match public task and workspace bytes',()=>{
 assert.equal(api.candidates().length,6);const seals=api.sealInputs();assert.equal(seals.length,6);assert.ok(seals.every(x=>x.status==='unchanged'));
});
test('actual execution assets resolve full source bodies',()=>{
 const assets=api.executionAssets();assert.equal(assets.length,11);assert.equal(new Set(assets.map(a=>a.path)).size,11);
 for(const asset of assets){assert.ok(asset.bytes>20);assert.equal(readFileSync(api.executionAsset(asset.path)).length,asset.bytes);}
 const worker=readFileSync(api.executionAsset('runtime/scenario-worker.mjs'),'utf8');assert.match(worker,/executeScenario/);
 const leaf=readFileSync(api.executionAsset('runtime/scenario-service-batch.mjs'),'utf8');assert.match(leaf,/spawnSync/);assert.match(leaf,/--expose-gc/);
});
test('prepare protects public baseline and accepts only submission paths',()=>temporary(dir=>{
 const pkg=resolve(dir,'package');mkdirSync(resolve(pkg,'tasks'),{recursive:true});mkdirSync(resolve(pkg,'workspaces/example/src'),{recursive:true});mkdirSync(resolve(pkg,'workspaces/example/spec'),{recursive:true});
 writeFileSync(resolve(pkg,'catalog.json'),JSON.stringify({input_freeze_status:'authoring',candidates:[{id:'example',task_path:'tasks/example.md'}]}));
 writeFileSync(resolve(pkg,'tasks/example.md'),'contract');writeFileSync(resolve(pkg,'workspaces/example/src/module.mjs'),'source bytes, never executed');writeFileSync(resolve(pkg,'workspaces/example/spec/api.md'),'protected API');
 const fixture=createWorkspaceController({packageRoot:pkg,sharedRuntimeRoot});fixture.sealInputs({write:true});const workspace=resolve(dir,'candidate');fixture.prepare('example',workspace);assert.equal(fixture.verify('example',workspace).valid,true);
 writeFileSync(resolve(workspace,'src/module.mjs'),'changed source bytes');mkdirSync(resolve(workspace,'test/added/scenarios'),{recursive:true});writeFileSync(resolve(workspace,'test/added/scenarios/new.test.mjs'),'test bytes, never executed');writeFileSync(resolve(workspace,'RESULT.md'),'explanation');assert.equal(fixture.verify('example',workspace).valid,true);
 writeFileSync(resolve(workspace,'outside.txt'),'outside scope');assert.equal(fixture.verify('example',workspace).valid,false);rmSync(resolve(workspace,'outside.txt'));
 writeFileSync(resolve(workspace,'spec/api.md'),'modified contract');assert.equal(fixture.verify('example',workspace).valid,false);
}));
test('file inventory rejects symbolic links',()=>temporary(dir=>{
 const source=resolve(dir,'source.txt'),folder=resolve(dir,'linked');writeFileSync(source,'data');mkdirSync(folder);symlinkSync(source,resolve(folder,'alias'));assert.throws(()=>inventory(folder),/symlink/);
}));
test('normal groups contain at most six, resource groups exactly one',()=>{
 const normal=Array.from({length:13},(_,i)=>({id:'n'+i,program:{steps:[]}})),resource={id:'h',program:{resourceProfile:'example-profile',steps:[]}},caps={resourceProfiles:['example-profile']};
 const batches=planServiceBatches([normal[0],resource,...normal.slice(1)],caps);assert.deepEqual(batches.filter(b=>b.kind==='normal').map(b=>b.scenarios.length),[6,6,1]);assert.deepEqual(batches.filter(b=>b.kind==='resource').map(b=>b.scenarios.length),[1]);
 assert.throws(()=>planServiceBatches([resource],{}),/undeclared/);assert.throws(()=>planServiceBatches([normal[0],normal[0]],caps),/unique/);
});
