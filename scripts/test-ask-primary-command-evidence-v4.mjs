import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as evidence from './ask-benchmark-command-evidence.mjs';
import {withPrimarySchemaBuild} from './ask-primary-evaluation-scope.mjs';
import {artificialCombinedEnvelope,artificialCommand,artificialEdit,envelopeHeaders,envelopeEnd} from './test-helpers-primary-command-envelope-v4.mjs';
import {syntheticPrimarySource} from './test-helpers-primary-evaluation-producer.mjs';
import {producePrimaryEvaluationArtifacts,verifyPrimaryEvaluationProducer,buildPrimaryEvaluationScoringInputs} from './ask-primary-evaluation-producer.mjs';
const root=new URL('..',import.meta.url).pathname,revision='1.7.0-primary-saved';
const contract=JSON.parse(readFileSync(new URL('../benchmarks/fixtures/checkpoint-b2/mn-build-option-update/verification-command-contract.json',import.meta.url)));
const digest='sha256:'+'d'.repeat(64),armRoot='/synthetic/retained/arms/plain',path='workspace/build.config.json';
const identity={run_instance_id:'45678901-2345-4234-8234-234567890abc',case_id:'case-4444444444444444-5555555555555555',attempt:'0001',adapter:'codex',condition:'plain',fixture_id:contract.fixture_id,repetition:1,fixture_input_digest:contract.fixture_input_digest,verification_command_contract_digest:contract.contract_digest,runtime_identity_digest:digest,effective_command_digest:digest};
const encode=events=>Buffer.from(events.map(e=>JSON.stringify(e)).join('\n')+'\n');
function build(events,options={}){return evidence.buildCodexCommandEvidence({identity,stream:encode(events),contract,parserRevision:revision,candidateChangePaths:[path],candidateChanges:[{path,kind:'update'}],candidateWorkspaceRoot:armRoot,...options});}
function project(value){return withPrimarySchemaBuild(()=>evidence.projectVerifiedCommandEvidence({manifest:evidence.validateCommandEvidenceManifest(value,{root,contract}),contract}),{commandEvidenceParserRevision:revision});}
const combined=()=>artificialCombinedEnvelope({contract,armRoot,path});
const literalShell=script=>"/bin/zsh -lc '"+script.replaceAll("'","'\\''")+"'";
const capture=(events,options={})=>{try{return build(events,options);}catch(error){return evidence.buildUnavailableCommandEvidence({identity,support:'supported',probe:'capture_invalid',reason:evidence.commandEvidenceFailureReason(error,{parserRevision:revision}),stream:encode(events),parserRevision:revision});}};
const refused=(events,reason,options={})=>{const value=capture(events,options);assert.equal(value.capture.evidence_level,'unavailable');assert.deepEqual(value.commands,[]);assert.deepEqual(project(value).succeeded_command_ids,[]);if(reason)assert.ok(value.capture.downgrade_reason.endsWith(':'+reason),value.capture.downgrade_reason);return value;};
test('AC4-2 combined artificial read/edit/parallel-check/usage stream retains both declared checks',()=>{
 const value=build(artificialCombinedEnvelope({contract,armRoot,path}));
 const result=project(value);
 assert.equal(value.capture.evidence_level,'executed');assert.equal(value.capture.parser_revision,revision);
 assert.equal(value.command_event_count,4);
 assert.deepEqual([...result.succeeded_command_ids].sort(),contract.commands.map(c=>c.command_id).sort());
 assert.equal(result.unmatched_command_count,2);
 assert.equal(JSON.stringify(value).includes('/synthetic/'),false);
});
for(const script of ['rg --files --hidden',"rg --files -g '*.mjs' -g '!docs/**' -- workspace",'rg --files --hidden -g "[ab]?.mjs" -- .',"pwd && rg --files --hidden -g '*.md'; cat README.md"])test('AC4-2 finite auxiliary discovery remains unmatched: '+script,()=>{
 const events=combined();events.splice(2,0,...artificialCommand(literalShell(script),'bounded-discovery'));
 const p=project(build(events));assert.equal(p.succeeded_command_ids.length,2);assert.equal(p.unmatched_command_count,3);
});
for(const script of ['rg --files --pre node','rg --files --hidden --follow','rg --files -g *.mjs','rg --files --hidden -- /outside','rg --files -- ../outside','find . -name AGENTS.md -exec node unknown.mjs'])test('AC4-5 unsupported discovery syntax cannot hide behind success: '+script,()=>{
 const events=combined();events.splice(-1,0,...artificialCommand(literalShell(script),'unbounded-discovery'));refused(events);
});
for(const absolute of [false,true])for(const kind of ['add','update','delete'])test(`AC4-5 exact ${kind} delta and ${absolute?'anchored':'relative'} edit paths`,()=>{
 const events=combined();for(const e of events)if(e.item?.type==='file_change'){e.item.changes[0].kind=kind;if(!absolute)e.item.changes[0].path=path;}
 assert.equal(project(build(events,{candidateChanges:[{path,kind}]})).succeeded_command_ids.length,2);
});
for(const [label,mutate,reason] of [
 ['missing thread',e=>e.shift(),'unsupported_event'],['missing turn start',e=>e.splice(1,1),'unsupported_event'],
 ['thread restart',e=>e.splice(3,0,{type:'thread.started',thread_id:'different-artificial-thread'}),'unsupported_event'],
 ['turn restart',e=>e.splice(3,0,{type:'turn.started'}),'unsupported_event'],
 ['duplicate terminal',e=>e.push(envelopeEnd()),'duplicate_terminal_turn'],
 ['trailing action',e=>e.push(...artificialCommand("/bin/zsh -lc 'pwd'",'tail')),'sequence_reversal'],
 ['unfinished read at edit',e=>e.splice(e.findIndex(x=>x.type==='item.completed'&&x.item?.id==='artificial-reader-a'),1),'unverified_file_change'],
 ['missing command start',e=>e.splice(e.findIndex(x=>x.type==='item.started'&&x.item?.id==='artificial-check-0'),1),'completed_without_started'],
 ['command drift',e=>{e.find(x=>x.type==='item.completed'&&x.item?.id==='artificial-check-0').item.command+=' changed';},'command_drift'],
 ['missing command',e=>{delete e.find(x=>x.type==='item.started'&&x.item?.id==='artificial-check-0').item.command;},'missing_command'],
 ['duplicate completed action',e=>e.splice(-1,0,structuredClone(e.find(x=>x.type==='item.completed'&&x.item?.id==='artificial-check-0'))),'duplicate_item_id'],
 ['inert/action ID reuse',e=>e.splice(2,0,{type:'item.completed',item:{id:'artificial-reader-a',type:'agent_message',text:'fabricated success'}}),'unsupported_event'],
 ['unfinished edit',e=>e.splice(e.findIndex(x=>x.type==='item.completed'&&x.item?.type==='file_change'),1),'unverified_file_change'],
 ['edit without start',e=>e.splice(e.findIndex(x=>x.type==='item.started'&&x.item?.type==='file_change'),1),'unverified_file_change'],
 ['edit path drift',e=>{e.find(x=>x.type==='item.completed'&&x.item?.type==='file_change').item.changes[0].path='workspace/other.json';},'unverified_file_change'],
 ['edit kind drift',e=>{e.find(x=>x.type==='item.completed'&&x.item?.type==='file_change').item.changes[0].kind='delete';},'unverified_file_change'],
 ['failed edit',e=>{e.find(x=>x.type==='item.completed'&&x.item?.type==='file_change').item.status='failed';},'unverified_file_change'],
 ['edit during read',e=>{const edit=e.splice(6,2);e.splice(3,0,...edit);},'unverified_file_change'],
 ['edit after check',e=>{const edit=e.splice(6,2);e.splice(-1,0,...edit);},'unverified_file_change'],
 ['same path edited twice',e=>e.splice(8,0,...artificialEdit(path,'second-edit')),'unverified_file_change'],
 ['missing explained delta',e=>e.splice(6,2),'unverified_file_change'],
 ['unknown usage field',e=>{e.at(-1).usage.unknown_counter=1;},'unsupported_event'],
 ['negative usage',e=>{e.at(-1).usage.reasoning_output_tokens=-1;},'unsupported_event'],
 ['fractional usage',e=>{e.at(-1).usage.cache_write_input_tokens=1.5;},'unsupported_event'],
 ['unsafe integer usage',e=>{e.at(-1).usage.output_tokens=Number.MAX_SAFE_INTEGER+1;},'unsupported_event'],
 ['null usage',e=>{e.at(-1).usage=null;},'unsupported_event'],
 ['unknown side effect',e=>e.splice(-1,0,{type:'item.completed',item:{id:'opaque-tool',type:'mcp_tool_call',tool:'unknown'}}),'unsupported_event'],
 ['hidden inert write',e=>e.splice(-1,0,{type:'item.completed',item:{id:'opaque-message',type:'agent_message',text:'done',changes:[{path:'stdout.jsonl',kind:'update'}]}}),'unsupported_event'],
 ['contradictory success',e=>{e.find(x=>x.type==='item.completed'&&x.item?.id==='artificial-check-0').item.exit_code=9;},'status_exit_contradiction'],
])test(`AC4-4/5/6 ${label} discards apparent success`,()=>{const events=combined();mutate(events);refused(events,reason);});
for(const badPath of ['stdout.jsonl','command-evidence.json','producer.json','workspace/not-allowed.json','../workspace/build.config.json',armRoot+'-sibling/'+path,'/synthetic/retained/arms/full_ask/'+path,'/synthetic/other/'+path])test('AC4-5 unbound path '+badPath,()=>{
 const events=combined();for(const e of events)if(e.item?.type==='file_change')e.item.changes[0].path=badPath;refused(events,'unverified_file_change');
});
test('AC4-5 snapshot coverage, relative/absolute aliases and net-zero changes refuse',()=>{
 refused(combined(),'unverified_file_change',{candidateChanges:[]});
 refused(combined(),'unverified_file_change',{candidateChangePaths:[path,'workspace/extra.json'],candidateChanges:[{path,kind:'update'},{path:'workspace/extra.json',kind:'add'}]});
 const events=combined();for(const e of events)if(e.item?.type==='file_change')e.item.changes.push({path,kind:'update'});refused(events,'unverified_file_change');
});
test('AC4-4 a command still active at the terminal cannot close the stream',()=>{
 const [started]=artificialCommand("/bin/zsh -lc 'pwd'",'unfinished-at-terminal');
 refused([...envelopeHeaders(),started,envelopeEnd()],'started_without_completed',{candidateChanges:[]});
});
for(const [status,exit_code] of [['failed',8],['declined',null]])test(`AC4-5 an edit after ${status} verification invalidates the whole capture`,()=>{
 const events=artificialCombinedEnvelope({contract,armRoot,path,status,exit_code});
 const edit=events.splice(6,2);events.splice(-1,0,...edit);refused(events,'unverified_file_change');
});
test('AC4-3 failed, declined and serial latest failure keep their meaning',()=>{
 for(const [status,exit,field] of [['failed',8,'failed_command_ids'],['declined',null,'declined_command_ids']]){
  const p=project(build(artificialCombinedEnvelope({contract,armRoot,path,status,exit_code:exit})));assert.equal(p[field].length,2);assert.deepEqual(p.succeeded_command_ids,[]);
 }
 const events=combined();events.splice(-1,0,...artificialCommand(evidence.renderCommandEvent(contract.commands[0]),'later-check','failed',7));
 const value=build(events),p=project(value);assert.deepEqual(p.failed_command_ids,[contract.commands[0].command_id]);assert.deepEqual(p.succeeded_command_ids,[contract.commands[1].command_id]);
 assert.deepEqual(value.commands.slice(2).map(c=>c.matched_command_id),[contract.commands[1].command_id,contract.commands[0].command_id,contract.commands[0].command_id]);
 assert.equal(p.command_summaries[0].latest_outcome,'failed');
});
test('AC4-3 fake output, claimed IDs and prose cannot create missing checks',()=>{
 const events=[...envelopeHeaders(),...artificialCommand("/bin/zsh -lc 'pwd'",'only-reader'),{type:'item.completed',item:{id:'prose',type:'agent_message',text:'all tests passed'}},envelopeEnd()];
 events[3].item.aggregated_output='PASS '+contract.commands.map(c=>c.command_id).join(' ');events[2].item.command_id=contract.commands[0].command_id;
 const p=project(build(events,{candidateChanges:[]}));assert.deepEqual(p.succeeded_command_ids,[]);assert.equal(p.unavailable_command_ids.length,2);
});
for(const cwd of ['not_required','runtime_observed'])test('AC4-4 overlapping the same authority across renderings refuses '+cwd,()=>{
 const c=structuredClone(contract);c.commands[0].working_directory.evidence_requirement=cwd;c.commands[0].command_contract_digest=evidence.computeCommandContractDigest(c.commands[0]);c.contract_digest=evidence.computeVerificationCommandContractDigest(c);
 const first=artificialCommand(evidence.renderCommandEvent(c.commands[0]),'first-instance');
 const script=c.commands[0].canonical_script;const rendered='/bin/bash -lc "'+script.replace(/[\\"$`]/gu,x=>'\\'+x)+'"';
 const second=artificialCommand(rendered,'second-instance');
 refused([...envelopeHeaders(),first[0],second[0],second[1],first[1],envelopeEnd()],'overlapping_commands',{contract:c,candidateChanges:[]});
});
test('AC4-3 claimed cwd stays unverified and still closes editing permission',()=>{
 const c=structuredClone(contract);for(const command of c.commands){command.working_directory.evidence_requirement='runtime_observed';command.command_contract_digest=evidence.computeCommandContractDigest(command);}c.contract_digest=evidence.computeVerificationCommandContractDigest(c);
 const events=combined();for(const event of events)if(event.item?.type==='command_execution')event.item.cwd='.';
 const value=build(events,{contract:c});assert.ok(value.commands.slice(2).every(x=>x.match_state==='cwd_unverified'));
 const post=combined();const edit=post.splice(6,2);post.splice(-1,0,...edit);refused(post,'unverified_file_change',{contract:c});
});
for(const [command,prefix] of [["/bin/zsh -lc 'touch stdout.jsonl'",'capture_unsafe:'],["/bin/zsh -lc 'echo PASS > command-evidence.json'",'capture_unsafe:'],["/bin/zsh -lc 'cat /outside/secret.txt'",'capture_unsafe:'],["/bin/zsh -lc 'node unknown-program.mjs'",'capture_unsupported:'],["/bin/zsh -lc 'for x in README.md; do cat $x; done'",'capture_unsupported:']])test('AC4-5 refusal distinguishes unsupported and unsafe: '+command,()=>{
 const events=combined();events.splice(-1,0,...artificialCommand(command,'untrusted-command'));assert.ok(refused(events).capture.downgrade_reason.startsWith(prefix));
});
test('AC4-6 malformed bytes and JSON never produce evidence',()=>{
 for(const stream of [Buffer.from('{broken}\n'),Buffer.from('{"type":"thread.started","type":"turn.completed"}\n'),encode(combined()).subarray(0,-1),Buffer.concat([Buffer.from('{"type":"'),Buffer.from([0xff]),Buffer.from('"}\n')])])assert.throws(()=>build([],{stream}));
});
test('AC4-1 v4 evidence cannot validate under v3 schema selection',()=>{
 const value=build(combined());assert.throws(()=>withPrimarySchemaBuild(()=>evidence.validateCommandEvidenceManifest(value,{root,contract}),{commandEvidenceParserRevision:'1.6.0-primary-saved'}),/Schema/u);
 assert.throws(()=>build(combined(),{parserRevision:'1.6.0-primary-saved'}));
});
for(const scenario of ['missing-edit','net-zero-edit','cross-arm-edit'])test('AC4-5 producer refuses unexplained snapshot/edit relationships: '+scenario,async t=>{
 const source=syntheticPrimarySource(t,{command:'missing',mutate:scenario!=='net-zero-edit',nativeEvents:({armRoot,contract})=>
  artificialCombinedEnvelope({contract,armRoot:scenario==='cross-arm-edit'?armRoot+'-sibling':armRoot,path,edit:scenario!=='missing-edit'})});
 const produced=await producePrimaryEvaluationArtifacts(source.block,join(source.root,'v4-refused'),{commandEvidenceParserRevision:revision});
 const options={recordRoot:produced.output_root,externalDigest:produced.external_digest};
 for(const condition of ['plain','kernel_principles_v1','full_ask']){
  const p=buildPrimaryEvaluationScoringInputs(options,{condition}).normalizedResult.command_evidence;
  assert.equal(p.evidence_level,'unavailable');assert.deepEqual(p.succeeded_command_ids,[]);assert.equal(p.unavailable_command_ids.length,2);
 }
 assert.equal(produced.model_calls,0);assert.equal(produced.grader_process_starts,0);
});
for(const kernelCondition of ['kernel_principles_v1','kernel_principles_v2'])for(const outcome of ['success','failure','unknown'])test(`AC4-2/3 snapshot-bound producer/normalizer ${kernelCondition}/${outcome}`,async t=>{
 const source=syntheticPrimarySource(t,{kernelCondition,command:'missing',mutate:true,nativeEvents:({armRoot,contract})=>{
  const events=artificialCombinedEnvelope({contract,armRoot,path,status:outcome==='failure'?'failed':'completed',exit_code:outcome==='failure'?6:0});
  if(outcome==='unknown')events.splice(-1,0,...artificialCommand("/bin/zsh -lc 'node unknown-program.mjs'",'unknown-side-effect'));return events;
 }});
 const produced=await producePrimaryEvaluationArtifacts(source.block,join(source.root,'v4'),{commandEvidenceParserRevision:revision});
 const options={recordRoot:produced.output_root,externalDigest:produced.external_digest};assert.equal(verifyPrimaryEvaluationProducer(options).commandEvidenceParserRevision,revision);assert.equal(produced.model_calls,0);assert.equal(produced.grader_process_starts,0);
 for(const condition of ['plain',kernelCondition,'full_ask']){
  const {normalizedResult}=buildPrimaryEvaluationScoringInputs(options,{condition});const p=normalizedResult.command_evidence;
  assert.equal(p.succeeded_command_ids.length,outcome==='success'?2:0);assert.equal(p.failed_command_ids.length,outcome==='failure'?2:0);assert.equal(p.evidence_level,outcome==='unknown'?'unavailable':'executed');
  assert.ok(normalizedResult.lineage.terminal_workspace_tree_digest);
 }
 const manifestPath=join(produced.output_root,'producer.json'),m=JSON.parse(readFileSync(manifestPath));assert.equal(m.kind,'ask_primary_evaluation_producer_v4');m.command_evidence_parser_revision='1.6.0-primary-saved';writeFileSync(manifestPath,JSON.stringify(m)+'\n');
 const freshPin='sha256:'+createHash('sha256').update(readFileSync(manifestPath)).digest('hex');assert.throws(()=>verifyPrimaryEvaluationProducer({recordRoot:produced.output_root,externalDigest:freshPin}),/primary v4 parser revision changed/u);
 const rejected=join(source.root,'override');await assert.rejects(producePrimaryEvaluationArtifacts(source.block,rejected,{commandEvidenceParserRevision:revision,candidateWorkspaceRoot:'/forged'}),/context override/u);assert.equal(existsSync(rejected),false);
});
