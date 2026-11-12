import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {snapshotInstructionSource} from './instruction-source-version.mjs';
import {generateFullInstructionCandidate,fullGenerationInput} from './instruction-loop-full-candidate.mjs';

function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-full-filesystem-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const base=join(root,'base');mkdirSync(join(base,'skills/demo/references'),{recursive:true});mkdirSync(join(base,'scripts'));mkdirSync(join(base,'docs'));
 writeFileSync(join(base,'AGENTS.md'),'Synthetic kernel.\n');writeFileSync(join(base,'skills/demo/SKILL.md'),'## Goal\nOriginal instruction.\n');writeFileSync(join(base,'skills/demo/references/detail.md'),'Original detail.\n');
 writeFileSync(join(base,'docs/review-finding-contract.md'),'Original review contract.\n');
 // A development writer is present but must not execute on the runtime path.
 writeFileSync(join(base,'scripts/update-adapter-runtime-fixtures.mjs'),`throw Error('development writer must not run');`);
 writeFileSync(join(base,'scripts/install-kernel.mjs'),`import{cpSync,copyFileSync,mkdirSync}from'node:fs';import{join}from'node:path';const target=process.argv[process.argv.indexOf('--target')+1];copyFileSync(new URL('../AGENTS.md',import.meta.url),join(target,'AGENTS.md'));mkdirSync(join(target,'docs'));copyFileSync(new URL('../docs/review-finding-contract.md',import.meta.url),join(target,'docs/review-finding-contract.md'));cpSync(new URL('../skills/',import.meta.url),join(target,'skills'),{recursive:true});`);
 writeFileSync(join(base,'scripts/install-codex-adapter.mjs'),`import{cpSync,mkdirSync}from'node:fs';import{join}from'node:path';const target=process.argv[process.argv.indexOf('--target')+1];mkdirSync(join(target,'.agents'));cpSync(new URL('../skills/',import.meta.url),join(target,'.agents/skills'),{recursive:true});`);
 const p={sourceKind:'filesystem_snapshot',baselineSourceRoot:base,baselineRevision:snapshotInstructionSource(base),storeRoot:join(root,'store'),skills:['demo'],goal:'Improve clear instructions',candidateRoot:join(root,'candidate'),fullRoot:join(root,'full'),stagingRoot:join(root,'staging')};
 return {root,base,p};
}
const provider=async()=>({response:{changes:[{operation:'write',path:'skills/demo/SKILL.md',text:'## Goal\nImproved instruction.\n'}]},execution:{kind:'fixture'}});
test('filesystem Full generation needs no Git and preserves standard projection without development validators',async t=>{
 const {p,base,root}=fixture(t),path=process.env.PATH;
 process.env.PATH=join(root,'no-git');t.after(()=>{process.env.PATH=path;});
 const c=await generateFullInstructionCandidate(p,provider);
 assert.equal(c.source_kind,'filesystem_snapshot');assert.match(c.source_revision,/^sha256:[a-f0-9]{64}$/u);
 assert.equal(c.source_revision,snapshotInstructionSource(p.candidateRoot));assert.deepEqual(c.changed_paths,['skills/demo/SKILL.md']);
 assert.equal(c.source_validation.kind,'instruction_assets_v1');assert.equal(c.source_validation.status,'passed');
 assert.equal(readFileSync(join(p.fullRoot,'.agents/skills/demo/SKILL.md'),'utf8'),'## Goal\nImproved instruction.\n');
 assert.equal(existsSync(join(p.candidateRoot,'.git')),false);assert.equal(readFileSync(join(base,'skills/demo/SKILL.md'),'utf8'),'## Goal\nOriginal instruction.\n');
});
test('filesystem baseline drift is refused before model dispatch',async t=>{
 const {p,base}=fixture(t);writeFileSync(join(base,'skills/demo/SKILL.md'),'drift');let called=false;
 await assert.rejects(generateFullInstructionCandidate(p,async()=>{called=true;return provider();}),/revision drift|snapshot.*(drift|changed)/);assert.equal(called,false);assert.equal(existsSync(p.candidateRoot),false);
});
test('filesystem baseline changing during provider execution is refused before copying or installers',async t=>{
 const {p,base}=fixture(t);
 await assert.rejects(generateFullInstructionCandidate(p,async()=>{writeFileSync(join(base,'scripts/install-kernel.mjs'),'throw Error("mutated")');return provider();}),/revision drift|snapshot.*(drift|changed)/);
 assert.equal(existsSync(join(p.fullRoot,'AGENTS.md')),false);
});
test('filesystem mode refuses repository-validation semantics and unknown source kinds',t=>{
 const {p}=fixture(t);
 assert.throws(()=>fullGenerationInput({...p,sourceValidation:{kind:'ask_repository_v1'}}),/filesystem|validation/);
 assert.throws(()=>fullGenerationInput({...p,sourceKind:'other'}),/source kind/);
});
test('filesystem generation retains a snapshot revision on a no-change reselection',async t=>{
 const {p,root}=fixture(t),first=await generateFullInstructionCandidate(p,provider);
 const next={...p,candidateRoot:join(root,'candidate-two'),fullRoot:join(root,'full-two'),stagingRoot:join(root,'staging-two'),provider:{retainedAuthoring:{synthetic:true},caseReselection:true}};
 const c=await generateFullInstructionCandidate(next,async()=>({...await provider(),execution:{kind:'fixture',preserved_candidate_source:{source_root:first.source_root,source_revision:first.source_revision}}}));
 assert.equal(c.source_revision,first.source_revision);
});
test('filesystem generation refuses an empty Skill entrypoint before projection',async t=>{
 const {p}=fixture(t);
 await assert.rejects(generateFullInstructionCandidate(p,async()=>({response:{changes:[{operation:'write',path:'skills/demo/SKILL.md',text:'  \n'}]},execution:{kind:'fixture'}})),/entrypoint|empty/);
 assert.equal(existsSync(join(p.fullRoot,'AGENTS.md')),false);
});

