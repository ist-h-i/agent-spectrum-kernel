import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { prepareCodexConnection, runCodexConnection, reopenCodexConnection, codexTrialLaunch, codexProbeLaunches, assertConnectionPermissionShape } from "./ask-local-codex.mjs";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { parsePilotNativeSession } from "./ask-synthetic-json-pilot.mjs";

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "ask-local-codex.mjs");
const json = path => JSON.parse(readFileSync(path, "utf8"));
function prepared(t, options = {}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "ask-connection-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, "owned-home"), parent = join(dir, "workspaces");
  mkdirSync(home, { mode: 0o700 }); mkdirSync(parent, { mode: 0o700 });
  const result = prepareCodexConnection({ privateRoot: join(dir, "evidence"), workspaceParent: parent, codexHome: home }, { simulation: true, ...options });
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
  assert.equal(report.preflight.network_enforcement, "not_probed");
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
    assert.equal(received.env.HOME, join(privateRoot, condition, "home"));
    assert.equal(received.argv.at(-1), "-");
    assert.equal(received.env.OPENAI_API_KEY, undefined); assert.equal(received.env.NODE_OPTIONS, undefined);
    assert.deepEqual(readdirSync(join(base.workspace_root, condition)).sort(), ["answer.json", "input.json", "task.md"]);
    assert.equal(json(join(privateRoot, condition, "session-check.json")).status, "match");
    assert.equal(received.argv.includes("resume"), false);
  }
});
for (const [scenario, stop] of [["unknown", "usage_unknown"], ["threshold", "trial_token_threshold"], ["identity", "session_identity_failure"],
  ["exit", "process_failure"], ["missing-session", "session_identity_failure"], ["provider", "provider_stop"], ["interrupt", "process_failure"]]) {
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
    assert.throws(() => runCodexConnection(privateRoot, permission), /fresh exact connection/u);
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
