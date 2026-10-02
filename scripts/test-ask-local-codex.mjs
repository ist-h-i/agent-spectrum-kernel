import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, linkSync, symlinkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { prepareCodexConnection, runCodexConnection, reopenCodexConnection, codexTrialLaunch, codexProbeLaunches, assertConnectionPermissionShape,
  runCodexProbes, reopenCodexProbes, evaluateCodexConnection, codexPhasePermission, freshAdmissionTime, codexConnectionCommand, codexProbeParentPolicy, assertNativeAdmissionRoute } from "./ask-local-codex.mjs";
import {inspectExistingCodexHome, classifyDenial, assertCanaryResult, probeSeatbelt, assertNoAclListing, assertProbeSandboxArgs} from "./ask-local-codex-boundaries.mjs";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { parsePilotNativeSession, pilotEvidenceInventory } from "./ask-synthetic-json-pilot.mjs";

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "ask-local-codex.mjs");
const json = path => JSON.parse(readFileSync(path, "utf8"));
function prepared(t, options = {}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "ask-connection-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, "owned-home"), parent = join(dir, "workspaces"), runtimeRoot = join(dir,"runtime");
  mkdirSync(home, { mode: 0o700 }); mkdirSync(parent, { mode: 0o700 }); mkdirSync(runtimeRoot,{mode:0o700});
  const result = prepareCodexConnection({ privateRoot: join(dir, "evidence"), workspaceParent: parent, codexHome: home, runtimeRoot }, { simulation: true, ...options });
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
    assert.deepEqual(readdirSync(join(base.workspace_root, condition)).sort(), ["answer.json", "input.json", "task.md"]);
    assert.equal(json(join(privateRoot, condition, "session-check.json")).status, "match");
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
  assert.deepEqual(Object.keys(plain.env).sort(), ["CODEX_HOME", "HOME", "LANG", "LC_ALL", "PATH", "TZ"]);
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

test("probe-only produces sealed synthetic admission without evaluation and evaluate does not repeat probes", t=>{
  const {privateRoot,plan,base,home}=prepared(t);
  const admission=runCodexProbes(privateRoot);
  assert.equal(admission.model_calls,0); assert.equal(admission.evidence_class,"synthetic_only");
  assert.equal(admission.metadata_compatibility,"synthetic_only"); assert.equal(admission.filesystem_enforcement,"synthetic_only");
  assert.deepEqual(admission.filesystem_canary_scope,["synthetic_grading_material","other_trial","synthetic_auth_material","unrelated_file"]);
  assert.equal(readdirSync(home).includes("sessions"),false);
  assert.equal(readdirSync(privateRoot).includes("connection-run-claim.json"),false);
  const before=snapshot(join(privateRoot,"connection-probe"));
  const probe=codexPhasePermission(plan,"probe","new-probe-approval"),evaluate=codexPhasePermission(plan,"evaluate","new-eval-approval",canonicalDigest(admission));
  assert.equal(probe.actions.trials,0); assert.equal(probe.actions.existing_home_cli_read_refresh,false);
  assert.equal(evaluate.actions.probes,0); assert.equal(evaluate.actions.trials,2);
  assert.notDeepEqual(probe,evaluate);
  assert.throws(()=>runCodexProbes(privateRoot));
  const report=evaluateCodexConnection(privateRoot);
  assert.equal(report.stop,null); assert.deepEqual(snapshot(join(privateRoot,"connection-probe")),before);
  assert.deepEqual(reopenCodexProbes(privateRoot),admission); assert.deepEqual(reopenCodexConnection(privateRoot),report);
  const launch=codexTrialLaunch(plan,base,"plain");
  assert.ok(launch.argv.includes(`sqlite_home=${JSON.stringify(join(plan.runtime.root,"plain/home/sqlite"))}`));
  assert.ok(launch.argv.includes(`log_dir=${JSON.stringify(join(plan.runtime.root,"plain/home/log"))}`));
  assert.ok(launch.argv.includes('history.persistence="none"')); assert.ok(launch.argv.includes('memories.generate_memories=false'));
});
test("unsealed probe replay is explicit unknown and cannot launch evaluation", t=>{
  const {privateRoot}=prepared(t),before=snapshot(privateRoot);
  assert.equal(reopenCodexProbes(privateRoot).evidence_class,"unsealed_unknown");
  assert.throws(()=>evaluateCodexConnection(privateRoot),/sealed probe/u); assert.deepEqual(snapshot(privateRoot),before);
});
test("probe bytes are verified again before any evaluation claim", t=>{
  const {privateRoot}=prepared(t);runCodexProbes(privateRoot);
  writeFileSync(join(privateRoot,"connection-probe/check-3/stdout.bin"),"altered\n");
  assert.throws(()=>evaluateCodexConnection(privateRoot),/binding mismatch/u);
  assert.equal(readdirSync(privateRoot).includes("connection-run-claim.json"),false);
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
test("new parent contract is mandatory for execution but saved incomplete replay remains readable", t=>{
  const {privateRoot,plan}=prepared(t),old=structuredClone(plan);delete old.probe_parent_policy;
  writeFileSync(join(privateRoot,"connection.json"),JSON.stringify(old));
  writeFileSync(join(privateRoot,"connection-digest.json"),JSON.stringify({digest:canonicalDigest(old)}));
  assert.equal(reopenCodexProbes(privateRoot).evidence_class,"unsealed_unknown");
  const before=snapshot(privateRoot);assert.throws(()=>runCodexProbes(privateRoot),/parent contract/u);assert.deepEqual(snapshot(privateRoot),before);
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

test("known nested native route has no executable admission or automatic fallback",()=>{
  assert.throws(()=>assertNativeAdmissionRoute({mode:"planned_live",host:{platform:"darwin"}}),/nested Seatbelt route/u);
  assert.throws(()=>assertNativeAdmissionRoute({mode:"planned_live",host:{platform:"linux"}}),/nested Seatbelt route/u);
  assert.doesNotThrow(()=>assertNativeAdmissionRoute({mode:"simulation"}));
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