test('filesystem Full registration preserves unchanged parents and records changed assets as content versions',async t=>{
 const {fullPartialFixture}=await import('./test-helpers-full-partial-assets.mjs');
 const {registerFullInstructionCandidate}=await import('./instruction-loop-full-candidate.mjs');
 const {verifyAssetRegistry}=await import('./asset-registry.mjs');
 const f=fullPartialFixture(t);
 rmSync(join(f.p.candidateRoot,'.git'),{recursive:true});
 rmSync(join(f.p.baselineSourceRoot,'.git'),{recursive:true});
 f.p.sourceKind='filesystem_snapshot';f.p.baselineRevision=snapshotInstructionSource(f.p.baselineSourceRoot);
 f.candidate.source_kind='filesystem_snapshot';f.candidate.source_revision=snapshotInstructionSource(f.p.candidateRoot);
 const path=process.env.PATH;process.env.PATH=join(f.root,'no-git');t.after(()=>{process.env.PATH=path;});
 const c=registerFullInstructionCandidate(f.p,f.candidate);
 assert.equal(c.candidate_assets.length,1);assert.equal(c.environment_assets.length,2);
 assert.ok(c.environment_assets.some(a=>a.record_digest===f.parents[1].record_digest));
 const entry=verifyAssetRegistry({storeRoot:f.p.storeRoot,snapshotDigest:c.registry.snapshot_digest}).assets.find(a=>a.record_digest===c.candidate_assets[0].record_digest);
 assert.equal(entry.record.source.kind,'filesystem_snapshot');assert.equal(entry.record.version_scheme,'content_digest');
 assert.equal(entry.record.version,f.candidate.source_revision);assert.equal(entry.record.derivation.parent.record_digest,f.parents[0].record_digest);
});

test('filesystem projection failure cannot leave a passed source-validation receipt',async t=>{
 const {p,base}=fixture(t);
 writeFileSync(join(base,'scripts/install-codex-adapter.mjs'),'process.exit(1);');p.baselineRevision=snapshotInstructionSource(base);
 await assert.rejects(generateFullInstructionCandidate(p,provider),/Full installer failed/);
 assert.equal(existsSync(join(p.stagingRoot,'source-validation.json')),false);
});
