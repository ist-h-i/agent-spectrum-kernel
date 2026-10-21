import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {classifyPrimaryDiscoveryCommandV9, PrimaryDiscoveryGrammarError} from './ask-primary-discovery-grammar-v9.mjs';

const publicFiles=['task.md','workspace/README.md','workspace/src/check.mjs','workspace/data/cases.json'];
const quote=value=>"'"+value.replaceAll("'", "'\\''")+"'";
const render=(script,shell='/bin/bash')=>shell+' -lc '+quote(script);
const classify=(script,options={})=>classifyPrimaryDiscoveryCommandV9(render(script),{publicFiles,...options});
const rejects=(script,code,options={})=>assert.throws(()=>classify(script,options),error=>error instanceof PrimaryDiscoveryGrammarError&&error.code===code);

for(const shell of ['/bin/bash','/bin/zsh'])for(const script of [
 'pwd', 'pwd && rg --files', "pwd; rg --files -g 'README*' -g '!**/.git/**'",
 "rg --files --glob 'workspace/{src,data}/*' -- workspace", "cat task.md workspace/README.md",
 "cat -- 'workspace/src/check.mjs'", 'rg --files -g README.md',
 "rg --files -g '!'node_modules -g '\\[a-z\\]'", "rg --files -g 'workspace/**' -g '!'\"**/.git/**\"",
])test('DG9-READ finite discovery '+shell+' '+script,()=>{
 const raw=render(script,shell),value=classifyPrimaryDiscoveryCommandV9(raw,{publicFiles});
 assert.equal(value.kind,'finite_public_read_vocabulary');assert.equal(value.verification_authority,false);
 assert.equal(value.runtime_isolation_authority,false);assert.equal(value.working_directory,'unverified');
 assert.equal(value.rendered_command_digest,'sha256:'+createHash('sha256').update(raw).digest('hex'));
 assert.ok(value.operations.length>0);assert.equal(value.shell_executable,shell);
 assert.equal(Object.hasOwn(value,'succeeded_command_ids'),false);
});
test('DG9-LITERAL equivalent outer literal renderings and inner concatenation',()=>{
 const script="pwd && rg --files -g '!node_modules' -g 'workspace/**'";
 const a=classify(script),b=classifyPrimaryDiscoveryCommandV9('/bin/zsh -lc "'+script+'"',{publicFiles});
 assert.deepEqual(a.operations,b.operations);assert.notEqual(a.rendered_command_digest,b.rendered_command_digest);
 assert.deepEqual(classify("rg --files -g 'work'\"space/\"'**'").operations,[{tool:'rg',argv:['--files','-g','workspace/**'],enumeration_target:'.'}]);
 assert.deepEqual(classify('rg --files -g workspace/\\*\\*').operations,classify("rg --files -g 'workspace/**'").operations);
});
test('DG9-BOUNDARY separators inside quotes are not executable separators',()=>{
 rejects("rg --files -g 'x;y'",'unsupported_command');rejects("rg --files -g 'x&&y'",'unsupported_command');
 assert.equal(classify('pwd\t&&\tcat\ttask.md').operations.length,2);
});
for(const script of ['pwd;',';pwd','pwd &&','pwd;;pwd','pwd && && pwd','pwd\ncat task.md',"rg --files -g ''",'rg --files -g workspace/**',"cat 'task.md",'pwd # comment'])test('DG9-BOUNDARY malformed/ambiguous '+JSON.stringify(script),()=>assert.throws(()=>classify(script),PrimaryDiscoveryGrammarError));
for(const script of ['pwd; rm workspace/README.md','pwd && curl https://example.invalid','cat task.md > workspace/output','pwd | cat task.md','pwd & cat task.md','pwd || cat task.md','(pwd)','cat $HOME','cat ${HOME}','cat `pwd`','cat $(pwd)','FOO=x pwd','source task.md','exec cat task.md'])test('DG9-REJECT active syntax '+script,()=>rejects(script,'unsafe_command'));
for(const script of ['node script.mjs','npm test','python script.py','for x in task.md; do cat "$x"; done','nl -ba task.md','rg --files --hidden','rg --files --pre evil','rg --files --glob-case-insensitive','rg --files workspace','cat','pwd --','rg -n value workspace/README.md'])test('DG9-REJECT unknown syntax '+script,()=>assert.throws(()=>classify(script),PrimaryDiscoveryGrammarError));
for(const script of ['cat /etc/passwd','cat ../secret','cat workspace/../task.md','cat ./task.md','cat workspace/missing','cat -- workspace/.env','cat .agents/skills/x/SKILL.md','rg --files -- ../outside','rg --files -- workspace/missing',"rg --files -g '../*'", "rg --files -g '/etc/*'", "rg --files -g 'C:/secret'", "rg --files -g '!../*'"])test('DG9-BOUNDARY unavailable vocabulary '+script,()=>assert.throws(()=>classify(script),PrimaryDiscoveryGrammarError));
test('DG9-BOUNDARY a valid prefix never masks a later unknown or unsafe operation',()=>{
 rejects('pwd; cat task.md; unknown-tool','unsupported_command');rejects('pwd && cat task.md; touch workspace/new','unsafe_command');
 rejects('pwd; cat workspace/missing','auxiliary_read_path_unavailable');
});
for(const publicFiles of [null,[],['task.md','task.md'],['../secret'],['workspace/../x'],['workspace//x'],['workspace/.env'],['AGENTS.md'],['/tmp/x'],['task.md',1]])test('DG9-BOUNDARY invalid context '+JSON.stringify(publicFiles),()=>rejects('pwd','auxiliary_read_context_unavailable',{publicFiles}));
test('DG9-BOUNDARY sparse public context is typed unavailable',()=>{
 for(const publicFiles of [Array(1),['task.md',,]])rejects('pwd','auxiliary_read_context_unavailable',{publicFiles});
});
test('DG9-LITERAL empty/malformed/unsupported envelopes and resource bounds refuse',()=>{
 for(const raw of ['',"/bin/sh -lc 'pwd'","/bin/zsh -c 'pwd'","/bin/zsh -lc 'pwd' extra","/bin/zsh -lc \"$HOME\"",'x'.repeat(17000),'/bin/zsh -lc '+quote('pwd\0')])assert.throws(()=>classifyPrimaryDiscoveryCommandV9(raw,{publicFiles}),PrimaryDiscoveryGrammarError);
 assert.throws(()=>classify(Array(34).fill('pwd').join(';')),PrimaryDiscoveryGrammarError);
 assert.throws(()=>classify('cat '+Array(520).fill('task.md').join(' ')),PrimaryDiscoveryGrammarError);
});
