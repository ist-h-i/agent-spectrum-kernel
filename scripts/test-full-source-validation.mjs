import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir,devNull} from 'node:os';
import {spawnSync} from 'node:child_process';
import {prepareGitBaseline} from './ask-user-comparison-prepare.mjs';
import {generateFullInstructionCandidate,fullGenerationInput} from './instruction-loop-full-candidate.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {cleanOwnedInstructionLoopStaging} from './instruction-loop-normal-owner-worker.mjs';
function fixture(t,{writerSuffix='',validatorSuffix='',emptySupport=false}={}){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-full-validation-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const base=join(root,'base');mkdirSync(join(base,'skills/demo'),{recursive:true});
 writeFileSync(join(base,'AGENTS.md'),'Synthetic Full instructions.\n');writeFileSync(join(base,'skills/demo/SKILL.md'),'## Goal\nOriginal instruction.\n');
 if(emptySupport){mkdirSync(join(base,'benchmarks'));writeFileSync(join(base,'benchmarks/.gitkeep'),Buffer.alloc(0));}
 const ancestor=prepareGitBaseline(base);mkdirSync(join(base,'scripts'));mkdirSync(join(base,'docs/fixtures'),{recursive:true});
 writeFileSync(join(base,'docs/validation-report.md'),'stale report');
 for(const name of ['adapter-runtime-evidence.json','adapter-runtime-profiles.json'])writeFileSync(join(base,'docs/fixtures',name),'{}');
 writeFileSync(join(base,'docs/verification-proof-policy-contract.md'),'Synthetic fixed policy.\n');
 writeFileSync(join(base,'scripts/update-adapter-runtime-fixtures.mjs'),`import{writeFileSync,mkdirSync}from'node:fs';mkdirSync(new URL('../docs/fixtures/',import.meta.url),{recursive:true});writeFileSync(new URL('../docs/fixtures/adapter-runtime-bundle.json',import.meta.url),'{}');${writerSuffix}`);
 writeFileSync(join(base,'scripts/validate-repo.mjs'),`import{readFileSync,writeFileSync,chmodSync}from'node:fs';import{spawnSync}from'node:child_process';
 const root=new URL('../',import.meta.url),body=readFileSync(new URL('skills/demo/SKILL.md',root),'utf8');
 if(process.argv.slice(2).join(' ')!=='--write-report')throw Error('exact trusted validator invocation required');
 if(spawnSync('git',['cat-file','-e',${JSON.stringify(ancestor)}+'^{commit}'],{cwd:root}).status!==0)throw Error('historical object missing');
 writeFileSync(new URL('docs/validation-report.md',root),'current report: '+body);
 if(!body.includes('## Goal')){console.error('required Goal entrypoint contract');process.exitCode=1;}else console.log('Repository validation passed');${validatorSuffix}`);
 writeFileSync(join(base,'scripts/install-kernel.mjs'),`import{copyFileSync,mkdirSync}from'node:fs';import{join}from'node:path';const target=process.argv[process.argv.indexOf('--target')+1];copyFileSync(new URL('../AGENTS.md',import.meta.url),join(target,'AGENTS.md'));mkdirSync(join(target,'skills/demo'),{recursive:true});copyFileSync(new URL('../skills/demo/SKILL.md',import.meta.url),join(target,'skills/demo/SKILL.md'));`);
 writeFileSync(join(base,'scripts/install-codex-adapter.mjs'),`import{copyFileSync,mkdirSync}from'node:fs';import{join}from'node:path';const target=process.argv[process.argv.indexOf('--target')+1];mkdirSync(join(target,'.agents/skills/demo'),{recursive:true});copyFileSync(new URL('../skills/demo/SKILL.md',import.meta.url),join(target,'.agents/skills/demo/SKILL.md'));`);
 const git=args=>{const r=spawnSync('git',['-c','core.hooksPath='+devNull,...args],{cwd:base,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git(['add','--all']);git(['-c','user.name=Fixture','-c','user.email=fixture@invalid','-c','commit.gpgsign=false','commit','--quiet','-m','validator fixture']);
 const p={baselineSourceRoot:base,baselineRevision:git(['rev-parse','HEAD']),storeRoot:join(root,'store'),skills:['demo'],goal:'Improve while preserving entrypoint contracts',candidateRoot:join(root,'candidate'),fullRoot:join(root,'full'),stagingRoot:join(root,'staging'),sourceValidation:{kind:'ask_repository_v1'}};
 return {root,base,p};
}
const provider=text=>async()=>({response:{changes:[{operation:'write',path:'skills/demo/SKILL.md',text}]},execution:{kind:'fixture'}});
test('opt-in source validation preserves required history, refreshes report and retains an owned proof receipt',async t=>{
 const {p}=fixture(t),text='## Goal\nChanged instruction.\n',input=fullGenerationInput(p);assert.equal(input.source_validation.kind,'ask_repository_v1');
 const c=await generateFullInstructionCandidate(p,provider(text));assert.equal(readFileSync(join(p.candidateRoot,'docs/validation-report.md'),'utf8'),'current report: '+text);
 assert.ok(c.derived_binding_paths.includes('docs/validation-report.md'));assert.equal(c.source_validation.status,'passed');
 assert.equal(hash(readFileSync(c.source_validation.receipt.path)),c.source_validation.receipt.digest);
 const receipt=JSON.parse(readFileSync(c.source_validation.receipt.path));assert.equal(receipt.exit_code,0);assert.equal(receipt.runtime_or_effectiveness_implied,false);
 assert.deepEqual(c.source_validation.record,receipt);
 assert.equal(readFileSync(join(p.baselineSourceRoot,'docs/validation-report.md'),'utf8'),'stale report');
 const owned=JSON.parse(readFileSync(join(p.stagingRoot,'owned-files.json')));assert.ok(owned.files.some(f=>f.path==='source-validation.json'));
 cleanOwnedInstructionLoopStaging(p.stagingRoot);assert.equal(existsSync(c.source_validation.receipt.path),false);assert.equal(existsSync(join(p.stagingRoot,'owned-files.json')),true);
 assert.equal(c.source_validation.record.exit_code,0,'owned worker output retains verification after staging cleanup');
});
test('invalid generated contract is retained as a failure before commit, install or registration',async t=>{
 const {p}=fixture(t);await assert.rejects(generateFullInstructionCandidate(p,provider('No required heading.\n')),/source validation failed/);
 const receipt=JSON.parse(readFileSync(join(p.stagingRoot,'source-validation.json')));assert.equal(receipt.exit_code,1);assert.match(receipt.stderr.text,/required Goal/);
 assert.equal(existsSync(join(p.fullRoot,'AGENTS.md')),false);assert.equal(existsSync(join(p.stagingRoot,'changes.json')),false);
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:p.candidateRoot,encoding:'utf8'});assert.equal(head.stdout.trim(),p.baselineRevision);
 assert.equal(readFileSync(join(p.baselineSourceRoot,'skills/demo/SKILL.md'),'utf8'),'## Goal\nOriginal instruction.\n');
});
test('shallow baseline and unknown validation contracts stop before provider dispatch or root allocation',async t=>{
 const {p,base}=fixture(t);let calls=0;const supply=async()=>{calls++;return provider('## Goal\nchanged')();};
 await assert.rejects(generateFullInstructionCandidate({...p,sourceValidation:{kind:'arbitrary_command'}},supply),/source validation/);assert.equal(calls,0);
 writeFileSync(join(base,'.git/shallow'),p.baselineRevision+'\n');await assert.rejects(generateFullInstructionCandidate(p,supply),/complete.*history/);assert.equal(calls,0);
 assert.equal(existsSync(p.candidateRoot),false);assert.equal(existsSync(p.stagingRoot),false);
});
test('legacy source generation keeps validation optional and its original derived paths',async t=>{
 const {p}=fixture(t);delete p.sourceValidation;assert.equal(fullGenerationInput(p).source_validation,undefined);
 const c=await generateFullInstructionCandidate(p,provider('Legacy unconstrained text.\n'));assert.equal(c.source_validation,undefined);assert.ok(!c.derived_binding_paths.includes('docs/validation-report.md'));
});
test('a legitimate empty tracked source support file is preserved and fingerprinted without changing its bytes',async t=>{
 const {p}=fixture(t,{emptySupport:true});const c=await generateFullInstructionCandidate(p,provider('## Goal\nChanged.\n'));
 assert.equal(c.source_validation.status,'passed');assert.equal(readFileSync(join(p.candidateRoot,'benchmarks/.gitkeep')).length,0);
 const {fullInstructionInventory}=await import('./instruction-loop-full-candidate.mjs'),file=fullInstructionInventory(p.candidateRoot).find(f=>f.path==='benchmarks/.gitkeep');
 assert.equal(file.bytes,0);assert.equal(file.sha256,hash(Buffer.alloc(0)));
});
test('fixture writer cannot replace the validator before it executes',async t=>{
 const {p}=fixture(t,{writerSuffix:`writeFileSync(new URL('../scripts/validate-repo.mjs',import.meta.url),"import{writeFileSync}from'node:fs';writeFileSync(new URL('../forbidden-validator-ran',import.meta.url),'bad');");`});
 await assert.rejects(generateFullInstructionCandidate(p,provider('## Goal\nChanged.\n')),/source writer changed unexpected path: scripts\/validate-repo/);
 assert.equal(existsSync(join(p.candidateRoot,'forbidden-validator-ran')),false);assert.equal(existsSync(join(p.fullRoot,'AGENTS.md')),false);
});
for(const [label,validatorSuffix,expected] of [
 ['unstaged installer mutation',`writeFileSync(new URL('scripts/install-kernel.mjs',root),"throw Error('must never execute');");`,/source writer changed unexpected path: scripts\/install-kernel/],
 ['untracked file',`writeFileSync(new URL('untracked-private.txt',root),'unexpected');`,/source writer changed unexpected path: untracked-private/],
 ['file mode change',`chmodSync(new URL('skills/demo/SKILL.md',root),0o600);`,/source writer changed file mode/]
])test('validator side effects refuse '+label+' before commit and installer dispatch',async t=>{
 const {p}=fixture(t,{validatorSuffix});await assert.rejects(generateFullInstructionCandidate(p,provider('## Goal\nChanged.\n')),expected);
 assert.equal(existsSync(join(p.fullRoot,'AGENTS.md')),false);assert.equal(JSON.parse(readFileSync(join(p.stagingRoot,'source-validation.json'))).exit_code,0,'validator exit alone does not approve the source writer boundary');
 const head=spawnSync('git',['rev-parse','HEAD'],{cwd:p.candidateRoot,encoding:'utf8'});assert.equal(head.stdout.trim(),p.baselineRevision);
});
