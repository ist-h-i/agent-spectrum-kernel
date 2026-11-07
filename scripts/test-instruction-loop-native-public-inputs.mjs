import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
const module=()=>import('./instruction-loop-native-public-inputs.mjs');
function fixture(t,prefix=''){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-native-public-binding-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const sourceName=prefix?'public/a.txt':'workspace/public/a.txt';mkdirSync(join(root,...sourceName.split('/').slice(0,-1)),{recursive:true});writeFileSync(join(root,sourceName),'unchanged');writeFileSync(join(root,'wrapper.md'),'existing wrapper');
 const package_inventory=[{path:sourceName,bytes:9,sha256:hash(Buffer.from('unchanged')).slice(7),mode:0o644}];
 const delivery=[{path:prefix+sourceName,bytes:9,sha256:hash(Buffer.from('unchanged')),mode:0o444},...(prefix?[{path:'task.md',bytes:16,sha256:hash(Buffer.from('existing wrapper')),mode:0o444}]:[])];
 const input={kind:'native_public_input_bindings_v1',cases:[{case_id:'c',source_root:root,package_inventory,path_prefix:prefix,extra_files:prefix?[{target:'task.md',source:join(root,'wrapper.md'),digest:hash(Buffer.from('existing wrapper'))}]:[]}]};
 return {root,sourceName,input,catalog:[{id:'c',public_input_digest:canonicalDigest(package_inventory)}],selectedCaseIds:['c'],template:{rows:[{fixture_id:'c',public_inventory:delivery},{fixture_id:'c',public_inventory:structuredClone(delivery)}]}};
}
for(const prefix of ['', 'workspace/'])test(`package and delivery identities remain distinct with explicit prefix ${prefix}`,async t=>{
 const f=fixture(t,prefix),{bindNativePublicInputs}=await module(),bound=bindNativePublicInputs(f);
 assert.equal(bound.bindings[0].package_public_input_digest,f.catalog[0].public_input_digest);
 assert.equal(bound.bindings[0].delivered_public_input_digest,canonicalDigest(f.template.rows[0].public_inventory));
 assert.notEqual(bound.bindings[0].package_public_input_digest,bound.bindings[0].delivered_public_input_digest);
 assert.equal(bound.bindings[0].mode_changes.length,1);assert.equal(bound.delivery_sources.c.length,prefix?2:1);
 assert.equal(bound.models_started,false);
});
test('bindings reject package identity, altered bytes and delivery disagreement without rewriting either identity',async t=>{
 const {bindNativePublicInputs}=await module();
 for(const mutation of [f=>f.catalog[0].public_input_digest=canonicalDigest('different'),f=>writeFileSync(join(f.root,'public/a.txt'),'different'),f=>f.template.rows[1].public_inventory[0].mode=0o600,f=>f.input.cases[0].extra_files=[],f=>f.input.cases[0].package_inventory.push({...f.input.cases[0].package_inventory[0]})]){
  const f=fixture(t,'workspace/');mutation(f);assert.throws(()=>bindNativePublicInputs(f));
 }
});
test('bindings refuse source symlinks and traversal before copying',async t=>{
 const {bindNativePublicInputs}=await module(),f=fixture(t);
 rmSync(join(f.root,f.sourceName));symlinkSync(join(f.root,'wrapper.md'),join(f.root,f.sourceName));assert.throws(()=>bindNativePublicInputs(f));
 f.input.cases[0].package_inventory[0].path='../outside';f.catalog[0].public_input_digest=canonicalDigest(f.input.cases[0].package_inventory);assert.throws(()=>bindNativePublicInputs(f));
});
test('native preparation copies bound package files and existing wrapper without requiring a combined legacy snapshot or starting a model',async t=>{
 const {spawnSync}=await import('node:child_process'),{readFileSync,existsSync}=await import('node:fs');
 const f=fixture(t,'workspace/'),{bindNativePublicInputs}=await module(),bound=bindNativePublicInputs(f);
 const templateRoot=join(f.root,'series','template');mkdirSync(templateRoot,{recursive:true});
 const baseline=join(f.root,'baseline'),candidate=join(f.root,'candidate');mkdirSync(baseline);mkdirSync(candidate);
 const wrapper=join(templateRoot,'wrapper.py'),oldWork=join(f.root,'old-work');
 writeFileSync(wrapper,`EXPECTED = []\nOVERRIDES = [${JSON.stringify('permissions.old={filesystem={'+JSON.stringify(f.root)+'="deny"}}')}]\nTARGET = '/nonexistent/not-started'\n`);
 const sourcePins={};for(const name of ['control.py','monitor-template.py.txt','prompt.txt']){writeFileSync(join(templateRoot,name),'synthetic-not-executed');sourcePins[name]=hash(Buffer.from('synthetic-not-executed'));}
 const runner=join(templateRoot,'runner.py');writeFileSync(runner,'synthetic-not-executed');
 const template={rows:[{fixture_id:'c',wrapper,work_root:oldWork,public_inventory:f.template.rows[0].public_inventory}],public_source_snapshot:join(f.root,'missing-combined-snapshot'),runner,dependency_pins:[]};
 const templatePath=join(templateRoot,'config.json');writeFileSync(templatePath,JSON.stringify(template));
 const nativeRoot=join(f.root,'series','native'),workRoot=join(f.root,'work'),request=join(f.root,'request.json');
 writeFileSync(request,JSON.stringify({profile:{root:nativeRoot,workRoot,templateConfig:templatePath,templateConfigDigest:hash(readFileSync(templatePath)),wrapperDigest:hash(readFileSync(wrapper)),sourcePins,protectedRoot:f.root,baselineFullRoot:baseline,executionKind:'real_codex'},candidate:{full_root:candidate},selection:{case_ids:['c']},policy:{id:'synthetic-only',conditions:['baseline','candidate'],repetitions:1},delivery_sources:bound.delivery_sources}));
 const python=process.env.ASK_TEST_PYTHON??'python3';
 const prepared=spawnSync(python,['-B',join(import.meta.dirname,'instruction-loop-native-prepare.py'),request],{encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
 assert.equal(JSON.parse(prepared.stdout).models_started,false);
 const config=JSON.parse(readFileSync(join(nativeRoot,'config.json')));assert.equal(config.rows.length,2);
 for(const row of config.rows){assert.equal(readFileSync(join(row.work_root,'workspace/public/a.txt'),'utf8'),'unchanged');assert.equal(readFileSync(join(row.work_root,'task.md'),'utf8'),'existing wrapper');assert.equal(existsSync(row.trial_root),false);}
});
