import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,lstatSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CODEX_TIME_POLICY,turnBudget,executeTurnBudgetAgent} from "./ask-local-codex-time-budget.mjs";
const id="00000000-0000-4000-8000-000000000001";
const thread={type:"thread.started",thread_id:id},start={type:"turn.started"},done={type:"turn.completed",usage:{input_tokens:10,output_tokens:2}};
function state(cap=240000){let ms=0;const control=turnBudget({now:()=>ms,absoluteMs:cap});return {control,set:x=>{ms=x;}};}
const warningUrls=["https://github.com/openai/codex/blob/main/docs/config.md#feature-flags","https://developers.openai.com/codex/config-basic#feature-flags"];
const memoryWarning=url=>"`[features].memory_tool` is deprecated. Use `[features].memories` instead. (Enable it with `--enable memories` or `[features].memories` in config.toml. See "+url+" for details.)";
const warningEvent=message=>({type:"item.completed",item:{type:"error",message}});
for(const url of warningUrls)test(`known memory warning URL permits normal turn: ${url}`,()=>{
  const {control:c,set}=state();set(81000);c.event(thread);c.event(warningEvent(memoryWarning(url)));
  assert.equal(c.evidence().stop,null);assert.equal(c.evidence().start_received_ms,null);
  c.event(start);c.event(done);c.finish();assert.equal(c.evidence().stop,null);assert.equal(c.evidence().start_received_ms,81000);
});
for(const message of [
  memoryWarning("https://example.invalid/config#feature-flags"),
  memoryWarning(warningUrls[1]+"/extra"),
  memoryWarning(warningUrls[1]).replace("memory_tool","other_tool"),
  memoryWarning(warningUrls[1])+"\nProvider unavailable",
  "Provider unavailable: "+memoryWarning(warningUrls[1]),
  memoryWarning(warningUrls[1])+"\n",
])test(`changed or compound memory warning remains fatal: ${JSON.stringify(message)}`,()=>{
  const {control:c}=state();c.event(thread);c.event(warningEvent(message));assert.equal(c.evidence().stop,"cli_error");
});
test("known memory warning cannot mask a later fatal error",()=>{
  const {control:c}=state();c.event(thread);c.event(warningEvent(memoryWarning(warningUrls[1])));
  c.event(warningEvent("Provider unavailable"));assert.equal(c.evidence().stop,"cli_error");
});
test("startup overhead does not subtract from task budget; cap is absolute",()=>{
  const {control:c,set}=state();set(81000);c.event(thread);c.event(start);
  set(200999);assert.equal(c.evidence().stop,null);set(201000);assert.equal(c.evidence().stop,"task_timeout");
  assert.equal(c.evidence().start_received_ms,81000);
});
for(const [ready,at,reason] of [[null,120000,"startup_timeout"],[119999,239999,"task_timeout"],[null,240000,"absolute_timeout"]])test(`deadline exact boundary ${reason}/${at}`,()=>{
  const {control:c,set}=state();if(ready!==null){set(ready);c.event(thread);c.event(start);}set(at);c.check();assert.equal(c.evidence().stop,reason);
});
test("late callback cannot accept a delayed start; event timestamps do not extend budgets",()=>{
  const {control:c,set}=state();c.event(thread);set(120000);c.event({...start,timestamp:"2020-01-01"});assert.equal(c.evidence().stop,"startup_timeout");
});
for(const [events,reason] of [
  [[start],"ambiguous_turn_start"],[[thread,thread],"ambiguous_thread"],[[thread,start,start],"ambiguous_turn_start"],
  [[{...thread,thread_id:"wrong"}],"ambiguous_thread"],[[thread,done],"completion_before_start"],
  [[thread,{type:"item.completed",item:{type:"agent_message",text:"fake turn.started"}}],"task_event_before_start"],
  [[thread,start,{type:"unknown"}],"unknown_event"],[[thread,start,{type:"item.completed",item:{type:"unknown"}}],"unknown_item"],
  [[thread,start,{type:"error"}],"cli_error"],[[thread,start,done,done],"event_after_completion"]])test(`fail-stop ${reason}`,()=>{
  const {control:c}=state();for(const e of events)c.event(e);assert.equal(c.evidence().stop,reason);
});
test("embedded JSON text is not a control event",()=>{
  const {control:c}=state();c.event(thread);c.event(start);c.event({type:"item.completed",item:{type:"agent_message",text:JSON.stringify(start)}});c.event(done);c.finish();assert.equal(c.evidence().stop,null);
});
test("missing completion and invalid monotonic clock fail closed",()=>{
  const {control:c,set}=state();c.event(thread);c.event(start);c.finish();assert.equal(c.evidence().stop,"missing_completion_event");
  const x=state();x.set(-1);assert.throws(()=>x.control.check(),/monotonic/);
});
test("pinned fallback metadata warning is allowed but arbitrary error is not",()=>{
  const {control:c}=state();c.event(thread);c.event({type:"item.completed",item:{type:"error",message:"Model metadata for `gpt-6.1-sol` not found. Defaulting to fallback metadata; this can degrade performance and cause issues."}});c.event(start);c.event(done);c.finish();assert.equal(c.evidence().stop,null);
});
function child(code,extra={}) {return executeTurnBudgetAgent(process.execPath,["-e",code],{cwd:process.cwd(),env:{},input:Buffer.from("owned"),maxBuffer:1048576,...extra});}
const events=JSON.stringify([thread,start,done].map(x=>JSON.stringify(x)).join("\n")+"\n");
test("stream splits, stdin, normal exit and usage bytes are preserved",async()=>{
  const r=await child(`process.stdin.resume();process.stdin.on('end',()=>{const s=${events};process.stdout.write(s.slice(0,17));setTimeout(()=>process.stdout.write(s.slice(17)),5);});`);
  assert.equal(r.status,0);assert.equal(r.error,null);assert.equal(r.time_budget.stop,null);assert.equal(r.stdout.toString(),JSON.parse(events));assert.equal(r.workspace_descendants_detected,false);
});
for(const [text,expected] of [['{"type":"turn.started","type":"turn.started"}\n',"invalid_json_stream"],[JSON.stringify(thread),"incomplete_json_line"],[JSON.stringify(thread)+"\n"+JSON.stringify(start)+"\n"+JSON.stringify(start)+"\n","ambiguous_turn_start"]])test(`stream rejects ${expected}`,async()=>{
  const r=await child(`process.stdout.write(${JSON.stringify(text)});`);assert.equal(r.time_budget.stop,expected);assert.ok(r.error);
});
test("invalid utf8 and output overflow terminate the group",async()=>{
  const utf=await child("process.stdout.write(Buffer.from([255,10]));");assert.equal(utf.time_budget.stop,"invalid_json_stream");
  const huge=await child("process.stdout.write('x'.repeat(2048));",{maxBuffer:1000});assert.equal(huge.error.code,"ENOBUFS");assert.equal(huge.stdout.length,1000);
});
test("startup with no events times out, never retries",async()=>{
  const r=await child("setInterval(()=>{},1000);",{simulationAbsoluteMs:100});assert.equal(r.error.code,"ETIMEDOUT");assert.equal(r.time_budget.stop,"absolute_timeout");assert.equal(r.signal,"SIGKILL");assert.equal(r.workspace_descendants_detected,false);
});
test("spawn failure remains terminal",async()=>{
  const r=await executeTurnBudgetAgent("/does-not-exist",[],{cwd:process.cwd(),env:{},input:Buffer.from("owned"),maxBuffer:1024});assert.ok(r.error);assert.equal(r.time_budget.stop,"spawn_failure");
});

