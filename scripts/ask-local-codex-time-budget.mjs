import { spawn } from "node:child_process";
import { canonicalDigest, parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { terminateResidualAgentProcessGroup } from "./ask-benchmark-execution.mjs";

import { CODEX_TIME_POLICY } from "./ask-local-codex-time-policy.mjs";
export { CODEX_TIME_POLICY } from "./ask-local-codex-time-policy.mjs";
export function assertTimePolicy(policy) {
  if (canonicalDigest(policy)!==canonicalDigest(CODEX_TIME_POLICY)) throw new Error("closed time policy required");
}
const DRAIN_MS=2000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const itemTypes=new Set(["agent_message","reasoning","command_execution","file_change","mcp_tool_call","web_search","todo_list","error"]);
// Pinned CLI startup warnings only. Everything else is fatal; text is not saved here.
function startupWarning(item) {
  return item.type==="error" && typeof item.message==="string" && (
    item.message==="Model metadata for `gpt-6.1-sol` not found. Defaulting to fallback metadata; this can degrade performance and cause issues."
    || /^`\[features\]\.memory_tool` is deprecated\. Use `\[features\]\.memories` instead\. \(Enable it with `--enable memories` or `\[features\]\.memories` in config\.toml\. See https:\/\/(?:github\.com\/openai\/codex\/blob\/main\/docs\/config\.md|developers\.openai\.com\/codex\/config-basic)#feature-flags for details\.\)$/u.test(item.message));
}

/** Receive-time control, not an authentication/model-readiness attestation. */
export function turnBudget({policy=CODEX_TIME_POLICY,now,absoluteMs=policy.absolute_ms}) {
  assertTimePolicy(policy);
  if (!Number.isFinite(absoluteMs)||absoluteMs<=0||absoluteMs>policy.absolute_ms) throw new Error("invalid absolute cap");
  const t0=now(); let previous=t0, thread=null, ready=null, complete=false, stop=null;
  const elapsed=()=>{const value=now();if(!Number.isFinite(value)||value<previous)throw new Error("invalid monotonic clock");previous=value;return value-t0;};
  const deadline=()=>Math.min(absoluteMs,ready===null?policy.startup_ms:ready+policy.task_ms);
  function check() {
    const ms=elapsed();
    if(stop===null && ms>=deadline()) stop=ms>=absoluteMs?"absolute_timeout":ready===null?"startup_timeout":"task_timeout";
    return ms;
  }
  const fail=reason=>{if(stop===null)stop=reason;};
  function event(row) {
    const ms=check();if(stop!==null)return;
    if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.type!=="string")return fail("invalid_event");
    if(row.type==="thread.started") {
      if(thread!==null||ready!==null||Object.keys(row).sort().join(",")!=="thread_id,type"||!uuid.test(row.thread_id??""))return fail("ambiguous_thread");
      thread=row.thread_id;return;
    }
    if(row.type==="turn.started") {
      if(thread===null||ready!==null||Object.keys(row).join(",")!=="type")return fail("ambiguous_turn_start");
      ready=ms;return;
    }
    if(complete)return fail("event_after_completion");
    if(["item.started","item.updated","item.completed"].includes(row.type)) {
      const item=row.item;
      if(!item||!itemTypes.has(item.type))return fail("unknown_item");
      if(item.type==="error")return startupWarning(item)?undefined:fail("cli_error");
      if(ready===null)return fail("task_event_before_start");
      return;
    }
    if(row.type==="turn.completed") {
      if(ready===null)return fail("completion_before_start");
      complete=true;return;
    }
    return fail(["error","turn.failed"].includes(row.type)?"cli_error":"unknown_event");
  }
  return {event,check,fail,remaining:()=>Math.max(0,deadline()-check()),
    finish(){check();if(stop===null&&(ready===null||!complete))fail("missing_completion_event");},
    evidence(){return {kind:"codex_turn_budget_evidence_v1",policy_digest:canonicalDigest(policy),
      clock:policy.clock,absolute_cap_ms:absoluteMs,elapsed_ms:check(),start_received_ms:ready,
      thread_id:thread,completion_received:complete,stop};}};
}

/** Bounded one-child monitor; no shell, session tailer, retry or extra CLI invocation. */
export function executeTurnBudgetAgent(executable,args,{policy=CODEX_TIME_POLICY,input,cwd,env,maxBuffer,
  simulationAbsoluteMs=null}={}) {
  const clock=()=>Number(process.hrtime.bigint())/1e6;
  const control=turnBudget({policy,now:clock,absoluteMs:simulationAbsoluteMs??policy.absolute_ms});
  return new Promise(resolve=>{
    let child, timer, drainTimer, finished=false, killed=false, forcedDrain=false, exitedStatus=null,exitedSignal=null, error=null, partial="", stdoutBytes=0,stderrBytes=0;
    const out=[],err=[],decoder=new TextDecoder("utf-8",{fatal:true});
    const fail=reason=>{if(finished)return;control.fail(reason);kill();};
    function kill(){
      if(finished||killed)return;killed=true;
      drainTimer=setTimeout(()=>{
        if(finished)return;forcedDrain=true;
        child?.stdin.destroy();child?.stdout.destroy();child?.stderr.destroy();child?.unref();
        finish(exitedStatus,exitedSignal);
      },DRAIN_MS);
      if(child?.pid)try{process.kill(-child.pid,"SIGKILL");}catch(e){if(e.code!=="ESRCH")error=e;}
    }
    function arm(){if(finished)return;clearTimeout(timer);control.check();if(control.evidence().stop!==null){kill();return;}timer=setTimeout(arm,Math.max(1,Math.ceil(control.remaining())));}
    function finish(status,signal){
      if(finished)return;finished=true;clearTimeout(timer);clearTimeout(drainTimer);
      try{partial+=decoder.decode();if(partial.length)control.fail("incomplete_json_line");}catch{control.fail("invalid_utf8");}
      control.finish();const evidence={...control.evidence(),drain_limit_ms:DRAIN_MS,drain_status:forcedDrain?"forced_unknown":"closed"};
      if(evidence.stop!==null&&!error)error=Object.assign(new Error(evidence.stop),{code:evidence.stop.endsWith("timeout")?"ETIMEDOUT":evidence.stop==="output_limit"?"ENOBUFS":"EPROTO"});
      let residual=forcedDrain,cleanup=forcedDrain;
      try{residual=terminateResidualAgentProcessGroup(child?.pid)||residual;}catch{residual=true;cleanup=true;}
      resolve({pid:child?.pid,status,signal,error,stdout:Buffer.concat(out),stderr:Buffer.concat(err),
        workspace_descendants_detected:residual,cleanup_error:cleanup,time_budget:evidence});
    }
    try{const oldMask=process.umask(0o077);
      try{child=spawn(executable,args,{cwd,env,stdio:["pipe","pipe","pipe"],detached:true});}
      finally{process.umask(oldMask);}}
    catch(e){error=e;control.fail("spawn_failure");finish(null,null);return;}
    child.on("error",e=>{if(finished)return;error=e;control.fail("spawn_failure");});
    child.stdin.on("error",()=>fail("stdin_failure"));
    child.stdout.on("data",chunk=>{
      if(finished)return;control.check();if(control.evidence().stop!==null){kill();return;}
      const available=Math.max(0,maxBuffer-stdoutBytes);out.push(chunk.subarray(0,available));stdoutBytes+=chunk.length;
      if(stdoutBytes>maxBuffer)return fail("output_limit");
      try{
        partial+=decoder.decode(chunk,{stream:true});
        let newline;
        while((newline=partial.indexOf("\n"))!==-1){const line=partial.slice(0,newline);partial=partial.slice(newline+1);
          if(Buffer.byteLength(line)>65536)throw new Error("line limit");
          control.event(parseJsonRejectDuplicateKeys(line));if(control.evidence().stop!==null){kill();return;}}
        if(Buffer.byteLength(partial)>65536)throw new Error("line limit");
      }catch{fail("invalid_json_stream");return;}
      arm();
    });
    child.stderr.on("data",chunk=>{if(finished)return;control.check();const available=Math.max(0,maxBuffer-stderrBytes);err.push(chunk.subarray(0,available));stderrBytes+=chunk.length;if(stderrBytes>maxBuffer)fail("output_limit");else if(control.evidence().stop!==null)kill();});
    child.on("exit",(status,signal)=>{if(finished)return;exitedStatus=status;exitedSignal=signal;control.check();if(control.evidence().stop!==null)kill();});
    child.on("close",finish);
    arm();child.stdin.end(input);
  });
}
