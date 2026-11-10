// Standard practical command adapter for the three caller-reference review profiles.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {isBuiltin} from 'node:module';
import {pathToFileURL} from 'node:url';
import {canonicalDigest,readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {captureSavedCommandObservations} from './practical-saved-command-observation.mjs';
import {createHostReportingPolicy} from './practical-host-reporting-policy.mjs';
import {evaluatePrimaryGrade} from './practical-primary-grading.mjs';
import {executeCodexSession} from './codex-exec-runner.mjs';
import {parseUserCodexTelemetry} from './ask-user-comparison.mjs';

const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const bytes=path=>readStableFile(path,'reporting grader input',16*1024*1024).bytes;
const pin=path=>({path,digest:hash(bytes(path))});
const save=(outputPath,artifact)=>writeCanonicalJsonNoReplace({outputPath,artifact,label:'reporting grader artifact',maximumBytes:16*1024*1024});
const fixtures=['easy-ordinary-refund-review','ordinary-frontend-review-evidence-gap','mp-frontend-state-review'];
const exactKeys=(value,keys)=>assert.deepEqual(Object.keys(value).sort(),[...keys].sort());
function checked(ref){exactKeys(ref,['path','digest']);assert.equal(resolve(ref.path),ref.path);assert.equal(pin(ref.path).digest,ref.digest,'reporting grader input drift');return readJsonFileStrict(ref.path);}

// Pin the local module import closure, using the repository's existing static
// import-scanning convention. Authority data and executable pins are separate.
export function practicalReportingGraderPins(){
 const pending=[join(import.meta.dirname,'practical-reporting-grader.mjs')],seen=new Map();
 while(pending.length){const path=pending.pop();if(seen.has(path))continue;
  assert.ok(path.startsWith(import.meta.dirname+'/'),'reporting grader import escapes scripts');
  const source=bytes(path);seen.set(path,{path,digest:hash(source)});
  for(const match of source.toString('utf8').matchAll(/(?<!["'`])(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)["']([^"'\r\n]+)["']/gu)){
   if(isBuiltin(match[1]))continue;assert.ok(match[1].startsWith('.'),'external reporting grader import refused');
   pending.push(resolve(dirname(path),match[1]));
  }
 }
 return [...seen.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
function validateOptions(options,fixtureId,evidenceKind){
 exactKeys(options,['kind','config','backend']);assert.equal(options.kind,'caller_reference_reporting_v3');assert.ok(fixtures.includes(fixtureId),'unsupported reporting fixture');
 exactKeys(options.config,['model','reasoning','requirements','evidence_map','verification_contract','checks']);
 const {config,backend}=options;assert.ok(Array.isArray(config.checks));
 for(const key of ['model','reasoning'])assert.ok(config[key]===null||typeof config[key]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(config[key]));
 const record=checked(config.requirements),contract=checked(config.verification_contract),map=checked(config.evidence_map);
 assert.equal(record.fixture_id,fixtureId);assert.equal(map.fixture_id,fixtureId);createHostReportingPolicy(record,contract);
 assert.deepEqual(map.scope_boundary_authority.allowed_candidate_paths,['workspace/review.json']);
 assert.deepEqual(map.scope_boundary_authority.required_candidate_paths,['workspace/review.json']);
 if(backend.kind==='fixture'){
  exactKeys(backend,['kind','replies']);assert.equal(evidenceKind,'synthetic','fixture grader requires synthetic evidence');
  exactKeys(backend.replies,['primary','verification']);
 }else{
  exactKeys(backend,['kind','executable','timeout_ms']);assert.equal(backend.kind,'codex');
  exactKeys(backend.executable,['path','digest']);assert.equal(resolve(backend.executable.path),backend.executable.path);
  assert.equal(pin(backend.executable.path).digest,backend.executable.digest,'reporting backend executable drift');
  assert.ok(Number.isSafeInteger(backend.timeout_ms)&&backend.timeout_ms>0&&backend.timeout_ms<=3600000);
 }
 return options;
}
export function createPracticalReportingGraderCommand({settingsPath,spec,conditions,evidenceKind}){
 assert.equal(spec.grader,undefined,'choose reporting_grader or grader, not both');
 const options=validateOptions(spec.reporting_grader,spec.id,evidenceKind);
 const settings={kind:'practical_reporting_grader_settings_v1',fixture_id:spec.id,evidence_kind:evidenceKind,config:options.config,backend:options.backend,
  public_files:spec.files,task_commands:Object.fromEntries(conditions.map(c=>[c.id,c.command]))};
 const sourcePins=practicalReportingGraderPins(),authorityPins=['requirements','evidence_map','verification_contract'].map(key=>options.config[key]);
 const backendPins=options.backend.kind==='codex'?[options.backend.executable]:[];
 settings.source_pins=sourcePins;save(settingsPath,settings);
 return {argv:[process.execPath,join(import.meta.dirname,'practical-reporting-grader.mjs'),settingsPath,pin(settingsPath).digest,
  '{evaluation_control_root}','{evaluation_request_digest}','{evaluation_command_digest}','{evaluation_invocation_digest}','{evaluation_command_role}'],
  pins:[pin(settingsPath),...sourcePins,...authorityPins,...backendPins,...spec.files.map(f=>({path:f.source,digest:f.digest}))],
  timeout_ms:options.backend.kind==='codex'?options.backend.timeout_ms*2+30000:30000,
  model_calls:options.backend.kind==='codex',provider_closure_path:'grade-reporting-provider.json'};
}

function captureCurrentTask(settings,controlRoot,requestDigest){
 const request=readJsonFileStrict(join(controlRoot,'request.json'));assert.equal(canonicalDigest(request),requestDigest,'reporting task request mismatch');
 assert.equal(request.input.row.case_id,settings.fixture_id);
 assert.equal(canonicalDigest(settings.public_files.map(({target,digest})=>({target,digest}))),request.input.row.public_input_digest,'reporting public input mismatch');
 const command=settings.task_commands[request.input.row.condition];assert.ok(command,'reporting task condition missing');
 assert.equal(readJsonFileStrict(join(controlRoot,'task-started.json')).command_digest,canonicalDigest(command),'reporting task command mismatch');
 const completion=readJsonFileStrict(join(controlRoot,'task-completion.json'));
 assert.equal(completion.ready_for_next_root,true);assert.equal(completion.process_group_closed,true);assert.equal(completion.exit_code,0);
 assert.equal(completion.signal,null);assert.equal(completion.timed_out,false);
 // No saved evidence is accepted from the profile. Capture only this attempt's
 // receipt-bound bytes; a missing/incomplete capture remains missing, not Fail.
 let capture=null,issue=null;
 const receiptPath=join(controlRoot,'task-codex-provider.json');
 if(existsSync(receiptPath)){
  const receipt=readJsonFileStrict(receiptPath);
  assert.equal(receipt.request_digest,requestDigest,'reporting receipt request mismatch');
  assert.equal(receipt.command_digest,canonicalDigest(command),'reporting receipt command mismatch');
  assert.equal(receipt.invocation_digest,canonicalDigest({request_digest:requestDigest,command_digest:canonicalDigest(command),role:'task'}),'reporting receipt invocation mismatch');
  assert.equal(command.provider_closure_path?.replaceAll('{evaluation_command_role}','task'),'task-codex-provider.json','reporting receipt was not selected by the task command');
  assert.equal(completion.provider_evidence_error,null,'reporting task provider evidence is invalid');
  assert.ok(completion.provider_observation,'reporting receipt was not accepted by the worker');
  assert.deepEqual(completion.provider_observation.artifacts,receipt.observation.artifacts,'reporting receipt artifacts differ from worker completion');
  try{capture=captureSavedCommandObservations({jsonl:bytes(join(controlRoot,'task-codex.stdout.jsonl')),receipt,expectedRequestDigest:requestDigest});}
  catch(error){issue=String(error.message).slice(0,1024);}
 }else issue='Receipt-bound task command observations are unavailable.';
 const answer=join(controlRoot,'workspace/workspace/review.json');
 for(const file of settings.public_files){assert.equal(pin(file.source).digest,file.digest,'reporting public source drift');
  if(file.target!=='workspace/review.json')assert.equal(pin(join(controlRoot,'workspace',file.target)).digest,file.digest,'reporting protected input changed');}
 // Omit only a closed literal cat of one instruction path. Compound, quoted,
 // multiline or unfamiliar bodies stay intact; this is not a shell parser.
 const pureInstructionRead=o=>typeof o.decoded_body==='string'&&
  /^cat (?:\.\/)?(?:[A-Za-z0-9_.-]+\/)*(?:SKILL\.md|review-signal-gate-map(?:\.[A-Za-z0-9_-]+)?)$/u.test(o.decoded_body);
 const observations=(capture?.observations??[]).filter(o=>!pureInstructionRead(o));
 const evidence={kind:'host_saved_task_observations_v1',saved_observation_capture_valid:capture!==null,required_commands_successful:false,
  binding:{protected_inputs_unchanged:true,answer_unchanged:true,answer_digest:existsSync(answer)?pin(answer).digest:null,receipt_request_matches:capture!==null,
   task_command_and_invocation_match:capture!==null,scope:'current task observations only; not source-loaded-at-execution or native/official acceptance'},
  observations,omitted_instruction_read_count:(capture?.observations.length??0)-observations.length,capture_issue:issue,coverage_caveats:capture?.coverage_caveats??['receipt_bound_observations_unavailable']};
 if(capture)save(join(controlRoot,'reporting-command-capture.json'),capture);
 const path=join(controlRoot,'reporting-task-evidence.json');save(path,evidence);return pin(path);
}
export async function runReportingCodexBackend(call,backend,session=executeCodexSession){
 assert.equal(process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED,'1','reporting model calls are not authorized');
 assert.equal(pin(backend.executable.path).digest,backend.executable.digest,'reporting backend executable drift');
 const argv=['exec','--sandbox','read-only','--ephemeral','--json','--skip-git-repo-check','--output-last-message',call.output,
  ...(call.model===null?[]:['--model',call.model]),...(call.reasoning===null?[]:['--config','model_reasoning_effort='+JSON.stringify(call.reasoning)]),'-'];
 const r=await session({executable:backend.executable.path,argv,cwd:call.cwd,input:call.prompt,timeoutMs:backend.timeout_ms,terminationScope:'direct_child'});
 for(const [name,value] of [['stdout.jsonl',r.stdout??Buffer.alloc(0)],['stderr.log',r.stderr??Buffer.alloc(0)]]){
  writeFileSync(join(dirname(call.output),name),value,{flag:'wx',mode:0o600});
 }
 const clean=r.spawnObserved===true&&r.terminationConfirmed===true&&r.exitCode===0&&!r.signal&&!r.error&&!r.timedOut&&!r.interrupted&&!r.outputLimited;
 const stdout=Buffer.from(r.stdout??'').toString('utf8'),telemetry=parseUserCodexTelemetry(stdout);
 let events=[];try{events=stdout.trim().split(/\r?\n/u).map(line=>JSON.parse(line));}catch{/* Malformed transport cannot establish completion. */}
 const validEvents=events.length>0&&events.every(event=>event&&typeof event==='object'&&!Array.isArray(event)&&
  ['thread.started','turn.started','item.started','item.updated','item.completed','turn.completed'].includes(event.type));
 const completed=clean&&validEvents&&events.at(-1)?.type==='turn.completed'&&telemetry.errors.length===0&&!telemetry.interaction&&existsSync(call.output);
 return {terminal:clean||r.spawnObserved===false&&r.terminationConfirmed===true,completed,
  text:completed?bytes(call.output).toString('utf8'):null,metrics:telemetry.metrics,model:telemetry.model??call.model,
  provider_duration_ms:r.durationMs??null,reported_errors:telemetry.errors,interaction:telemetry.interaction,
  usage_lower_bound:telemetry.usage_lower_bound,complete_cost:null};
}
export async function executePracticalReportingGrader({settings,controlRoot,requestDigest,commandDigest,invocationDigest,role},backendOverride){
 assert.equal(settings.kind,'practical_reporting_grader_settings_v1');assert.equal(role,'grade');
 for(const digest of [requestDigest,commandDigest,invocationDigest])assert.match(digest,/^sha256:[a-f0-9]{64}$/u);
 assert.equal(invocationDigest,canonicalDigest({request_digest:requestDigest,command_digest:commandDigest,role}));
 assert.equal(resolve(controlRoot),controlRoot);assertNoSymlinkPathSegments(controlRoot,'reporting control root');
 validateOptions({kind:'caller_reference_reporting_v3',config:settings.config,backend:settings.backend},settings.fixture_id,settings.evidence_kind);
 for(const source of settings.source_pins)assert.equal(pin(source.path).digest,source.digest,'reporting source drift');
 if(settings.backend.kind==='codex')assert.equal(process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED,'1','reporting model calls are not authorized');
 const saved_evidence=captureCurrentTask(settings,controlRoot,requestDigest);
 const capsuleRoot=join(controlRoot,'reporting-capsules'),replyRoot=join(controlRoot,'reporting-replies');
 mkdirSync(capsuleRoot,{mode:0o700});mkdirSync(replyRoot,{mode:0o700});
 const backend=backendOverride??(settings.backend.kind==='fixture'?async call=>({terminal:true,completed:true,text:JSON.stringify(settings.backend.replies[call.role]),
  metrics:{input_tokens:0,output_tokens:0,cached_tokens:0},model:'synthetic-no-model'}):call=>runReportingCodexBackend(call,settings.backend));
 return evaluatePrimaryGrade({fixtureId:settings.fixture_id,workspace:join(controlRoot,'workspace'),publicFiles:settings.public_files,controlRoot,
  config:{...settings.config,saved_evidence,capsuleRoot,replyRoot,output_path:'workspace/review.json',
   command_evidence_requirement_ids:['verification-conclusion']}},backend);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [settingsPath,expected,controlRoot,requestDigest,commandDigest,invocationDigest,role]=process.argv.slice(2);
 let result;
 try{assert.equal(pin(settingsPath).digest,expected,'reporting settings drift');
  result=await executePracticalReportingGrader({settings:readJsonFileStrict(settingsPath),controlRoot,requestDigest,commandDigest,invocationDigest,role});
 }catch(error){result={terminal:!existsSync(join(controlRoot,'private-grade/dispatch.json')),issue:String(error.message).slice(0,2048),metrics:{input_tokens:null,output_tokens:null,cached_tokens:null},artifacts:[],quality:{kind:'practical_quality_observation_v1',scope:'source_reference',outcome:'unknown',fixed_reference:null,evidence_refs:[]}};}
 save(join(controlRoot,'grade-reporting-provider.json'),{kind:'practical_reporting_provider_receipt_v1',request_digest:requestDigest,command_digest:commandDigest,invocation_digest:invocationDigest,
  terminal:result.terminal,provider_ref:'caller-reference-reporting:'+invocationDigest,issue:result.issue,
  observation:{kind:'provider_observation_v1',scope:'source_reference',metrics:result.metrics,artifacts:result.artifacts,...(result.quality?{quality:result.quality}:{})}});
 process.exitCode=result.terminal?0:1;
}