test("child inherits owner-only umask and caller mask is restored",async t=>{
  const directory=mkdtempSync(join(tmpdir(),"ask-turn-mask-"));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const before=process.umask();
  const r=await child(`require('node:fs').writeFileSync(${JSON.stringify(join(directory,"owned"))},'owned');process.stdout.write(${events});`);
  assert.equal(r.error,null);assert.equal(lstatSync(join(directory,"owned")).mode&0o777,0o600);assert.equal(process.umask(),before);
});
test("ignored-stdio grandchild prevents acceptance even when cleanup is unknown",async()=>{
  const r=await child(`require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}).unref();process.stdout.write(${events});`);
  assert.equal(r.workspace_descendants_detected,true);
  // A killed process group may remain visible until the host reaps it. Either
  // confirmed cleanup or explicit cleanup-unknown must retain the rejection.
  assert.equal(typeof r.cleanup_error,"boolean");
  const acceptable=r.status===0&&!r.error&&!r.signal&&!r.workspace_descendants_detected;
  assert.equal(acceptable,false);
});
test("inherited-stdio grandchild cannot hold close open beyond absolute cap",async()=>{
  const r=await child(`require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'}).unref();process.stdout.write(${events});`,{simulationAbsoluteMs:300});
  assert.equal(r.time_budget.stop,"absolute_timeout");assert.equal(r.error.code,"ETIMEDOUT");assert.ok(r.time_budget.elapsed_ms>=300);
});
test("child closing stdin before input is consumed fails closed",async()=>{
  const r=await executeTurnBudgetAgent(process.execPath,['-e',`process.stdin.destroy();process.stdout.write(${events});`],{cwd:process.cwd(),env:{},input:Buffer.alloc(1024*1024),maxBuffer:1048576});
  assert.equal(r.time_budget.stop,"stdin_failure");assert.ok(r.error);
});

test("escaped pipe holder is bounded and explicitly cleanup unknown",{timeout:10000},async t=>{
  const directory=mkdtempSync(join(tmpdir(),"ask-turn-drain-")),pidFile=join(directory,"owned-pid");
  t.after(()=>{try{const pid=Number(readFileSync(pidFile,"utf8"));if(Number.isInteger(pid)&&pid>0)process.kill(-pid,"SIGKILL");}catch(e){if(e.code!=="ESRCH"&&e.code!=="ENOENT")throw e;}rmSync(directory,{recursive:true,force:true});});
  const code=`const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},4500)'],{detached:true,stdio:'inherit'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(c.pid),{mode:384});c.unref();process.stdout.write(${events});`;
  const r=await child(code,{simulationAbsoluteMs:300});
  assert.equal(r.time_budget.stop,"absolute_timeout");assert.equal(r.time_budget.drain_status,"forced_unknown");
  assert.equal(r.cleanup_error,true);assert.equal(r.workspace_descendants_detected,true);assert.equal(r.error.code,"ETIMEDOUT");
  assert.ok(r.time_budget.elapsed_ms>=2300);assert.ok(r.time_budget.elapsed_ms<6000);
});
