import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, linkSync, symlinkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { INLINE_CANARY_MODULE_SOURCE, controlCanaryArguments } from "./local-codex-probe-worker.mjs";
import { prepareCodexConnection, runCodexConnection, reopenCodexConnection, codexTrialLaunch, codexProbeLaunches, assertConnectionPermissionShape,
  runCodexProbes, reopenCodexProbes, evaluateCodexConnection, codexPhasePermission, freshAdmissionTime, codexConnectionCommand, codexProbeParentPolicy, assertNativeAdmissionRoute, codexLightweightPolicy, codexLightweightControlLaunch, readCodexTrialSession, DECLARED_READ_POLICY, READ_POLICY_RISK } from "./ask-local-codex.mjs";
import {inspectExistingCodexHome, classifyDenial, assertCanaryResult, probeSeatbelt, assertNoAclListing, assertProbeSandboxArgs, declaredSessionEntries} from "./ask-local-codex-boundaries.mjs";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { parsePilotNativeSession, pilotEvidenceInventory, pilotWorkspaceInventory, gradePilotWorkspace } from "./ask-synthetic-json-pilot.mjs";
import { codexTrialTiming } from "./ask-local-codex-timing.mjs";

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "ask-local-codex.mjs");
const TRIAL_THREAD = "00000000-0000-4000-8000-000000000001";
test("temporary environment stays inside each existing writable workspace",t=>{
  const {plan,base}=prepared(t);
  for(const launch of [codexTrialLaunch(plan,base,"plain"),codexTrialLaunch(plan,base,"kernel_only"),codexProbeLaunches(plan,base,[])[3]]) {
    for(const key of ["TMPDIR","TMP","TEMP"])assert.equal(launch.env[key],join(launch.cwd,".ask-tmp"));
    assert.equal(launch.env.CODEX_HOME,launch.cwd.endsWith("plain") || launch.cwd.endsWith("kernel_only") ? plan.codex_home : launch.env.HOME);
  }
  assert.equal(plan.constraints.timeout_ms,120000);assert.equal(plan.constraints.trial_tokens,30000);assert.equal(plan.constraints.cumulative_tokens,60000);
});
for(const variant of ["empty","leftover","link","replacement","removed","mode"])test(`temporary scratch grading rejects unsafe state: ${variant}`,t=>{
  const {dir}=prepared(t),workspace=join(dir,"scratch-grader"),scratch=join(workspace,".ask-tmp");
  mkdirSync(workspace,{mode:0o700});mkdirSync(scratch,{mode:0o700});
  const seeded=pilotWorkspaceInventory(workspace,{scratchDirectory:".ask-tmp"});
  if(variant==="leftover")writeFileSync(join(scratch,"leftover"),"synthetic",{mode:0o600});
  if(variant==="link") {rmSync(scratch,{recursive:true});symlinkSync(dir,scratch);}
  if(variant==="replacement") {const kept=join(dir,"original-scratch");renameSync(scratch,kept);mkdirSync(scratch,{mode:0o700});}
  if(variant==="removed")rmSync(scratch,{recursive:true});
  if(variant==="mode")chmodSync(scratch,0o755);
  const grade=gradePilotWorkspace({workspace,seeded,scratchDirectory:".ask-tmp"});
  if(variant==="empty") {assert.equal(grade.P3,true);assert.equal(grade.status,"fail");}
  else assert.notEqual(grade.status,"pass");
  if(variant!=="empty")assert.equal(grade.status,"boundary_fault");
  if(variant==="replacement")assert.equal(grade.P3,false);
});
for(const scenario of ["scratch-replaced","scratch-removed"])test(`temporary ${scenario} stops before the next trial`,t=>{
  const {privateRoot}=prepared(t,{scenarios:[scenario,"pass"]});
  const report=evaluateCodexConnection(privateRoot);
  assert.equal(report.slots[0].grade.reason,"scratch_directory_boundary");assert.equal(report.stop,"workspace_boundary_fault");
  assert.equal(report.slots[1].state,"not_started");assert.deepEqual(reopenCodexConnection(privateRoot),report);
});
for(const readPolicy of [false,true])for(const probeOutcome of ["temporary-fail","temporary-unknown","temporary-diagnostics-missing","temporary-diagnostics-inconsistent","legacy-temporary","legacy-diagnostics","stderr-classification-missing"])test(`temporary control ${probeOutcome} stops both ${readPolicy?"declared":"closed"} trials`,t=>{
  const {privateRoot}=prepared(t,{readPolicy:readPolicy?true:undefined,probeOutcome});
  const report=evaluateCodexConnection(privateRoot);
  assert.equal(report.stop,"model_free_preflight_failed");assert.deepEqual(report.slots.map(s=>s.state),["not_started","not_started"]);
  assert.equal(report.preflight.outcomes.length,1);assert.deepEqual(reopenCodexConnection(privateRoot),report);
});
for(const outcome of ["pass","denied","unknown","cleanup","env"])test(`temporary inline control uses mocked filesystem and shell: ${outcome}`,async()=>{
  const temporaryDirectory="/synthetic-workspace/.ask-tmp",spec={publicFile:"public",allowedWrite:"write",deniedReads:["private"],deniedWrite:"other",temporaryDirectory,shell:"/synthetic-shell",endpoints:[{host:"127.0.0.1"},{host:"::1"}]};
  const env=Object.fromEntries(["TMPDIR","TMP","TEMP"].map(k=>[k,outcome==="env"?"/wrong":temporaryDirectory]));
  let output="",shellCalls=0;const files=new Map(),removed=[];
  const module=INLINE_CANARY_MODULE_SOURCE.replace(/^import .*;\n/gmu,"");
  await runInNewContext(`(async()=>{${module}})()`,{
    Buffer,createHash,process:{env,argv:["node",JSON.stringify(spec)],stdout:{write:x=>{output+=x;}}},
    readFileSync:p=>p==="public"?"ASK_PUBLIC_CANARY\n":files.get(p),writeFileSync:(p,v)=>files.set(p,v),
    openSync:()=>{throw Object.assign(Error("mock denied"),{code:"EPERM"});},closeSync:()=>{},
    mkdtempSync:p=>p+"unique",unlinkSync:p=>{files.delete(p);removed.push(p);},rmdirSync:p=>{removed.push(p);if(outcome==="cleanup")throw Error("mock cleanup");},
    spawnSync:(shell,args,options)=>{shellCalls++;assert.equal(shell,spec.shell);assert.equal(options.env,env);assert.match(args[1],/cat <<'ASK_TEMP_END'/u);if(outcome==="unknown")throw Error("mock launch");return {status:outcome==="denied"?1:0,stdout:args[1].split("\n")[1]+"\n",stderr:outcome==="denied"?"mock denied":"",signal:null};},
    createConnection:()=>{const socket=new EventEmitter();socket.destroy=()=>{};socket.setTimeout=()=>{};queueMicrotask(()=>socket.emit("error",{code:"EPERM"}));return socket;},
  });
  const result=JSON.parse(output);
  if(outcome==="pass")assertCanaryResult(result,{temporary:true,diagnostics:true,stderrClassification:true});else assert.throws(()=>assertCanaryResult(result,{temporary:true,diagnostics:true,stderrClassification:true}),/canary failure/u);
  assert.equal(shellCalls,outcome==="env"?0:1);assert.equal(files.has(temporaryDirectory+"/canary-unique/roundtrip.txt"),false);
  if(outcome!=="env")assert.equal(removed.length,2);
});
test("advisory timing distinguishes answer, final response and complete/incomplete events without contents",()=>{
  const started="2030-01-01T00:00:00.000Z",completed="2030-01-01T00:00:10.000Z";
  const row=(ms,type,payload)=>({timestamp:new Date(Date.parse(started)+ms).toISOString(),type,payload});
  const rows=[row(500,"session_meta",{}),row(700,"event_msg",{type:"task_started"}),row(900,"response_item",{type:"function_call",arguments:"private sentinel"}),row(2000,"response_item",{type:"function_call_output",output:"private sentinel"}),row(3000,"response_item",{type:"message",role:"assistant",phase:"final_answer",content:["private sentinel"]}),row(3500,"event_msg",{type:"task_complete"})];
  const session=Buffer.from(rows.map(r=>JSON.stringify(r)).join("\n"));
  const timing=codexTrialTiming({started,completed,session,answerMtimeMs:Date.parse(started)+1800});
  assert.equal(timing.milestones.first_record.elapsed_ms,500);assert.equal(timing.milestones.answer_file_mtime.elapsed_ms,1800);
  assert.equal(timing.milestones.final_response.elapsed_ms,3000);assert.equal(timing.milestones.task_complete.elapsed_ms,3500);
  assert.ok(!JSON.stringify(timing).includes("private sentinel"));
  const incomplete=codexTrialTiming({started,completed,session:Buffer.from(rows.slice(0,4).map(r=>JSON.stringify(r)).join("\n")),answerMtimeMs:Date.parse(started)+1800});
  assert.equal(incomplete.milestones.answer_file_mtime.status,"known");assert.equal(incomplete.milestones.final_response.status,"unknown");assert.equal(incomplete.milestones.task_complete.status,"unknown");
});
for(const variant of ["absent","invalid-json","invalid-time","outside","backward","oversize"])test(`advisory timing preserves explicit unknown: ${variant}`,()=>{
  const started="2030-01-01T00:00:00Z",completed=variant==="backward"?"2029-01-01T00:00:00Z":"2030-01-01T00:00:05Z";
  const session=variant==="absent"?null:variant==="invalid-json"?Buffer.from("{bad"):variant==="oversize"?Buffer.alloc(4*1024*1024+1):Buffer.from(JSON.stringify({timestamp:variant==="outside"?"2030-01-01T00:00:06Z":"bad",type:"event_msg",payload:{type:"task_started"}}));
  const timing=codexTrialTiming({started,completed,session});
  assert.equal(timing.milestones.task_started.status,"unknown");assert.equal(timing.milestones.final_response.status,"unknown");
});
function sessionSelectionFixture(t, start = Date.now()-1000, end = start+2000) {
  const home=realpathSync(mkdtempSync(join(tmpdir(),"ask-session-select-")));
  t.after(()=>rmSync(home,{recursive:true,force:true}));
  const stdout=Buffer.from(JSON.stringify({type:"thread.started",thread_id:TRIAL_THREAD})+"\n");
  const fileAt=(time,id=TRIAL_THREAD)=>{
    const stamp=new Date(time).toISOString().slice(0,19), path=join(home,"sessions",...stamp.slice(0,10).split("-"),`rollout-${stamp.replaceAll(":","-")}-${id}.jsonl`);
    mkdirSync(dirname(path),{recursive:true,mode:0o700}); return path;
  };
  const select=()=>readCodexTrialSession(home,stdout,new Date(start).toISOString(),new Date(end).toISOString());
  return {home,stdout,start,end,fileAt,select};
}
test("new-session lookup ignores more than4096 historical entries and unrelated links",t=>{
  const f=sessionSelectionFixture(t), selected=f.fileAt(f.start+1000);
  writeFileSync(selected,"selected-new-session",{mode:0o600});
  const old=join(f.home,"sessions","1999");mkdirSync(old,{mode:0o700});
  for(let i=0;i<4097;i++)writeFileSync(join(old,`old-${i}.jsonl`),"DO_NOT_READ",{mode:0o600});
  symlinkSync("/unrelated-unreadable-target",join(f.home,"sessions","old-link"));
  assert.equal(f.select().toString(),"selected-new-session");
});
test("UTC session selection spans midnight and requires one candidate",t=>{
  const start=Date.parse("2026-10-03T23:59:59.500Z"), f=sessionSelectionFixture(t,start,start+2000);
  const selected=f.fileAt(start+1000);writeFileSync(selected,"after-midnight",{mode:0o600});utimesSync(selected,new Date(start+1000),new Date(start+1000));
  assert.equal(f.select().toString(),"after-midnight");
  const second=f.fileAt(start);writeFileSync(second,"ambiguous",{mode:0o600});utimesSync(second,new Date(start+500),new Date(start+500));
  assert.throws(f.select,/one matching new session/u);
});
for(const fault of ["missing","stale","future","symlink","hardlink","nonprivate","ancestor-link","wrong-id"])test(`new-session selection fails closed: ${fault}`,t=>{
  const f=sessionSelectionFixture(t), selected=f.fileAt(f.start+1000);
  if(fault!=="missing")writeFileSync(selected,"fixture",{mode:0o600});
  if(fault==="stale"||fault==="future")utimesSync(selected,new Date(fault==="stale"?f.start-1:f.end+1),new Date(fault==="stale"?f.start-1:f.end+1));
  if(fault==="symlink"){rmSync(selected);symlinkSync(join(f.home,"target"),selected);}
  if(fault==="hardlink")linkSync(selected,join(f.home,"copy"));
  if(fault==="nonprivate")chmodSync(selected,0o644);
  if(fault==="ancestor-link"){const day=dirname(selected), moved=join(f.home,"moved");mkdirSync(moved,{mode:0o700});rmSync(day,{recursive:true});symlinkSync(moved,day);}
  if(fault==="wrong-id"){rmSync(selected);writeFileSync(f.fileAt(f.start+1000,"00000000-0000-4000-8000-000000000002"),"other",{mode:0o600});}
  assert.throws(f.select);
});
test("ambiguous or path-injecting stdout identity is refused",t=>{
  const f=sessionSelectionFixture(t);
  for(const stdout of [Buffer.concat([f.stdout,f.stdout]),Buffer.from('{"type":"thread.started","thread_id":"../auth.json"}\n'),Buffer.from('{"type":"thread.started","thread_id":"not-a-uuid"}\n')])
    assert.throws(()=>readCodexTrialSession(f.home,stdout,new Date(f.start).toISOString(),new Date(f.end).toISOString()),/ambiguous thread identity/u);
  assert.throws(()=>readCodexTrialSession(f.home,f.stdout,"invalid",new Date(f.end).toISOString()),/time window/u);
  assert.throws(()=>readCodexTrialSession(f.home,f.stdout,new Date(f.end).toISOString(),new Date(f.start).toISOString()),/time window/u);
});
test("candidate lookup never widens beyond the120-second launch budget",t=>{
  const f=sessionSelectionFixture(t,Date.now()-1000,Date.now()+180000);
  const outside=f.fileAt(f.start+121000);writeFileSync(outside,"out-of-budget",{mode:0o600});utimesSync(outside,new Date(f.start+121000),new Date(f.start+121000));
  assert.throws(f.select,/one matching new session/u);
});
test("inline control avoids a mocked Node denied-ancestor entrypoint lookup without changing denies", t => {
  const {plan,base,dir}=prepared(t,{readPolicy:true});
  const controller=join(dir,"denied-controller"), helper=join(controller,"scripts","helper.mjs"), hook=join(dir,"bootstrap-hook.cjs"), log=join(dir,"lookups.log");
  mkdirSync(join(controller,"scripts"),{recursive:true,mode:0o700});
  writeFileSync(helper,'process.stdout.write("MOCK_FILE_HELPER");',{mode:0o600});
  // Development-only bootstrap mock: the helper itself is readable, but Node's
  // realpath traversal hits the denied ancestor seen in r2. No OS policy applied.
  writeFileSync(hook,`const fs=require("node:fs"),path=require("node:path"),original=fs.realpathSync;
fs.realpathSync=function(p,...args){let q=String(p);if(q.startsWith(${JSON.stringify(controller)}+path.sep)){while(q!==path.dirname(q)){fs.appendFileSync(${JSON.stringify(log)},q+"\\n");if(q===${JSON.stringify(controller)}){const e=Error("EPERM: lstat "+q);e.code="EPERM";throw e;}q=path.dirname(q);}}return original.call(this,p,...args);};`,{mode:0o600});
  const legacy=spawnSync(process.execPath,["--require",hook,helper],{encoding:"utf8"});
  assert.notEqual(legacy.status,0);assert.match(legacy.stderr,/EPERM: lstat/u);
  assert.ok(readFileSync(log,"utf8").split("\n").includes(controller));
  const launch=codexProbeLaunches(plan,base,[],"lightweight-control")[3];
  const prefix=launch.argv.slice(0,launch.argv.indexOf("--")+1);
  const child=controlCanaryArguments({argv:prefix,node:base.node.executable,canary:{}},[]);
  assert.deepEqual(child.slice(0,prefix.length),prefix);
  assert.deepEqual(child.slice(prefix.length,prefix.length+3),[base.node.executable,"--input-type=module","--eval"]);
  assert.equal(child[prefix.length+3],INLINE_CANARY_MODULE_SOURCE);
  assert.deepEqual(JSON.parse(child.at(-1)),{endpoints:[]});
  assert.ok(!child.includes(helper));assert.ok(!INLINE_CANARY_MODULE_SOURCE.includes("./"));
  // Exercise Node's real module bootstrap, stopping before the canary body.
  // All actual canary I/O is tested below against in-memory mocks only.
  const bootstrap=INLINE_CANARY_MODULE_SOURCE.slice(0,INLINE_CANARY_MODULE_SOURCE.lastIndexOf('process.stdout.write('))+'process.stdout.write("MOCK_INLINE_BOOTSTRAP_PASS:"+process.argv[1]);';
  const inline=spawnSync(process.execPath,["--require",hook,"--input-type=module","--eval",bootstrap,child.at(-1)],{encoding:"utf8"});
  assert.equal(inline.status,0,inline.stderr);assert.equal(inline.stdout,"MOCK_INLINE_BOOTSTRAP_PASS:"+child.at(-1));
  const filesystem=prefix.find(x=>x.startsWith("permissions.ask_synthetic_pilot.filesystem="));
  assert.ok(!filesystem.includes("local-codex-probe-worker.mjs"));
  for(const root of [base.controller_root,base.private_root,base.workspace_root,plan.codex_home,plan.runtime.root])assert.ok(plan.command.deny_roots.includes(root));
});
test("exact inline module preserves v2 canary outcomes with only in-memory filesystem/socket mocks", async () => {
  const spec={publicFile:"public",allowedWrite:"write",deniedReads:["private","old-copy"],deniedWrite:"other",unrelatedFile:"unrelated",endpoints:[{host:"127.0.0.1",port:1},{host:"::1",port:2}]};
  const reads=[],opens=[],writes=[];let output="";
  const module=INLINE_CANARY_MODULE_SOURCE.replace(/^import .*;\n/gmu,"");
  await runInNewContext(`(async()=>{${module}})()`,{
    process:{argv:["node",JSON.stringify(spec)],stdout:{write:x=>{output+=x;}}},
    readFileSync:p=>{reads.push(p);return p==="public"?"ASK_PUBLIC_CANARY\n":"ASK_UNRELATED_CANARY\n";},
    writeFileSync:(p,v,o)=>writes.push([p,v,o.flag,o.mode]),
    openSync:(p,m)=>{opens.push([p,m]);throw Object.assign(Error("mock denied"),{code:"EPERM"});},closeSync:()=>{},
    createConnection:()=>{const socket=new EventEmitter();socket.destroy=()=>{};socket.setTimeout=()=>{};queueMicrotask(()=>socket.emit("error",{code:"EPERM"}));return socket;},
  });
  const result=JSON.parse(output);assertCanaryResult(result,{declaredRead:true});
  assert.deepEqual(reads,["public","unrelated"]);
  assert.deepEqual(opens,[["private","r"],["old-copy","r"],["other","r+"],["unrelated","r+"]]);
  assert.deepEqual(writes,[["write","ASK_WRITE_CANARY\n","wx",0o600]]);
});
const json = path => JSON.parse(readFileSync(path, "utf8"));
function prepared(t, options = {}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "ask-connection-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, "owned-home"), parent = join(dir, "workspaces"), runtimeRoot = join(dir,"runtime");
  mkdirSync(home, { mode: 0o700 }); mkdirSync(parent, { mode: 0o700 }); mkdirSync(runtimeRoot,{mode:0o700});
  const {readPolicy,timePolicy,tokenPolicy,...simulationOptions}=options;
  const protectedRoot=join(dir,"old-grading-copy");
  if(readPolicy===true) { mkdirSync(protectedRoot,{mode:0o700});writeFileSync(join(protectedRoot,"synthetic-answer.txt"),"synthetic",{mode:0o600}); }
  const selection=readPolicy===true ? {kind:DECLARED_READ_POLICY,riskAcknowledged:true,protectedRootsComplete:true,protectedRoots:[protectedRoot]} : readPolicy;
  const result = prepareCodexConnection({ ...(selection!==undefined ? {readPolicy:selection} : {}), ...(timePolicy?{timePolicy}:{}), ...(tokenPolicy?{tokenPolicy}:{}), privateRoot: join(dir, "evidence"), workspaceParent: parent, codexHome: home, runtimeRoot }, { simulation: true, ...simulationOptions });
  return { ...result, home, dir, plan: json(join(result.privateRoot, "connection.json")), base: json(join(result.privateRoot, "plan.json")) };
}
function snapshot(root) {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true }).filter(x => x.isFile())
    .map(x => { const path = join(x.parentPath, x.name); return [path, readFileSync(path).toString("base64")]; }));
}
test("owned connection probes and two isolated trials share pilot scoring; reopen never starts commands", t => {
  const { privateRoot, plan, base, home } = prepared(t);
  assert.equal(plan.live_ready, false);
  const report = runCodexConnection(privateRoot);
  assert.equal(report.preflight.status, "pass"); assert.equal(report.preflight.evidence_class, "synthetic_only");
  assert.equal(report.preflight.network_enforcement, "synthetic_only");
  assert.equal(report.stop, null); assert.equal(report.model_calls, 0); assert.equal(report.credential_operations, 0);
  assert.deepEqual(report.slots.map(s => s.grade.status), ["pass", "pass"]);
  assert.notEqual(report.slots[0].session_id, report.slots[1].session_id);
  assert.equal(report.total_known_tokens, 240);
  assert.match(report.summary, /Owned simulation/u);
  const before = snapshot(privateRoot), homeBefore = snapshot(home);
  assert.deepEqual(reopenCodexConnection(privateRoot), report);
  const cli = JSON.parse(execFileSync(process.execPath, [ENTRY, "reopen", privateRoot], { env: { PATH: "" }, encoding: "utf8" }));
  assert.deepEqual(cli, report); assert.deepEqual(snapshot(privateRoot), before); assert.deepEqual(snapshot(home), homeBefore);
  assert.throws(() => runCodexConnection(privateRoot));
  assert.deepEqual(snapshot(privateRoot), before);
  const plain = readFileSync(join(privateRoot, "plain/stdin.txt"));
  const kernel = readFileSync(join(dirname(ENTRY), "../AGENTS.md"));
  assert.deepEqual(readFileSync(join(privateRoot, "kernel_only/stdin.txt")), Buffer.concat([kernel, Buffer.from("\n"), plain, Buffer.from("\n")]));
  for (const condition of ["plain", "kernel_only"]) {
    const received = json(join(privateRoot, condition, "received.json"));
    assert.equal(received.env.CODEX_HOME, plan.codex_home);
    assert.equal(received.env.HOME, join(plan.runtime.root, condition, "home"));
    assert.equal(received.argv.at(-1), "-");
    assert.equal(received.env.OPENAI_API_KEY, undefined); assert.equal(received.env.NODE_OPTIONS, undefined);
    assert.deepEqual(readdirSync(join(base.workspace_root, condition)).sort(), [".ask-tmp", "answer.json", "input.json", "task.md"]);
    assert.equal(json(join(privateRoot, condition, "session-check.json")).status, "match");
    assert.equal(json(join(privateRoot,condition,"timing.json")).milestones.task_started.status,"known");
    assert.deepEqual(json(join(privateRoot,condition,"timing.json")),report.slots.find(s=>s.condition===condition).timing);
    assert.equal(received.argv.includes("resume"), false);
  }
});
for (const [scenario, stop] of [["unknown", "usage_unknown"], ["threshold", "trial_token_threshold"], ["identity", "session_identity_failure"],
  ["exit", "process_failure"], ["missing-session", "session_identity_failure"], ["provider", "provider_stop"], ["interrupt", "process_failure"], ["scope-leak","session_identity_failure"]]) {
  test(`${scenario} preserves the consumed trial and never substitutes/retries`, t => {
    const { privateRoot } = prepared(t, { scenarios: [scenario, "pass"] });
    const report = runCodexConnection(privateRoot);
    assert.equal(report.stop, stop); assert.equal(report.slots[1].state, "not_started"); assert.equal(report.retry, 0);
    if (scenario === "unknown") { assert.equal(report.slots[0].usage.value, null); assert.match(report.summary, /usage=unknown/u); }
    assert.deepEqual(reopenCodexConnection(privateRoot), report);
    assert.throws(() => runCodexConnection(privateRoot));
  });
}
test("timeout keeps process evidence and does not launch the second trial", t => {
  const { privateRoot } = prepared(t, { scenarios: ["timeout", "pass"], fakeTimeoutMs: 2000 });
  const report = runCodexConnection(privateRoot);
  assert.equal(report.stop, "process_failure"); assert.equal(report.slots[0].process.timeout, true);
  assert.equal(report.slots[1].state, "not_started"); assert.deepEqual(reopenCodexConnection(privateRoot), report);
});
for (const scenario of ["wrong", "malformed"]) test(`${scenario} grades fail without changing constraints or hiding the second outcome`, t => {
  const { privateRoot } = prepared(t, { scenarios: [scenario, "pass"] });
  const report = runCodexConnection(privateRoot);
  assert.deepEqual(report.slots.map(s => s.grade.status), ["fail", "pass"]); assert.equal(report.stop, null);
});
test("model-free canary mismatch prevents both trials", t => {
  const { privateRoot } = prepared(t, { probePass: false });
  const report = runCodexConnection(privateRoot);
  assert.equal(report.stop, "model_free_preflight_failed"); assert.deepEqual(report.slots.map(s => s.state), ["not_started", "not_started"]);
});
test("reused thread/history cannot be admitted as a distinct trial", t => {
  const { privateRoot } = prepared(t, { scenarios: ["pass", "reused-session"] });
  const report = runCodexConnection(privateRoot); assert.equal(report.stop, "session_identity_failure");
});
test("trial environment is closed; probes have a fresh empty home and no exec prompt", t => {
  const { plan, base } = prepared(t);
  const plain = codexTrialLaunch(plan, base, "plain"), kernel = codexTrialLaunch(plan, base, "kernel_only");
  assert.deepEqual(Object.keys(plain.env).sort(), ["CODEX_HOME", "HOME", "LANG", "LC_ALL", "PATH", "TEMP", "TMP", "TMPDIR", "TZ"]);
  assert.equal(plain.timeout, kernel.timeout); assert.equal(plain.maxBuffer, kernel.maxBuffer);
  assert.equal(plain.killSignal, "SIGKILL");
  const probes = codexProbeLaunches(plan, base, ["public", "private"]);
  assert.equal(probes.length, 4); assert.equal(probes[0].env.HOME, probes[0].env.CODEX_HOME);
  assert.notEqual(probes[0].env.CODEX_HOME, plan.codex_home);
  assert.deepEqual(probes.slice(0, 3).map(p => p.argv), [["--version"], ["exec", "--help"], ["sandbox", "--help"]]);
  assert.ok(probes[3].argv.includes("--include-managed-config"));
  assert.throws(() => codexTrialLaunch(plan, base, "resume"));
});
test("WSL route is simulated explicitly and never promoted to actual WSL evidence", t => {
  const host = { platform: "linux", arch: "x64", release: "6.6.87.2-microsoft-standard-WSL2", node: "v24.19.0", distro: { id: "ubuntu", version: "24.04" }, glibc: "2.39" };
  const { plan, privateRoot } = prepared(t, { host });
  assert.equal(plan.route, "windows-wsl2"); assert.equal(plan.synthetic_host, true);
  assert.equal(runCodexConnection(privateRoot).preflight.evidence_class, "synthetic_only");
});
test("selected session bytes are sealed; mutation is rejected, not rescored", t => {
  const { privateRoot } = prepared(t); runCodexConnection(privateRoot);
  writeFileSync(join(privateRoot, "plain/session.jsonl"), "{}\n");
  assert.throws(() => reopenCodexConnection(privateRoot), /digest mismatch/u);
});
test("unsealed/interrupted records reopen explicitly unknown without commands or recovery", t => {
  const { privateRoot } = prepared(t);
  const before = snapshot(privateRoot), report = reopenCodexConnection(privateRoot);
  assert.equal(report.execution_status, "incomplete"); assert.equal(report.verification, "unsealed_not_verified"); assert.equal(report.model_calls, "unknown");
  assert.deepEqual(snapshot(privateRoot), before);
});
test("saved plan inspection does not depend on the current Node install path", t => {
  const { privateRoot, plan } = prepared(t);
  const archived = { ...plan, cli: { ...plan.cli, executable: "/archived/no-longer-installed/node" } };
  writeFileSync(join(privateRoot, "connection.json"), JSON.stringify(archived));
  writeFileSync(join(privateRoot, "connection-digest.json"), JSON.stringify({ digest: canonicalDigest(archived) }));
  assert.equal(reopenCodexConnection(privateRoot).verification, "unsealed_not_verified");
  assert.throws(() => runCodexConnection(privateRoot), /runtime drift/u);
});
test("permission storage shape refuses arbitrary secret fields without executing anything", () => {
  const permission = { kind: "fixture", plan_digest: "fixture", source_digest: "fixture", cli_image_digest: "fixture", route: "fixture", approval_ref: "fixture",
    actions: { probes: 4, trials: 2, retry: 0, existing_home_cli_read_refresh: true }, image_reviewed: true,
    admission: { evidence_class: "fixture", source_digest: "fixture", cli_image_digest: "fixture", host: {}, network_enforcement: "fixture", evidence_ref: "fixture" } };
  assert.doesNotThrow(() => assertConnectionPermissionShape(permission));
  assert.throws(() => assertConnectionPermissionShape({ ...permission, auth: "must-not-save" }));
  assert.throws(() => assertConnectionPermissionShape({ ...permission, admission: { ...permission.admission, token: "must-not-save" } }));
});
test("live plans and historical grants refuse before any launch/claim", t => {
  const { privateRoot, plan } = prepared(t);
  const live = { ...plan, mode: "planned_live" };
  writeFileSync(join(privateRoot, "connection.json"), JSON.stringify(live));
  writeFileSync(join(privateRoot, "connection-digest.json"), JSON.stringify({ digest: canonicalDigest(live) }));
  const before = snapshot(privateRoot);
  for (const permission of [null, { kind: "ask_synthetic_pilot_permission_v1" }, { kind: "ask_local_codex_permission_v1", approval_ref: "consumed-old-grant" }]) {
    assert.throws(() => runCodexConnection(privateRoot, permission), /runtime ownership\/identity drift/u);
  }
  assert.deepEqual(snapshot(privateRoot), before);
  const cli = spawnSync(process.execPath, [ENTRY, "simulate", privateRoot], { encoding: "utf8" });
  assert.equal(cli.status, 1); assert.deepEqual(snapshot(privateRoot), before);
});
test("simulation refuses a credential/session-containing home without touching it", t => {
  const { dir, home } = prepared(t);
  const before = snapshot(home);
  assert.throws(() => prepareCodexConnection({ privateRoot: join(dir, "other-evidence"), codexHome: home }, { simulation: true }), /new empty owned home/u);
  assert.deepEqual(snapshot(home), before);
});
test("native image candidates inside the existing home refuse before any byte read", t => {
  const { dir, home } = prepared(t);
  const credential = join(home, "auth.json");
  // Deliberately executable, empty file: a byte read would throw the stable-file
  // empty-image error instead of the earlier metadata boundary refusal.
  writeFileSync(credential, "", { mode: 0o700 });
  const before = snapshot(home);
  assert.throws(() => prepareCodexConnection({ privateRoot: join(dir, "native-evidence"), codexHome: home,
    executable: credential, imageDigest: "sha256:invalid" }), /metadata required before reading/u);
  assert.deepEqual(snapshot(home), before);
});
test("session runtime exception is restricted to an exact declared credential/session deny root", () => {
  const fixture = json(join(dirname(ENTRY), "test-fixtures/synthetic-pilot-session-01571.json"));
  const encode = rows => Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  for (const sessionHome of ["/", "/undeclared", "/synthetic/evidence/../other", "relative"]) {
    assert.throws(() => parsePilotNativeSession({ ...fixture, stdout: encode(fixture.stdout), session: encode(fixture.session), sessionHome }));
  }
});

