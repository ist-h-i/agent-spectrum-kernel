import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalDigest} from './content-addressed-store.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {prepareGitBaseline} from './ask-user-comparison-prepare.mjs';
import {fullGenerationInput,generateFullInstructionCandidate,codexFullInstructionProvider,compareFullInstructionContext} from './instruction-loop-full-candidate.mjs';
import {createInstructionLoopCommandRuntime} from './instruction-loop-command-runtime.mjs';
import {createNativeInstructionLoopConfiguration} from './instruction-loop-native-configuration.mjs';
function fixture(t){const root=realpathSync(mkdtempSync(join(tmpdir(),'ask-full-loop-')));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function generation(t){
  const root=fixture(t),base=join(root,'base');mkdirSync(base);mkdirSync(join(base,'skills/demo/references'),{recursive:true});
  writeFileSync(join(base,'skills/demo/SKILL.md'),'Public Skill source.');writeFileSync(join(base,'skills/demo/references/detail.md'),'Public reference.');
  mkdirSync(join(base,'benchmarks/private'),{recursive:true});writeFileSync(join(base,'benchmarks/private/answer.json'),'FAKE_PRIVATE_SENTINEL');writeFileSync(join(base,'.env'),'FAKE_AUTH_SENTINEL');
  const revision=prepareGitBaseline(base),store=join(root,'store');mkdirSync(store);
  return {root,p:{baselineSourceRoot:base,baselineRevision:revision,storeRoot:store,skills:['demo'],goal:'Improve public instruction efficiency',candidateRoot:join(root,'candidate'),fullRoot:join(root,'full'),stagingRoot:join(root,'staging')}};
}
test('Full generation input contains only public canonical Skill Markdown, not the source checkout or private files',t=>{
  const {p}=generation(t),input=fullGenerationInput(p),text=JSON.stringify(input);
  assert.deepEqual(input.files.map(f=>f.path),['skills/demo/SKILL.md','skills/demo/references/detail.md']);
  assert.ok(!text.includes('FAKE_PRIVATE_SENTINEL')&&!text.includes('FAKE_AUTH_SENTINEL')&&!text.includes(p.baselineSourceRoot));
});
for(const path of ['scripts/install-kernel.mjs','skills/demo/../../scripts/evil.md','skills/other/SKILL.md','skills/demo/references/.git/config.md','.agent-spectrum-kernel/install-state.json'])
test('Full generator rejects out-of-scope model file '+path,async t=>{
  const {p}=generation(t);await assert.rejects(generateFullInstructionCandidate(p,async()=>({response:{changes:[{operation:'write',path,text:'invalid'}]},execution:{kind:'fixture'}})),/outside allowed/);
  assert.equal(existsSync(p.candidateRoot),false);
});
test('generation without a new model-call grant is blocked before creating a session',async t=>{
  const root=fixture(t),sessionRoot=join(root,'not-created');await assert.rejects(codexFullInstructionProvider({sessionRoot,modelCallsAuthorized:false},{}),/not authorized/);assert.equal(existsSync(sessionRoot),false);
});
test('Full comparison rejects silently removed support context and semantic prompt changes',t=>{
  const root=fixture(t),a=join(root,'a'),b=join(root,'b');mkdirSync(join(a,'docs'),{recursive:true});mkdirSync(join(a,'.agents/prompts'),{recursive:true});
  writeFileSync(join(a,'docs/support.md'),'fixed public support');writeFileSync(join(a,'.agents/prompts/demo.md'),'bind '+ 'a'.repeat(64));cpSync(a,b,{recursive:true});
  writeFileSync(join(b,'.agents/prompts/demo.md'),'bind '+ 'b'.repeat(64));assert.equal(compareFullInstructionContext({baselineRoot:a,candidateRoot:b,skills:['demo']}).supporting_context_preserved,true);
  rmSync(join(b,'docs/support.md'));assert.throws(()=>compareFullInstructionContext({baselineRoot:a,candidateRoot:b,skills:['demo']}),/addition\/removal/);
  writeFileSync(join(b,'docs/support.md'),'fixed public support');writeFileSync(join(b,'.agents/prompts/demo.md'),'semantic prompt change');assert.throws(()=>compareFullInstructionContext({baselineRoot:a,candidateRoot:b,skills:['demo']}),/beyond generated hash/);
});
test('complete configuration binds all stages and marks real generator/trial calls separately',t=>{
  const root=fixture(t),path=join(root,'profile.json');writeFileSync(path,JSON.stringify({kind:'full_native_reference_loop_profile_v1',normal:{target:'/synthetic-owner'},policy:{normal_target:'/synthetic-owner'},generator:{provider:{kind:'codex'}},native:{executionKind:'real_codex'}}));
  const config=createNativeInstructionLoopConfiguration(path);assert.equal(Object.keys(config.runtime.commands).length,10);
  assert.equal(config.runtime.commands.generate.model_calls,true);assert.equal(config.runtime.commands.trial.model_calls,true);assert.equal(config.runtime.commands.report.model_calls,false);
  assert.ok(Object.values(config.runtime.commands).every(c=>c.inspect_argv.includes('inspect')));
});
test('interrupted worker is recovered from native terminal evidence without another dispatch',async t=>{
  const root=fixture(t),worker=join(root,'fixture-worker.mjs'),done=join(root,'done'),counter=join(root,'counter');
  writeFileSync(worker,`import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {canonicalDigest} from ${JSON.stringify(new URL('./content-addressed-store.mjs',import.meta.url).href)};
const [action,request,result]=process.argv.slice(2),job=JSON.parse(readFileSync(request));
if(action==='execute'){writeFileSync(${JSON.stringify(counter)},'one dispatch',{flag:'wx'});process.exitCode=83;}
else if(existsSync(${JSON.stringify(done)}))writeFileSync(result,JSON.stringify({request_digest:canonicalDigest(job),status:'completed',output:{ready_for_next_root:true,recovered_from_native_records:true}}),{flag:'wx'});`);
  const command={argv:[process.execPath,worker,'execute'],inspect_argv:[process.execPath,worker,'inspect'],pins:[{path:worker,digest:hash(readFileSync(worker))}],model_calls:false};
  const definition={commands:Object.fromEntries(['generate','register','select','trial','report','plan','apply','version','cleanup','restore'].map(k=>[k,command]))};
  const runtime=createInstructionLoopCommandRuntime({definition}),job={kind:'trial',key:'trial-fixture',input:{},input_digest:canonicalDigest({})};
  assert.equal((await runtime.trial(job,{root})).status,'unknown');writeFileSync(done,'native terminal');
  const recovered=await runtime.inspect(job,{root});assert.equal(recovered.status,'completed');assert.equal(recovered.output.transport_interruption.exit_code,83);assert.equal(readFileSync(counter,'utf8'),'one dispatch');
  await assert.rejects(runtime.trial(job,{root}),/already allocated/);
});
