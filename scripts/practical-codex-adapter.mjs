// Standard public-task port. Preparation never starts or authenticates Codex.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalDigest,readStableBytes,readJsonFileStrict,writeCanonicalJsonNoReplace,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionPath} from './instruction-projection-paths.mjs';
import {instructionBytesDigest as hash} from './instruction-environment.mjs';
import {executeCodexSession} from './codex-exec-runner.mjs';
import {parseUserCodexTelemetry,sanitizeComparisonLog} from './ask-user-comparison.mjs';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
const digest=/^sha256:[a-f0-9]{64}$/u;
const counters=['input_tokens','output_tokens','cached_tokens'];
const pin=path=>({path,digest:hash(readStableBytes(path,'standard Codex adapter source',16*1024*1024))});
export function validateCodexPracticalOptions(o){
 assert.ok(o&&Object.keys(o).every(k=>['executable','model','reasoning','task_file','timeout_ms'].includes(k)));
 assert.equal(resolve(o.executable),o.executable,'absolute Codex executable required');
 for(const k of ['model','reasoning'])assert.ok(o[k]===null||typeof o[k]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(o[k]),'explicit model/reasoning or null required');
 instructionPath(o.task_file);assert.ok(Number.isSafeInteger(o.timeout_ms)&&o.timeout_ms>0&&o.timeout_ms<=24*60*60*1000-5000);
 return o;
}
export function validatePracticalModelConditions(p){
 for(const c of Object.values(p.practical.conditions??{}))if(c.codex){
  assert.equal(c.command,undefined,'choose codex or a caller command, not both');validateCodexPracticalOptions(c.codex);
  assert.ok(c.command_role==null||c.command_role==='task','Codex CLI completion is task evidence; use a separate grader');
  assert.equal(c.context.model,c.codex.model);assert.equal(c.context.reasoning,c.codex.reasoning);
  assert.ok(p.adapter==null||p.adapter==='codex','standard Codex trial requires a Codex instruction environment');
  for(const spec of p.practical.cases)assert.ok(spec.files.some(f=>f.target===c.codex.task_file),'Codex task_file must be in every case public input inventory');
 }
}
export function createCodexPracticalCommand({settingsPath,options,evidenceKind}){
 validateCodexPracticalOptions(options);assert.ok(['synthetic','observed'].includes(evidenceKind));
 settingsPath=resolve(settingsPath);const settings={kind:'practical_codex_settings_v1',...options,evidence_kind:evidenceKind};
 writeCanonicalJsonNoReplace({outputPath:settingsPath,artifact:settings,label:'standard Codex settings'});
 const source=join(import.meta.dirname,'practical-codex-adapter.mjs');
 return {argv:[process.execPath,source,settingsPath,pin(settingsPath).digest,'{evaluation_control_root}',
  '{evaluation_request_digest}','{evaluation_command_digest}','{evaluation_invocation_digest}','{evaluation_command_role}'],
  pins:[pin(settingsPath),...['practical-codex-adapter.mjs','codex-exec-runner.mjs','ask-user-comparison.mjs','content-addressed-store.mjs','ask-benchmark-stable-file.mjs','ask-benchmark-atomic-publication.mjs'].map(n=>pin(join(import.meta.dirname,n)))],
  model_calls:true,timeout_ms:options.timeout_ms+5000,provider_closure_path:'{evaluation_command_role}-codex-provider.json'};
}
function bytes(path,data){const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,data);fsyncSync(fd);}finally{closeSync(fd);}}
export async function executeCodexPracticalAdapter({settings,controlRoot,requestDigest,commandDigest,invocationDigest,role},session=executeCodexSession){
 assert.equal(process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED,'1','standard Codex model calls not authorized');
 assert.equal(settings.kind,'practical_codex_settings_v1');validateCodexPracticalOptions(Object.fromEntries(['executable','model','reasoning','task_file','timeout_ms'].map(k=>[k,settings[k]])));
 assert.ok(['synthetic','observed'].includes(settings.evidence_kind));assert.ok(['task','grade'].includes(role));
 for(const d of [requestDigest,commandDigest,invocationDigest])assert.match(d,digest);
 assert.equal(controlRoot,resolve(controlRoot));assertNoSymlinkPathSegments(controlRoot,'owned evaluation control root');
 mkdirSync(join(controlRoot,role+'-codex-dispatch'),{mode:0o700});
 let attempted=false,r;
 try{
  const input=readStableBytes(join(process.cwd(),settings.task_file),'approved public task',2*1024*1024).toString('utf8');
  const argv=['exec','--sandbox','workspace-write','--json','--skip-git-repo-check','--output-last-message',join(controlRoot,role+'-codex-last-message.txt'),
   ...(settings.model===null?[]:['--model',settings.model]),...(settings.reasoning===null?[]:['--config','model_reasoning_effort='+JSON.stringify(settings.reasoning)]),'-'];
  attempted=true;r=await session({executable:settings.executable,argv,cwd:process.cwd(),input,timeoutMs:settings.timeout_ms,terminationScope:'direct_child'});
 }catch(error){r={spawnObserved:attempted?null:false,terminationConfirmed:!attempted,exitCode:null,error:{message:sanitizeComparisonLog(error.message).slice(0,2048)},stdout:Buffer.alloc(0),stderr:Buffer.alloc(0),durationMs:null};}
 const telemetry=parseUserCodexTelemetry(Buffer.from(r.stdout??'').toString('utf8'));
 const clean=r.spawnObserved===true&&r.terminationConfirmed===true&&r.exitCode===0&&!r.error&&!r.timedOut&&!r.interrupted&&!r.outputLimited;
 const terminal=clean||r.spawnObserved===false&&r.terminationConfirmed===true;
 const artifacts=[];
 for(const [suffix,data] of [['stdout.jsonl',r.stdout??Buffer.alloc(0)],['stderr.log',r.stderr??Buffer.alloc(0)]]){
  const path=role+'-codex.'+suffix;bytes(join(controlRoot,path),data);artifacts.push({path,digest:hash(data)});
 }
 const message=role+'-codex-last-message.txt';if(existsSync(join(controlRoot,message)))artifacts.push({path:message,digest:hash(readStableFile(join(controlRoot,message),'Codex final message',10*1024*1024).bytes)});
 const metrics=Object.fromEntries(counters.map(k=>[k,clean?telemetry.metrics[k]:null]));
 const receipt={kind:'practical_codex_provider_receipt_v1',request_digest:requestDigest,command_digest:commandDigest,invocation_digest:invocationDigest,
  terminal,provider_ref:telemetry.session_id??'codex-invocation:'+invocationDigest,session_id:telemetry.session_id,
  evidence_kind:settings.evidence_kind,declared_model:settings.model,observed_model:telemetry.model,reasoning:settings.reasoning,
  local:{spawn_observed:r.spawnObserved,termination_confirmed:r.terminationConfirmed,exit_code:r.exitCode,error:r.error??null,timed_out:r.timedOut??false,interrupted:r.interrupted??false,output_limited:r.outputLimited??false},
  observation:{kind:'provider_observation_v1',scope:'root_turn_completed_only',metrics,artifacts,
   known_usage_lower_bound:telemetry.usage_lower_bound,provider_duration_ms:r.durationMs??null,complete_cost:null},
  reported_errors:telemetry.errors,authentication_verified:false};
 writeCanonicalJsonNoReplace({outputPath:join(controlRoot,role+'-codex-provider.json'),artifact:receipt,label:'Codex provider receipt',maximumBytes:2*1024*1024});
 return {completed:clean&&telemetry.errors.length===0,terminal,models_started:r.spawnObserved===true,receipt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [settingsPath,expected,controlRoot,requestDigest,commandDigest,invocationDigest,role]=process.argv.slice(2);
 try{assert.equal(pin(settingsPath).digest,expected,'standard Codex settings drift');
  const result=await executeCodexPracticalAdapter({settings:readJsonFileStrict(settingsPath),controlRoot,requestDigest,commandDigest,invocationDigest,role});process.exitCode=result.completed?0:1;
 }catch(error){console.error('standard Codex adapter: '+sanitizeComparisonLog(error.message));process.exitCode=1;}
}