test("optional strict mock evidence is preserved; ordinary eval owns exactly one control", t=>{
  const {privateRoot,plan,base,home}=prepared(t);
  const admission=runCodexProbes(privateRoot);
  assert.equal(admission.model_calls,0); assert.equal(admission.evidence_class,"synthetic_only");
  assert.equal(admission.metadata_compatibility,"synthetic_only"); assert.equal(admission.filesystem_enforcement,"synthetic_only");
  assert.deepEqual(admission.filesystem_canary_scope,["synthetic_grading_material","other_trial","synthetic_auth_material","unrelated_file"]);
  assert.equal(readdirSync(home).includes("sessions"),false);
  assert.equal(readdirSync(privateRoot).includes("connection-run-claim.json"),false);
  const before=snapshot(join(privateRoot,"connection-probe"));
  const probe=codexPhasePermission(plan,"probe","new-probe-approval"),evaluate=codexPhasePermission(plan,"evaluate","new-eval-approval");
  assert.equal(probe.actions.trials,0); assert.equal(probe.actions.existing_home_cli_read_refresh,false);
  assert.equal(evaluate.actions.probes,0); assert.equal(evaluate.actions.trials,2);
  assert.notDeepEqual(probe,evaluate); assert.equal(evaluate.actions.controls,1);
  assert.equal(evaluate.kind,"ask_local_codex_lightweight_permission_v1");
  assert.throws(()=>codexPhasePermission(plan,"evaluate","new-eval-approval",canonicalDigest(admission)),/no strict admission grant/u);
  assert.throws(()=>runCodexProbes(privateRoot));
  const report=evaluateCodexConnection(privateRoot);
  assert.equal(report.stop,null); assert.equal(report.preflight.outcomes.length,1);
  assert.deepEqual(snapshot(join(privateRoot,"connection-probe")),before);
  assert.deepEqual(reopenCodexProbes(privateRoot),admission); assert.deepEqual(reopenCodexConnection(privateRoot),report);
  const launch=codexTrialLaunch(plan,base,"plain");
  assert.ok(launch.argv.includes(`sqlite_home=${JSON.stringify(join(plan.runtime.root,"plain/home/sqlite"))}`));
  assert.ok(launch.argv.includes(`log_dir=${JSON.stringify(join(plan.runtime.root,"plain/home/log"))}`));
  assert.ok(launch.argv.includes('history.persistence="none"')); assert.ok(launch.argv.includes('memories.generate_memories=false'));
});
test("ordinary eval does not require a strict probe or its admission seal", t=>{
  const {privateRoot}=prepared(t);
  assert.equal(reopenCodexProbes(privateRoot).evidence_class,"unsealed_unknown");
  const report=evaluateCodexConnection(privateRoot);
  assert.equal(report.stop,null);assert.equal(report.preflight.outcomes.length,1);
  assert.equal(readdirSync(privateRoot).includes("probe-claim.json"),false);
  assert.equal(readdirSync(privateRoot).includes("connection-probe"),false);
  assert.equal(readdirSync(join(privateRoot,"lightweight-control")).length,3);
});
test("tampered strict bytes are not authority for ordinary eval and remain unrepaired", t=>{
  const {privateRoot}=prepared(t);runCodexProbes(privateRoot);
  writeFileSync(join(privateRoot,"connection-probe/check-3/stdout.bin"),"altered\n");
  const before=snapshot(join(privateRoot,"connection-probe"));
  assert.throws(()=>reopenCodexProbes(privateRoot),/binding mismatch/u);
  assert.equal(evaluateCodexConnection(privateRoot).stop,null);
  assert.deepEqual(snapshot(join(privateRoot,"connection-probe")),before);
  assert.throws(()=>reopenCodexProbes(privateRoot),/binding mismatch/u);
});
for(const variant of ["old-strict","network","trust","counts"])test(`ordinary public evaluate rejects ${variant} permission before any claim or process`,t=>{
  const {privateRoot,plan}=prepared(t),live=structuredClone(plan);live.mode="planned_live";
  writeFileSync(join(privateRoot,"connection.json"),JSON.stringify(live));
  writeFileSync(join(privateRoot,"connection-digest.json"),JSON.stringify({digest:canonicalDigest(live)}));
  writeFileSync(join(live.runtime.root,"runtime-owner.json"),JSON.stringify({kind:"owned_external_runtime_v1",evidence_root:privateRoot,plan_digest:canonicalDigest(live)}));
  let permission=codexPhasePermission(live,variant==="old-strict" ? "probe" : "evaluate","fresh-owned-negative-fixture");
  if(variant==="network")permission.actions.openai_model_auth_managed_config_network=false;
  if(variant==="trust")permission.trusted_cli_policy.cli_host_access="isolated";
  if(variant==="counts")permission.actions.controls=4;
  const before=snapshot(privateRoot),runtimeBefore=snapshot(live.runtime.root);
  assert.throws(()=>evaluateCodexConnection(privateRoot,permission),/fresh exact phase permission/u);
  assert.deepEqual(snapshot(privateRoot),before);assert.deepEqual(snapshot(live.runtime.root),runtimeBefore);
  assert.equal(readdirSync(privateRoot).includes("connection-run-claim.json"),false);
});
test("ordinary control launch has one CLI sandbox and no outer Seatbelt; tool grant stays closed", t=>{
  const {plan,base}=prepared(t), original=structuredClone(plan.command);
  const sandboxArgs=codexProbeLaunches(plan,base,[],"lightweight-control")[3].argv;
  const args=sandboxArgs.slice(0,sandboxArgs.indexOf("--")+1),filesystem=args.find(x=>x.startsWith("permissions.ask_synthetic_pilot.filesystem="));
  const launch=codexLightweightControlLaunch(plan,base,{sandboxArgs:args,canary:{},filesystem});
  assert.equal(launch.executable,base.node.executable);assert.equal(launch.argv[1],"guarded");
  const payload=JSON.parse(launch.argv[2]);assert.equal(payload.cli,plan.cli.executable);assert.equal(payload.argv[0],"sandbox");
  assert.equal(launch.env.HOME,launch.env.CODEX_HOME);assert.notEqual(launch.env.CODEX_HOME,plan.codex_home);
  assert.equal(launch.argv.includes("/usr/bin/sandbox-exec"),false);assert.deepEqual(plan.command,original);
  assert.equal(plan.trusted_cli_policy.cli_startup_external_network,"zero_not_guaranteed");
  assert.equal(codexPhasePermission(plan,"evaluate","fresh-lightweight-approval").actions.openai_model_auth_managed_config_network,true);
});
for(const probeOutcome of ["network-open","network-unknown","write-open","positive-unknown","extra-keys"]) test(`${probeOutcome} never produces admitted enforcement`,t=>{
  const {privateRoot}=prepared(t,{probeOutcome}); const report=runCodexConnection(privateRoot);
  assert.equal(report.stop,"model_free_preflight_failed");assert.equal(report.slots[0].state,"not_started");
  assert.equal(report.preflight.network_enforcement,"failed_or_unknown"); assert.deepEqual(reopenCodexConnection(privateRoot),report);
});
test("closed read policy has root deny, explicit runtime files and no inherited workspace/tmp grant", t=>{
  const {plan,base}=prepared(t);
  assert.equal(plan.command.closed_read_scope,true); assert.ok(plan.command.deny_roots.includes("/"));
  assert.ok(plan.read_roots.includes(base.node.executable)); assert.ok(plan.read_roots.includes(plan.cli.executable));
  assert.ok(!plan.command.argv.some(x=>x.includes(".extends=")));assert.ok(!plan.read_roots.includes("/tmp"));
  assert.ok(!plan.read_roots.includes("/etc"));assert.ok(!plan.read_roots.includes("/usr/bin"));assert.ok(!plan.read_roots.includes(plan.codex_home));
  const profile=probeSeatbelt({codexHome:plan.codex_home,home:"/owned/probe-home",workspace:"/owned/workspace",canaries:[]});
  assert.match(profile,/deny default/u);assert.match(profile,/localhost/u);assert.match(profile,/com.apple.securityd/u);
  assert.ok(profile.includes(plan.codex_home));
  assert.ok(profile.includes("(allow file-read*)"));
  assert.ok(profile.includes(`(deny file-read* (subpath ${JSON.stringify(plan.codex_home)}))`));
});
test("refused/timeout/unsupported sockets remain unknown; only permission errors prove denial",()=>{
  assert.equal(classifyDenial("EPERM"),"pass");assert.equal(classifyDenial("EACCES"),"pass");
  assert.equal(classifyDenial("CONNECTED"),"fail");for(const code of ["ECONNREFUSED","TIMEOUT","EAFNOSUPPORT","ENOENT"])assert.equal(classifyDenial(code),"unknown");
  assert.throws(()=>assertCanaryResult({kind:"ask_codex_canary_v1",filesystem:{read:"pass",write:"pass"},network:[]}));
  assert.throws(()=>assertNoAclListing("-rw-------+ 1 owner group file\n"));
  assert.doesNotThrow(()=>assertNoAclListing("-rw-------@ 1 owner group file\n"));
});
function syntheticHome(t,mode=0o755){
  const root=mkdtempSync(join(realpathSync(tmpdir()),"ask-owned-metadata-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
  chmodSync(root,mode);writeFileSync(join(root,"auth.json"),"synthetic-not-a-secret",{mode:0o600});return root;
}
test("0755 existing-home metadata can pass without chmod or reading credential bytes",t=>{
  const home=syntheticHome(t);mkdirSync(join(home,"sessions"),{mode:0o755});
  writeFileSync(join(home,"sessions/historical.jsonl"),"historical-do-not-copy",{mode:0o644});
  writeFileSync(join(home,"state_5.sqlite"),"unrelated-old-db",{mode:0o644});
  const before=lstatSync(home).mode,result=inspectExistingCodexHome(home);
  assert.equal(result.credential_contents,"not_read");assert.equal(result.chmod,false);assert.equal(lstatSync(home).mode,before);
});
for(const mode of [0o644,0o400,0o700])test(`synthetic credential mode ${mode.toString(8)} refuses metadata admission`,t=>{
  const home=syntheticHome(t);chmodSync(join(home,"auth.json"),mode);assert.throws(()=>inspectExistingCodexHome(home),/metadata/u);
});
test("synthetic symlink/hardlink credentials and unsafe log index refuse",t=>{
  const home=syntheticHome(t),auth=join(home,"auth.json");linkSync(auth,join(home,"owned-hardlink"));assert.throws(()=>inspectExistingCodexHome(home));
  rmSync(join(home,"owned-hardlink"));rmSync(auth);symlinkSync(join(home,"missing-fixture"),auth);assert.throws(()=>inspectExistingCodexHome(home));
  rmSync(auth);writeFileSync(auth,"fixture",{mode:0o600});writeFileSync(join(home,"session_index.jsonl"),"fixture",{mode:0o644});assert.throws(()=>inspectExistingCodexHome(home),/session_index/u);
});

test("admission freshness rejects invalid, future and expired timestamps", () => {
  const now = Date.parse("2026-10-02T00:00:00Z");
  assert.equal(freshAdmissionTime("invalid", now), false);
  assert.equal(freshAdmissionTime("2026-10-02T00:00:01Z", now), false);
  assert.equal(freshAdmissionTime("2026-10-01T22:59:59Z", now), false);
  assert.equal(freshAdmissionTime("2026-10-01T23:00:00Z", now), true);
});


test("trusted runtime read contract cannot become a model-tool read grant", t => {
  const {plan,base}=prepared(t);
  assert.deepEqual(plan.probe_parent_policy,codexProbeParentPolicy(plan));
  assert.equal(plan.probe_parent_policy.read_access,"host_reads_except_existing_codex_home");
  assert.ok(!plan.command.read_roots.includes("/"));
  assert.ok(!plan.command.read_roots.includes(dirname(plan.codex_home)));
  const before=structuredClone(plan.command);
  probeSeatbelt({codexHome:plan.codex_home,home:"/private/empty",workspace:"/private/work",canaries:[]});
  assert.deepEqual(plan.command,before);
  assert.throws(()=>probeSeatbelt({home:"/private/empty",workspace:"/private/work",canaries:[]}));
  assert.throws(()=>probeSeatbelt({codexHome:"/",home:"/private/empty",workspace:"/private/work",canaries:[]}));
  assert.throws(()=>probeSeatbelt({codexHome:"/private",home:"/private/empty",workspace:"/public/work",canaries:[]}));
});
for (const variant of ["missing-command","no-root-deny","broad-read","no-network-policy","no-profile","inherited-policy","v1"]) test(`missing/changed model policy ${variant} refuses both launch builders`,t=>{
  const {plan,base}=prepared(t),changed=structuredClone(plan);
  if(variant==="missing-command")delete changed.command;
  else if(variant==="broad-read") {changed.read_roots.push(dirname(plan.codex_home));changed.command=codexConnectionCommand(changed,base);}
  else if(variant==="v1")changed.kind="ask_local_codex_connection_v1";
  else if(variant==="no-root-deny")changed.command.argv=changed.command.argv.map(x=>x.replace('"/" = "deny", ',""));
  else if(variant==="inherited-policy")changed.command.argv.push("-c",'permissions.ask_synthetic_pilot.extends=":workspace"');
  else changed.command.argv=changed.command.argv.filter(x=>!x.includes(variant==="no-profile"?'default_permissions=':'permissions.ask_synthetic_pilot.network.enabled=false'));
  assert.throws(()=>codexTrialLaunch(changed,base,"plain"),/model-tool/u);
  assert.throws(()=>codexProbeLaunches(changed,base,[]),/model-tool/u);
});
test("strict parent contract gates only strict mock probes, not ordinary evaluation", t=>{
  const {privateRoot,plan}=prepared(t),old=structuredClone(plan);delete old.probe_parent_policy;
  writeFileSync(join(privateRoot,"connection.json"),JSON.stringify(old));
  writeFileSync(join(privateRoot,"connection-digest.json"),JSON.stringify({digest:canonicalDigest(old)}));
  writeFileSync(join(old.codex_home,"owned-simulation.json"),JSON.stringify({kind:"ask_owned_connection_simulation_v1",root:privateRoot,plan_digest:canonicalDigest(old)}));
  writeFileSync(join(old.runtime.root,"runtime-owner.json"),JSON.stringify({kind:"owned_external_runtime_v1",evidence_root:privateRoot,plan_digest:canonicalDigest(old)}));
  assert.equal(reopenCodexProbes(privateRoot).evidence_class,"unsealed_unknown");
  const before=snapshot(privateRoot);assert.throws(()=>runCodexProbes(privateRoot),/parent contract/u);assert.deepEqual(snapshot(privateRoot),before);
  assert.equal(evaluateCodexConnection(privateRoot).stop,null);
});
test("nested sandbox entry requires explicit closed filesystem/network profile and managed config",t=>{
  const {plan,base}=prepared(t),launch=codexProbeLaunches(plan,base,[])[3];
  const argv=launch.argv.slice(0,launch.argv.indexOf("--")+1);
  const filesystem=argv.find(x=>x.startsWith("permissions.ask_synthetic_pilot.filesystem="));
  assert.doesNotThrow(()=>assertProbeSandboxArgs(argv,{filesystem}));
  for(const drop of ["--include-managed-config","-P",filesystem,"permissions.ask_synthetic_pilot.network.enabled=false"])assert.throws(()=>assertProbeSandboxArgs(argv.filter(x=>x!==drop),{filesystem}));
  assert.throws(()=>assertProbeSandboxArgs(["exec","--", "-"],{filesystem}));
  assert.throws(()=>assertProbeSandboxArgs(argv,{filesystem:undefined}));
  for(const key of [" permissions.ask_synthetic_pilot.network.enabled","permissions.ask_synthetic_pilot.network.enabled ",'"permissions".ask_synthetic_pilot.network.enabled',"permissions.ask_synthetic_pilot.extends"]) {
    const invalid=[...argv.slice(0,-3),"-c",key+"=true",...argv.slice(-3)];
    assert.throws(()=>assertProbeSandboxArgs(invalid,{filesystem}));
  }
  const worker=join(dirname(ENTRY),"local-codex-probe-worker.mjs");
  const result=spawnSync(process.execPath,[worker,"guarded",JSON.stringify({cli:"/must-not-be-invoked",argv:["--version"],cwd:"/must-not-be-opened",canary:{}})],{encoding:"utf8"});
  assert.equal(result.status,6);assert.match(result.stderr,/model-tool policy refused/u);assert.equal(result.stdout,"");
  const invalid=[...argv.slice(0,-3),"-c"," permissions.ask_synthetic_pilot.network.enabled=true",...argv.slice(-3)];
  const duplicate=spawnSync(process.execPath,[worker,"guarded",JSON.stringify({cli:"/must-not-be-invoked",argv:invalid,filesystem,cwd:"/must-not-be-opened",canary:{}})],{encoding:"utf8"});
  assert.equal(duplicate.status,6);assert.match(duplicate.stderr,/model-tool policy refused/u);assert.equal(duplicate.stdout,"");
});
test("failed metadata never reports an exercised filesystem or network canary",t=>{
  const {privateRoot}=prepared(t,{probeOutcome:"metadata-fail"});
  const report=runCodexProbes(privateRoot);
  assert.equal(report.outcomes.length,1);assert.equal(report.metadata_compatibility,"failed_or_unknown");
  assert.equal(report.filesystem_enforcement,"not_exercised");assert.equal(report.network_enforcement,"not_exercised");
  assert.deepEqual(reopenCodexProbes(privateRoot),report);
  const before=snapshot(join(privateRoot,"connection-probe"));
  assert.equal(evaluateCodexConnection(privateRoot).stop,null);
  assert.deepEqual(snapshot(join(privateRoot,"connection-probe")),before);
  assert.deepEqual(reopenCodexProbes(privateRoot),report);
});

test("runtime helper links remain outside evidence and failed probes replay without runtime",t=>{
  const {privateRoot,plan}=prepared(t,{probePass:false});
  const permission=codexPhasePermission(plan,"probe","owned-fake-approval-only");
  assert.deepEqual(permission.runtime,plan.runtime);
  assert.ok(plan.command.deny_roots.includes(plan.runtime.root));
  const report=runCodexProbes(privateRoot);
  assert.equal(report.status,"fail"); assert.equal(report.model_calls,0);
  const helpers=join(plan.runtime.root,"connection-probe/home/tmp/arg0");
  assert.equal(readdirSync(helpers).length,4);
  assert.ok(lstatSync(join(helpers,readdirSync(helpers)[0],"apply_patch")).isSymbolicLink());
  assert.equal(readdirSync(join(privateRoot,"connection-probe")).includes("home"),false);
  assert.deepEqual(reopenCodexProbes(privateRoot),report);
  const before=snapshot(privateRoot);
  // Remove only the test's owned synthetic runtime; offline replay needs no runtime path.
  rmSync(plan.runtime.root,{recursive:true});
  assert.deepEqual(reopenCodexProbes(privateRoot),report);
  assert.deepEqual(snapshot(privateRoot),before);
  assert.throws(()=>runCodexProbes(privateRoot)); assert.deepEqual(snapshot(privateRoot),before);
});

test("completed evaluation replay ignores removed owned runtime but retains strict evidence links",t=>{
  const {privateRoot,plan}=prepared(t),report=runCodexConnection(privateRoot);
  assert.equal(report.stop,null);
  rmSync(plan.runtime.root,{recursive:true});
  assert.deepEqual(reopenCodexConnection(privateRoot),report);
  symlinkSync("/never-follow-this-target",join(privateRoot,"injected-runtime-helper"));
  assert.throws(()=>reopenCodexConnection(privateRoot),/evidence link fault/u);
});

for(const variant of ["missing","public","symlink","nonempty","evidence","workspace","controller","existing-home"]) test(`runtime descriptor ${variant} refuses before evidence creation`,t=>{
  const {dir,base,plan}=prepared(t), home=join(dir,"fresh-home"), runtimeRoot=join(dir,"fresh-runtime");
  mkdirSync(home,{mode:0o700});mkdirSync(runtimeRoot,{mode:0o700});
  const evidence=join(dir,"fresh-evidence"), workspace=join(dir,"fresh-workspaces");mkdirSync(workspace,{mode:0o700});
  let selected=runtimeRoot;
  if(variant==="missing")selected=undefined;
  else if(variant==="public")chmodSync(runtimeRoot,0o755);
  else if(variant==="symlink"){selected=join(dir,"runtime-alias");symlinkSync(runtimeRoot,selected);}
  else if(variant==="nonempty")writeFileSync(join(runtimeRoot,"previous-claim"),"spent",{mode:0o600});
  else if(variant==="evidence"){mkdirSync(evidence,{mode:0o700});selected=evidence;}
  else if(variant==="workspace")selected=workspace;
  else if(variant==="controller")selected=base.controller_root;
  else if(variant==="existing-home")selected=home;
  const before=readdirSync(dir).sort();
  assert.throws(()=>prepareCodexConnection({privateRoot:evidence,workspaceParent:workspace,codexHome:home,runtimeRoot:selected},{simulation:true}));
  assert.deepEqual(readdirSync(dir).sort(),before);
  assert.equal(readdirSync(home).length,0);
  assert.deepEqual(plan.command.deny_roots.includes(plan.runtime.root),true);
});

test("runtime root ownership claim cannot be reused for another plan",t=>{
  const {dir,plan}=prepared(t),home=join(dir,"new-home");mkdirSync(home,{mode:0o700});
  assert.throws(()=>prepareCodexConnection({privateRoot:join(dir,"new-evidence"),workspaceParent:join(dir,"workspaces"),codexHome:home,runtimeRoot:plan.runtime.root},{simulation:true}),/new empty runtime/u);
});

for(const variant of ["identity","marker","phase-link"])test(`runtime ${variant} drift refuses without a probe invocation`,t=>{
  const {privateRoot,plan}=prepared(t);
  if(variant==="identity") {rmSync(plan.runtime.root,{recursive:true});mkdirSync(plan.runtime.root,{mode:0o700});}
  else if(variant==="marker")writeFileSync(join(plan.runtime.root,"runtime-owner.json"),"{}");
  else symlinkSync("/never-follow-phase",join(plan.runtime.root,"connection-probe"));
  const before=snapshot(privateRoot);
  assert.throws(()=>runCodexProbes(privateRoot));
  assert.equal(readdirSync(privateRoot).includes("connection-probe"),false);
  assert.deepEqual(snapshot(privateRoot),before);
});

test("historical unsealed plan without runtime binding remains readable but cannot execute",t=>{
  const {privateRoot,plan,base}=prepared(t),old=structuredClone(plan);
  delete old.runtime; delete old.probe_parent_policy.runtime;
  old.command=codexConnectionCommand(old,base);
  writeFileSync(join(privateRoot,"connection.json"),JSON.stringify(old));
  writeFileSync(join(privateRoot,"connection-digest.json"),JSON.stringify({digest:canonicalDigest(old)}));
  const before=snapshot(privateRoot);
  assert.equal(reopenCodexProbes(privateRoot).evidence_class,"unsealed_unknown");
  assert.equal(reopenCodexConnection(privateRoot).verification,"unsealed_not_verified");
  assert.throws(()=>runCodexProbes(privateRoot));assert.deepEqual(snapshot(privateRoot),before);
});

test("ordinary native evaluation is available while strict admission remains unavailable",()=>{
  for(const platform of ["darwin","linux"]) {
    const plan={mode:"planned_live",host:{platform},execution_route:"trusted_cli_lightweight_v1"};
    plan.trusted_cli_policy=codexLightweightPolicy();
    assert.doesNotThrow(()=>assertNativeAdmissionRoute(plan,"evaluate"));
    assert.throws(()=>assertNativeAdmissionRoute(plan,"probe"),/strict native admission unavailable/u);
    assert.throws(()=>assertNativeAdmissionRoute({...plan,trusted_cli_policy:{}} ,"evaluate"),/trusted CLI contract/u);
  }
});

test("historical sealed failed admission without external runtime reopens read-only",t=>{
  const {privateRoot,plan,base}=prepared(t),old=structuredClone(plan);
  delete old.runtime; delete old.probe_parent_policy.runtime;
  old.command=codexConnectionCommand(old,base);
  writeFileSync(join(privateRoot,"connection.json"),JSON.stringify(old));
  writeFileSync(join(privateRoot,"connection-digest.json"),JSON.stringify({digest:canonicalDigest(old)}));
  const report={kind:"ask_local_codex_admission_v2",mode:old.mode,status:"fail",model_calls:0,retry:0,
    plan_digest:canonicalDigest(old),source_digest:canonicalDigest(old.source),command_digest:canonicalDigest(old.command),
    cli_image_digest:old.cli.image_digest,host:old.host,guard:old.guard,probe_parent_policy:old.probe_parent_policy};
  writeFileSync(join(privateRoot,"probe-report.json"),JSON.stringify(report),{mode:0o600});
  const files=Object.fromEntries(Object.entries(pilotEvidenceInventory(privateRoot)).filter(([path])=>path==="probe-report.json"));
  writeFileSync(join(privateRoot,"probe-seal.json"),JSON.stringify({files}),{mode:0o600});
  const before=snapshot(privateRoot);
  assert.deepEqual(reopenCodexProbes(privateRoot),report);
  assert.deepEqual(snapshot(privateRoot),before);
});


test("declared read is explicit opt-in, binds inventory/risk and excludes temporary writes",t=>{
  const closed=prepared(t), candidate=prepared(t,{readPolicy:true});
  assert.equal(closed.plan.kind,"ask_local_codex_connection_v2");assert.equal(closed.plan.read_policy,undefined);
  const {plan,base}=candidate;
  assert.equal(plan.kind,"ask_local_codex_connection_v3");assert.deepEqual(plan.read_policy.risk,READ_POLICY_RISK);
  assert.equal(plan.command.declared_read_scope,true);assert.equal(plan.command.closed_read_scope,undefined);
  assert.deepEqual(plan.read_roots,[]);assert.ok(!plan.command.deny_roots.includes("/"));
  assert.ok(plan.command.deny_roots.includes(plan.read_policy.protected_roots[0].path));
  for(const root of [base.controller_root,base.private_root,base.workspace_root,plan.codex_home,plan.runtime.root])assert.ok(plan.command.deny_roots.includes(root));
  assert.ok(plan.command.argv.includes('permissions.ask_synthetic_pilot.extends=":read-only"'));
  assert.ok(!plan.command.argv.includes('permissions.ask_synthetic_pilot.extends=":workspace"'));
  const grant=codexPhasePermission(plan,"evaluate","new-approval-reference");
  assert.equal(grant.kind,"ask_local_codex_declared_read_permission_v1");
  assert.deepEqual(grant.trusted_cli_policy.read_policy,plan.read_policy);
  assert.notEqual(grant.plan_digest,codexPhasePermission(closed.plan,"evaluate","new-approval-reference").plan_digest);
  const launches=codexProbeLaunches(plan,base,[]),argv=launches[3].argv.slice(0,launches[3].argv.indexOf("--")+1);
  const filesystem=argv.find(x=>x.startsWith("permissions.ask_synthetic_pilot.filesystem="));
  assert.doesNotThrow(()=>assertProbeSandboxArgs(argv,{filesystem,declaredRead:true}));
  assert.throws(()=>assertProbeSandboxArgs(argv,{filesystem}));
  for(const replacement of [':workspace',':minimal'])assert.throws(()=>assertProbeSandboxArgs(argv.map(x=>x.replace(':read-only',replacement)),{filesystem,declaredRead:true}));
  assert.throws(()=>assertProbeSandboxArgs(argv.filter(x=>!x.includes('.extends=')),{filesystem,declaredRead:true}));
});
for(const readPolicy of [null,{}, {kind:DECLARED_READ_POLICY,riskAcknowledged:false,protectedRootsComplete:true,protectedRoots:[]},
  {kind:DECLARED_READ_POLICY,riskAcknowledged:true,protectedRootsComplete:false,protectedRoots:[]},
  {kind:DECLARED_READ_POLICY,riskAcknowledged:true,protectedRootsComplete:true,protectedRoots:["/"]},
  {kind:DECLARED_READ_POLICY,riskAcknowledged:true,protectedRootsComplete:true,protectedRoots:["relative"]}])test("incomplete/invalid broad selection fails closed",t=>{
    assert.throws(()=>prepared(t,{readPolicy}));
});
test("candidate two-trial simulation and replay retain explicit broad risk without source/runtime reads",t=>{
  const {privateRoot,plan}=prepared(t,{readPolicy:true});
  const report=runCodexConnection(privateRoot);
  assert.equal(report.stop,null);assert.deepEqual(report.slots.map(x=>x.grade.status),["pass","pass"]);
  assert.equal(report.preflight.evidence_class,"synthetic_only");assert.equal(report.model_calls,0);
  assert.deepEqual(report.read_policy,plan.read_policy);
  assert.deepEqual(report.preflight.filesystem_canary_scope,["synthetic_grading_material","other_trial","synthetic_auth_material","declared_copy","unrelated_read_allowed_write_denied"]);
  const before=snapshot(privateRoot);
  rmSync(plan.runtime.root,{recursive:true});rmSync(plan.codex_home,{recursive:true});
  rmSync(plan.read_policy.protected_roots[0].path,{recursive:true});
  const reopened=JSON.parse(execFileSync(process.execPath,[ENTRY,"reopen",privateRoot],{env:{PATH:""},encoding:"utf8"}));
  assert.deepEqual(reopened,report);assert.deepEqual(snapshot(privateRoot),before);
  assert.throws(()=>runCodexConnection(privateRoot));
});
for(const probeOutcome of ["unrelated-read-denied","unrelated-write-open","declared-read-open","network-open","network-unknown","write-open","extra-keys"])test(`candidate ${probeOutcome} stops before both trials`,t=>{
  const {privateRoot}=prepared(t,{readPolicy:true,probeOutcome});
  const report=runCodexConnection(privateRoot);
  assert.equal(report.stop,"model_free_preflight_failed");assert.equal(report.retry,0);
  assert.deepEqual(report.slots.map(x=>x.state),["not_started","not_started"]);
  assert.deepEqual(reopenCodexConnection(privateRoot),report);
});
test("candidate exact session boundary refuses added tmp write, missing root and undeclared read",t=>{
  const {privateRoot,plan,base}=prepared(t,{readPolicy:true});runCodexConnection(privateRoot);
  const stdout=readFileSync(join(privateRoot,"plain/stdout.bin"));
  const original=readFileSync(join(privateRoot,"plain/session.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
  const parse=rows=>parsePilotNativeSession({stdout,session:Buffer.from(rows.map(x=>JSON.stringify(x)).join("\n")+"\n"),
    plan:{...base,command:plan.command},workspace:join(base.workspace_root,"plain"),sessionHome:plan.codex_home});
  assert.doesNotThrow(()=>parse(original));
  for(const mode of ["tmp-write","no-root","extra-read","removed-deny"]){
    const rows=structuredClone(original),entries=rows.find(x=>x.type==="turn_context").payload.permission_profile.file_system.entries;
    if(mode==="tmp-write")entries.push({path:{type:"path",path:"/tmp"},access:"write"});
    if(mode==="extra-read")entries.push({path:{type:"path",path:"/unexpected"},access:"read"});
    if(mode==="no-root")entries.splice(entries.findIndex(x=>x.path.type==="special"),1);
    if(mode==="removed-deny")entries.splice(entries.findIndex(x=>x.path.path===plan.read_policy.protected_roots[0].path),1);
    assert.throws(()=>parse(rows));
  }
});
test("protected inventory metadata replacement fails before any command",t=>{
  const {privateRoot,plan}=prepared(t,{readPolicy:true});
  const root=plan.read_policy.protected_roots[0].path;
  rmSync(root,{recursive:true});writeFileSync(root,"replacement",{mode:0o600});
  assert.throws(()=>runCodexConnection(privateRoot),/protected root identity drift/);
  assert.equal(readdirSync(privateRoot).includes("connection-run-claim.json"),false);
});

test("closed grant and strict grant cannot promote candidate simulation or match its envelope",t=>{
  const closed=prepared(t),candidate=prepared(t,{readPolicy:true});
  const old=codexPhasePermission(closed.plan,"evaluate","old-closed-approval");
  const strict=codexPhasePermission(candidate.plan,"probe","old-strict-approval");
  for(const grant of [old,strict]){
    assert.throws(()=>evaluateCodexConnection(candidate.privateRoot,grant),/permission cannot promote simulation/);
    assert.equal(readdirSync(candidate.privateRoot).includes("connection-run-claim.json"),false);
  }
  const fresh=codexPhasePermission(candidate.plan,"evaluate","new-candidate-approval");
  assert.notDeepEqual(old,fresh);assert.notDeepEqual(strict,fresh);
  const changed=structuredClone(candidate.plan);changed.read_policy.risk_acknowledged=false;
  assert.throws(()=>codexTrialLaunch(changed,candidate.base,"plain"));
  assert.throws(()=>codexPhasePermission(changed,"evaluate","new-candidate-approval"));
});
test("declared root overlapping current workspace or runtime image refuses without execution",t=>{
  const {plan,base}=prepared(t,{readPolicy:true});
  for(const path of [base.workspace_root,dirname(base.node.executable),"/"]){
    const changed=structuredClone(plan);changed.read_policy.protected_roots[0].path=path;
    changed.command=codexConnectionCommand(changed,base);
    assert.throws(()=>codexTrialLaunch(changed,base,"plain"));
  }
});

test("candidate session comparison ignores object key and entry order",()=>{
  const workspace="/synthetic/workspace/plain",denyRoots=["/synthetic/private","/synthetic/workspace"];
  const entries=[{access:"write",path:{path:workspace,type:"path"}},
    {access:"read",path:{value:{kind:"root"},type:"special"}},
    ...denyRoots.map(path=>({access:"deny",path:{path,type:"path"}}))];
  assert.doesNotThrow(()=>declaredSessionEntries({entries,workspace,denyRoots,runtimeParent:"/synthetic/home/tmp/arg0"}));
  entries.push({access:"write",path:{path:"/tmp",type:"path"}});
  assert.throws(()=>declaredSessionEntries({entries,workspace,denyRoots,runtimeParent:"/synthetic/home/tmp/arg0"}));
});

async function diagnosticCanary(outcome="pass",stderrValue,{shell="/synthetic-shell",tmp="/synthetic-workspace/.ask-tmp"}={}) {
  const {createHash}=await import("node:crypto");
  const spec={publicFile:"public",allowedWrite:"write",deniedReads:["private"],deniedWrite:"other",temporaryDirectory:tmp,shell,endpoints:[{host:"127.0.0.1"},{host:"::1"}]};
  const env=Object.fromEntries(["TMPDIR","TMP","TEMP"].map(k=>[k,outcome==="environment"?"/wrong":tmp]));
  const files=new Map(),invocations=[],cleanup=[];let output="",shellCalls=0;
  const secret="PRIVATE_PATH_TOKEN_must_not_be_recorded";
  const error=()=>Object.assign(Error(secret),{code:outcome==="other-error"?secret:outcome==="timeout"?"ETIMEDOUT":outcome==="buffer"?"ENOBUFS":"EPERM"});
  await runInNewContext(`(async()=>{${INLINE_CANARY_MODULE_SOURCE.replace(/^import .*;\n/gmu,"")}})()`,{
    Buffer,createHash,process:{env,argv:["node",JSON.stringify(spec)],stdout:{write:x=>{output+=x;}}},
    readFileSync:p=>p==="public"?"ASK_PUBLIC_CANARY\n":outcome==="read"?"wrong":files.get(p),
    writeFileSync:(p,v)=>{if(p.endsWith("roundtrip.txt")&&outcome==="write")throw error();files.set(p,v);},
    mkdtempSync:p=>{if(outcome==="directory")throw error();return p+"unique";},
    unlinkSync:p=>{cleanup.push(["unlink",p]);files.delete(p);},rmdirSync:p=>{cleanup.push(["rmdir",p]);if(outcome==="cleanup")throw error();},
    openSync:()=>{throw error();},closeSync:()=>{},
    spawnSync:(executable,args,options)=>{
      invocations.push({executable,args,options});
      shellCalls++;if(outcome==="shell-throw")throw error();
      return {status:outcome==="exit"?2:0,error:["error","other-error","timeout","buffer"].includes(outcome)?error():undefined,
        signal:outcome==="signal"?"SIGKILL":null,stdout:outcome==="stdout"?secret:outcome==="missing-output"?null:args[1].split("cat <<'ASK_TEMP_END'\n")[1].split("ASK_TEMP_END\n")[0],
        stderr:stderrValue!==undefined?stderrValue:outcome==="zsh-prefix-denial"?`${args[2]}:2: can't create temp file for here document: operation not permitted\n`:outcome==="stderr"?secret:""};
    },
    createConnection:()=>{const socket=new EventEmitter();socket.destroy=()=>{};socket.setTimeout=()=>{};queueMicrotask(()=>socket.emit("error",{code:"EPERM"}));return socket;},
  });
  assert.ok(!output.includes(secret));return {result:JSON.parse(output),shellCalls,invocations,cleanup,files};
}
for(const tmp of ["/synthetic workspace/.ask-tmp",'/synthetic-$(`touch BAD`);\'"\\\nΩ/.ask-tmp'])test(`zsh prefix is positional data inside owned canary directory ${JSON.stringify(tmp)}`,async()=>{
  const {result,invocations,cleanup,files}=await diagnosticCanary("pass",undefined,{shell:"/bin/zsh",tmp});
  const body="ASK_TEMP_CANARY".repeat(8192)+"\n",directory=tmp+"/canary-unique";
  assert.equal(invocations.length,1);
  const {executable,args,options}=invocations[0];assert.equal(executable,"/bin/zsh");
  assert.equal(args.length,4);assert.equal(args[0],"-c");assert.equal(args[2],"zsh");assert.equal(args[3],directory+"/zsh");
  assert.equal(args[1].slice(0,args[1].indexOf("cat <<")),'TMPPREFIX="$1" || exit 1\n');
  assert.equal(createHash("sha256").update(args[1]).digest("hex"),createHash("sha256").update(`TMPPREFIX="$1" || exit 1\ncat <<'ASK_TEMP_END'\n${body}ASK_TEMP_END\n`).digest("hex"));
  assert.ok(!args[1].includes(tmp));
  assert.equal(options.timeout,2000);assert.equal(options.maxBuffer,256*1024);
  for(const key of ["TMPDIR","TMP","TEMP"])assert.equal(options.env[key],tmp);
  assert.deepEqual(cleanup,[["unlink",directory+"/roundtrip.txt"],["rmdir",directory]]);assert.equal(files.has(directory+"/roundtrip.txt"),false);
  assertCanaryResult(result,{temporary:true,diagnostics:true,stderrClassification:true});
  assert.ok(!JSON.stringify(result).includes(tmp));
});
test("Linux sh heredoc invocation remains unchanged",async()=>{
  const {invocations}=await diagnosticCanary("pass",undefined,{shell:"/bin/sh"});
  assert.equal(invocations[0].executable,"/bin/sh");
  const args=invocations[0].args;assert.equal(args.length,2);assert.equal(args[0],"-c");
  assert.equal(createHash("sha256").update(args[1]).digest("hex"),createHash("sha256").update(`cat <<'ASK_TEMP_END'\n${"ASK_TEMP_CANARY".repeat(8192)}\nASK_TEMP_END\n`).digest("hex"));
});
test("zsh prefix keeps fixed diagnostic name and existing line-number classification",async()=>{
  // Upstream zsh uses the post-command $0 argument as its diagnostic prefix.
  const {result,shellCalls,cleanup}=await diagnosticCanary("zsh-prefix-denial",undefined,{shell:"/bin/zsh"});
  assert.equal(shellCalls,1);assert.equal(cleanup.length,2);
  assert.equal(result.temporary_diagnostics.shell.stderr_classification,"temporary_file_denial_message");
  assert.equal(result.filesystem.temporary,"fail");
  assert.throws(()=>assertCanaryResult(result,{temporary:true,diagnostics:true,stderrClassification:true}),/canary/u);
});
for(const outcome of ["exit","timeout","stderr","shell-throw","cleanup"])test(`zsh prefix preserves fail-stop and cleanup: ${outcome}`,async()=>{
  const {result,shellCalls,cleanup}=await diagnosticCanary(outcome,undefined,{shell:"/bin/zsh"});
  assert.equal(shellCalls,1);assert.equal(cleanup.length,2);
  assert.equal(result.filesystem.temporary,["shell-throw","cleanup"].includes(outcome)?"unknown":"fail");
  assert.throws(()=>assertCanaryResult(result,{temporary:true,diagnostics:true,stderrClassification:true}),/canary/u);
});
for(const [outcome,check] of [["pass",null],["exit","exit_zero"],["error","no_error"],["signal","no_signal"],["stdout","stdout_matches"],["stderr","stderr_empty"],["missing-output","stdout_matches"],["other-error","no_error"],["timeout","no_error"],["buffer","no_error"]])test(`bounded shell diagnostics separate condition: ${outcome}`,async()=>{
  const {result,shellCalls}=await diagnosticCanary(outcome);
  assert.equal(result.kind,"ask_codex_canary_v5");assert.equal(shellCalls,1);
  const d=result.temporary_diagnostics;
  for(const stage of ["environment","directory","write","read","cleanup"])assert.equal(d.stages[stage],"pass");
  assert.equal(d.stages.shell,outcome==="pass"?"pass":"fail");
  if(check)assert.equal(d.shell.checks[check],false);
  if(outcome==="pass"){
    assertCanaryResult(result,{temporary:true,diagnostics:true,stderrClassification:true});
    assert.equal(d.shell.stdout.bytes,122881);assert.match(d.shell.stdout.digest,/^sha256:[0-9a-f]{64}$/u);
    assert.equal(d.shell.stderr.bytes,0);
    for(const mutate of [r=>delete r.temporary_diagnostics,r=>r.temporary_diagnostics.shell.status=2,r=>r.temporary_diagnostics.shell.checks.stdout_matches=false,r=>r.temporary_diagnostics.shell.stderr.raw="secret",r=>r.temporary_diagnostics.shell.stdout.digest="sha256:"+"0".repeat(64),r=>r.temporary_diagnostics.shell.stderr.digest="sha256:"+"0".repeat(64),r=>r.temporary_diagnostics.shell.error_code="SECRET"]){
      const bad=structuredClone(result);mutate(bad);assert.throws(()=>assertCanaryResult(bad,{temporary:true,diagnostics:true,stderrClassification:true}),/canary/u);
    }
  }else assert.throws(()=>assertCanaryResult(result,{temporary:true,diagnostics:true,stderrClassification:true}),/canary/u);
  if(outcome==="other-error")assert.equal(d.shell.error_code,"OTHER");
});
for(const outcome of ["environment","directory","write","read","shell-throw","cleanup"])test(`bounded temporary diagnostics identify stage: ${outcome}`,async()=>{
  const {result,shellCalls}=await diagnosticCanary(outcome),d=result.temporary_diagnostics;
  assert.equal(result.filesystem.temporary,"unknown");
  assert.equal(d.failure_stage,outcome==="shell-throw"?"shell":outcome);
  assert.equal(shellCalls,["shell-throw","cleanup"].includes(outcome)?1:0);
  assert.throws(()=>assertCanaryResult(result,{temporary:true,diagnostics:true,stderrClassification:true}),/canary/u);
});
test("legacy canary admission remains explicit while new controls require diagnostics",()=>{
  for(const [kind,declaredRead,temporary] of [["ask_codex_canary_v1",false,false],["ask_codex_canary_v2",true,false],["ask_codex_canary_v3",true,true]]){
    const result={kind,filesystem:{read:"pass",write:"pass",...(declaredRead?{unrelated_read:"pass",unrelated_write:"pass"}:{}),...(temporary?{temporary:"pass"}:{})},network:[{host:"127.0.0.1",positive:"pass",denied:"pass"},{host:"::1",positive:"pass",denied:"pass"}]};
    assertCanaryResult(result,{declaredRead,temporary});
    assert.throws(()=>assertCanaryResult(result,{declaredRead,temporary:true,diagnostics:true}),/canary/u);
  }
});

for(const [stderr,classification] of [
  ["","empty"],
  ["zsh:1: can't create temp file for here document: operation not permitted\n","temporary_file_denial_message"],
  ["zsh: can't create temp file for here document: permission denied\n","temporary_file_denial_message"],
  ["zsh:1: command not found: cat\n","command_not_found_message"],
  ["zsh:1: command not found: PRIVATE_PATH_TOKEN_must_not_be_recorded\n","unknown"],
  ["zsh:1: can't create temp file for here document: permission denied\nextra private content","unknown"],
  ["zsh:1: permission denied: /private/secret-auth-file\n","unknown"],
  ["permission denied","unknown"],
  ["zsh:1: command not found: cat\nzsh:1: can't create temp file for here document: permission denied\n","unknown"],
  ["zsh:1: command not found: cat\n\n","unknown"],
  ["zsh:1: command not found: cat\u2028","unknown"],
  [null,"unknown"],
])test(`stderr classification closed synthetic case ${classification} ${String(stderr).length}`,async()=>{
  const {result}=await diagnosticCanary("pass",stderr);
  assert.equal(result.kind,"ask_codex_canary_v5");
  assert.equal(result.temporary_diagnostics.shell.stderr_classification,classification);
  const recorded=JSON.stringify(result);
  for(const raw of ["/private/secret-auth-file","extra private content","command not found:","can't create temp file"])assert.ok(!recorded.includes(raw));
  if(stderr!=="")assert.equal(result.filesystem.temporary,"fail");
});
test("classified v5 requires empty code; legacy v4 validation stays explicit",async()=>{
  const {result}=await diagnosticCanary();
  assertCanaryResult(result,{temporary:true,diagnostics:true,stderrClassification:true});
  for(const value of [undefined,"unknown","temporary_file_denial_message","command_not_found_message","/private/raw-secret",null,{},false]){
    const bad=structuredClone(result);
    if(value===undefined)delete bad.temporary_diagnostics.shell.stderr_classification;
    else bad.temporary_diagnostics.shell.stderr_classification=value;
    assert.throws(()=>assertCanaryResult(bad,{temporary:true,diagnostics:true,stderrClassification:true}),/canary/u);
  }
  const raw=structuredClone(result);raw.temporary_diagnostics.shell.raw_stderr="/private/raw-secret";
  assert.throws(()=>assertCanaryResult(raw,{temporary:true,diagnostics:true,stderrClassification:true}),/canary/u);
  const legacy=structuredClone(result);legacy.kind="ask_codex_canary_v4";delete legacy.temporary_diagnostics.shell.stderr_classification;
  assertCanaryResult(legacy,{temporary:true,diagnostics:true});
  assert.throws(()=>assertCanaryResult(legacy,{temporary:true,diagnostics:true,stderrClassification:true}),/canary/u);
});

// New policy simulations use only the owned fake child, never a native CLI/home.
const {CODEX_TIME_POLICY}=await import("./ask-local-codex-time-budget.mjs");
for(const broad of [false,true])test(`turn budget opt-in preserves policy and identical replay (broad=${broad})`,async t=>{
  const {privateRoot,plan,base}=prepared(t,{readPolicy:broad?true:undefined,timePolicy:CODEX_TIME_POLICY});
  assert.equal(plan.kind,broad?"ask_local_codex_connection_v5":"ask_local_codex_connection_v4");
  assert.equal(plan.constraints.timeout_ms,240000);
  assert.deepEqual(codexTrialLaunch(plan,base,"plain").timeout,codexTrialLaunch(plan,base,"kernel_only").timeout);
  const permission=codexPhasePermission(plan,"evaluate","fresh-synthetic-approval");
  assert.deepEqual(permission.time_policy,CODEX_TIME_POLICY);
  const report=await evaluateCodexConnection(privateRoot);
  assert.equal(report.stop,null);assert.equal(report.retry,0);assert.equal(report.model_calls,0);
  for(const slot of report.slots) {assert.equal(slot.time_budget.stop,null);assert.equal(slot.time_budget.completion_received,true);assert.equal(slot.grade.status,"pass");}
  assert.deepEqual(reopenCodexConnection(privateRoot),report);
  assert.throws(()=>evaluateCodexConnection(privateRoot));
});
for(const scenario of ["unknown","identity","time-identity","duplicate-start","timeout","provider","threshold"])test(`turn budget fails closed before kernel: ${scenario}`,async t=>{
  const {privateRoot}=prepared(t,{timePolicy:CODEX_TIME_POLICY,scenarios:[scenario,"pass"],...(scenario==="timeout"?{fakeTimeoutMs:100}: {})});
  const report=await evaluateCodexConnection(privateRoot);
  assert.notEqual(report.stop,null);assert.equal(report.slots[1].state,"not_started");assert.equal(report.retry,0);
  if(scenario==="timeout")assert.equal(report.slots[0].process.timeout,true);
  assert.deepEqual(reopenCodexConnection(privateRoot),report);
});
test("time policy cannot be widened or attached to a legacy plan",t=>{
  assert.throws(()=>prepared(t,{timePolicy:{...CODEX_TIME_POLICY,absolute_ms:999999}}),/closed time policy/);
  const {privateRoot,plan}=prepared(t);
  plan.time_policy=CODEX_TIME_POLICY;
  writeFileSync(join(privateRoot,"connection.json"),JSON.stringify(plan));
  writeFileSync(join(privateRoot,"connection-digest.json"),JSON.stringify({digest:canonicalDigest(plan)}));
  assert.throws(()=>reopenCodexConnection(privateRoot),/legacy plan cannot acquire/);
});

// Public synthetic budget cases; no private experiment records are fixtures.
const {CODEX_COMPARISON_TOKEN_POLICY,codexTokenThreshold}=await import("./ask-local-codex.mjs");
const selectedBudget=()=>({timePolicy:CODEX_TIME_POLICY,tokenPolicy:CODEX_COMPARISON_TOKEN_POLICY});
for(const broad of [false,true])test(`comparison token budget is explicit and source/permission/replay bound: ${broad}`,async t=>{
  assert.ok(CODEX_COMPARISON_TOKEN_POLICY);
  const {privateRoot,plan,base}=prepared(t,{...selectedBudget(),readPolicy:broad?true:undefined,scenarios:["threshold","pass"]});
  assert.equal(plan.kind,broad?"ask_local_codex_connection_v7":"ask_local_codex_connection_v6");
  assert.equal(plan.constraints.trial_tokens,50000);assert.equal(plan.constraints.cumulative_tokens,100000);
  assert.equal(plan.constraints.timeout_ms,240000);assert.equal(plan.constraints.retry,0);
  const oldShape={...plan,kind:broad?"ask_local_codex_connection_v5":"ask_local_codex_connection_v4"};delete oldShape.token_policy;
  assert.deepEqual(codexConnectionCommand(plan,base),codexConnectionCommand(oldShape,base));
  const grant=codexPhasePermission(plan,"evaluate","fresh-synthetic-budget-approval");assert.deepEqual(grant.token_policy,CODEX_COMPARISON_TOKEN_POLICY);
  const report=await evaluateCodexConnection(privateRoot);assert.equal(report.stop,null);assert.equal(report.slots[1].state,"completed");assert.deepEqual(report.token_policy,CODEX_COMPARISON_TOKEN_POLICY);
  const before=snapshot(privateRoot);assert.deepEqual(reopenCodexConnection(privateRoot),report);assert.deepEqual(snapshot(privateRoot),before);
});
for(const [scenario,total,stop] of [["token-below",49999,null],["token-at",50000,"trial_token_threshold"],["token-over",50001,"trial_token_threshold"],["unknown-usage",null,"usage_unknown"]])test(`comparison token threshold ${scenario}`,async t=>{
  assert.ok(CODEX_COMPARISON_TOKEN_POLICY);
  const {privateRoot}=prepared(t,{...selectedBudget(),scenarios:[scenario,"pass"]});const report=await evaluateCodexConnection(privateRoot);
  assert.equal(report.stop,stop);assert.equal(report.slots[0].usage.value,total);assert.equal(report.slots[1].state,stop?"not_started":"completed");assert.equal(report.retry,0);assert.deepEqual(reopenCodexConnection(privateRoot),report);
});
test("comparison cumulative accounting uses the same known totals for both conditions",async t=>{
  assert.ok(CODEX_COMPARISON_TOKEN_POLICY);
  const {privateRoot,plan}=prepared(t,{...selectedBudget(),scenarios:["token-below","token-below"]});const report=await evaluateCodexConnection(privateRoot);
  assert.equal(report.total_known_tokens,99998);assert.equal(report.stop,null);
  for(const [value,stop] of [[99999,null],[100000,"cumulative_token_threshold"],[100001,"cumulative_token_threshold"]])assert.equal(codexTokenThreshold(plan,value,"cumulative"),stop);
  assert.throws(()=>codexTokenThreshold(plan,NaN,"cumulative"));assert.throws(()=>codexTokenThreshold(plan,-1,"trial"));assert.throws(()=>codexTokenThreshold(plan,10,"unknown"));
});
test("comparison policy is closed, requires time policy and cannot widen a legacy plan",t=>{
  assert.ok(CODEX_COMPARISON_TOKEN_POLICY);
  for(const tokenPolicy of [{...CODEX_COMPARISON_TOKEN_POLICY,trial_tokens:999999},{...CODEX_COMPARISON_TOKEN_POLICY,extra:true}])assert.throws(()=>prepared(t,{timePolicy:CODEX_TIME_POLICY,tokenPolicy}),/token policy/);
  assert.throws(()=>prepared(t,{tokenPolicy:CODEX_COMPARISON_TOKEN_POLICY}),/time policy/);
  const {privateRoot,plan}=prepared(t,{timePolicy:CODEX_TIME_POLICY});plan.token_policy=CODEX_COMPARISON_TOKEN_POLICY;
  writeFileSync(join(privateRoot,"connection.json"),JSON.stringify(plan));writeFileSync(join(privateRoot,"connection-digest.json"),JSON.stringify({digest:canonicalDigest(plan)}));
  assert.throws(()=>reopenCodexConnection(privateRoot),/legacy plan cannot acquire token policy/);
});
for(const variant of ["old","missing","changed"])test(`comparison exact permission rejects ${variant} budget before claims`,t=>{
  assert.ok(CODEX_COMPARISON_TOKEN_POLICY);
  const {privateRoot,plan}=prepared(t,selectedBudget());plan.mode="planned_live";
  writeFileSync(join(privateRoot,"connection.json"),JSON.stringify(plan));
  writeFileSync(join(privateRoot,"connection-digest.json"),JSON.stringify({digest:canonicalDigest(plan)}));
  writeFileSync(join(plan.runtime.root,"runtime-owner.json"),JSON.stringify({kind:"owned_external_runtime_v1",evidence_root:privateRoot,plan_digest:canonicalDigest(plan)}));
  let grant=codexPhasePermission(plan,"evaluate","fresh-synthetic-budget-approval");
  if(variant==="old") {const old={...plan,kind:"ask_local_codex_connection_v4"};delete old.token_policy;grant=codexPhasePermission(old,"evaluate","old-synthetic-budget-approval");}
  else if(variant==="missing")delete grant.token_policy;
  else grant.token_policy={...grant.token_policy,trial_tokens:60000};
  const before=snapshot(privateRoot);assert.throws(()=>evaluateCodexConnection(privateRoot,grant),/fresh exact phase permission/);assert.deepEqual(snapshot(privateRoot),before);
});
