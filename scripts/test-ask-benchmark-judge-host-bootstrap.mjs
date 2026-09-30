import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { Server } from "node:net";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { prepareJudgeHostBootstrap, runJudgeHostBootstrap, reopenJudgeHostBootstrap,
  validateJudgeBootstrapPermission } from "./ask-benchmark-judge-host-bootstrap.mjs";
import { judgeHostControlPolicy, inspectJudgeHostControlTrace, CONTROL_IDS, JUDGE_HOST_DYLD_CACHE_ROOTS,
  JUDGE_HOST_EXECUTABLE_MAP_ROOTS, JUDGE_HOST_LOADER_READ_ROOTS, JUDGE_HOST_POLICY_REVISION,
  judgeHostControlTemplateDigest } from "./ask-benchmark-judge-host-controls.mjs";
import { captureJudgeProcess, judgeProcessStreamFailure } from "./ask-benchmark-judge-process.mjs";

const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function permissionFor(plan) {
  return { schema_version: "1.0.0", kind: "judge_host_bootstrap_permission", purpose: "model_free_host_bootstrap",
    operator_reference: "synthetic-test-approval-not-human-permission", plan_digest: plan.record_digest, code_digest: plan.source.code_digest,
    not_before: new Date(Date.now() - 60000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
    input_scope: "public_synthetic_only", credential_source: "none", network_scope: "loopback_only",
    max_control_starts: 1, max_codex_starts: 1, provider_calls: 0, automatic_retries: 0 };
}
function context(t, scenario = "success") {
  const parent = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-bootstrap-test-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const evidenceRoot = resolve(parent, "evidence");
  const prepared = prepareJudgeHostBootstrap({ evidenceRoot, mode: "synthetic", scenario });
  const plan = JSON.parse(readFileSync(resolve(evidenceRoot, "plan.json")));
  const permissionPath = resolve(parent, "permission.json"), permission = permissionFor(plan);
  const bytes = Buffer.from(JSON.stringify(permission)); writeFileSync(permissionPath, bytes);
  return { parent, evidenceRoot, plan, permission, permissionPath, planDigest: prepared.plan_digest, expectedPermissionDigest: hash(bytes) };
}
function rehash(root, file, mutate) {
  const path = resolve(root, file), saved = JSON.parse(readFileSync(path));
  const { record_digest, ...body } = saved; mutate(body);
  writeFileSync(path, JSON.stringify({ ...body, record_digest: canonicalDigest(body) }));
}

test("prepare is unstarted and does not create permission, process or request evidence", t => {
  const c = context(t);
  assert.equal(reopenJudgeHostBootstrap(c).state, "not_started");
  assert.equal(existsSync(resolve(c.evidenceRoot, "started.json")), false);
  assert.equal(existsSync(resolve(c.evidenceRoot, "capture.json")), false);
  assert.equal(c.plan.provider_calls, 0);
  assert.equal(c.plan.credential_source, "none");
  assert.throws(() => prepareJudgeHostBootstrap({ evidenceRoot: c.evidenceRoot, mode: "synthetic" }));
});

test("normal public-packet capture reopens, but grants neither live nor measurement authority", async t => {
  const c = context(t), result = await runJudgeHostBootstrap(c);
  assert.equal(result.state, "verified_local", JSON.stringify(result));
  assert.equal(result.request.tool_count, 0);
  assert.equal(result.request.reasoning_effort, "medium");
  assert.equal(result.control.verdict, "passed");
  assert.equal(result.control.synthetic, true);
  assert.equal(result.outer_policy_observed, false);
  for (const key of ["credential_supply_verified", "provider_only_network_verified", "authenticated_session_verified", "live_execution_authorized", "measurement_authorized"])
    assert.equal(result[key], false);
  const before = readFileSync(resolve(c.evidenceRoot, "result.json"));
  assert.deepEqual(reopenJudgeHostBootstrap(c), result);
  assert.deepEqual(await runJudgeHostBootstrap(c), result);
  assert.deepEqual(readFileSync(resolve(c.evidenceRoot, "result.json")), before);
  // Replay is read-only even after the original approval expires or disappears.
  rmSync(c.permissionPath);
  assert.deepEqual(await runJudgeHostBootstrap(c), result);
});

for (const field of ["purpose", "plan_digest", "code_digest", "max_control_starts", "max_codex_starts", "provider_calls", "automatic_retries", "credential_source", "network_scope", "input_scope", "expires_at", "not_before"]) {
  test(`permission ${field} mismatch blocks before any diagnostic start`, async t => {
    const c = context(t); const bad = { ...c.permission };
    if (field === "expires_at") bad[field] = new Date(Date.now() - 1).toISOString();
    else if (field === "not_before") bad[field] = new Date(Date.now() + 3600001).toISOString();
    else if (typeof bad[field] === "number") bad[field] += 1;
    else bad[field] = "qualification";
    const bytes = Buffer.from(JSON.stringify(bad));writeFileSync(c.permissionPath, bytes);
    await assert.rejects(runJudgeHostBootstrap({ ...c, expectedPermissionDigest: hash(bytes) }));
    assert.equal(existsSync(resolve(c.evidenceRoot, "started.json")), false);
  });
}
test("missing or unpinned permission is not inferred from a plan or candidate record", async t => {
  const c = context(t);
  await assert.rejects(runJudgeHostBootstrap({ ...c, expectedPermissionDigest: undefined }), /permission_pin_required/);
  await assert.rejects(runJudgeHostBootstrap({ ...c, expectedPermissionDigest: hash(Buffer.from("other")) }), /permission_pin/);
  rmSync(c.permissionPath);
  await assert.rejects(runJudgeHostBootstrap(c));
  assert.equal(existsSync(resolve(c.evidenceRoot, "started.json")), false);
});

test("whole-child policy denies by default and has no broad network/user-data allowance", () => {
  const policy = judgeHostControlPolicy("/private/tmp/test-bootstrap", 52345);
  assert.ok(policy.includes("(deny default)"));
  assert.ok(policy.includes('(remote ip "localhost:52345")'));
  assert.ok(policy.includes('require-not (literal "/private/tmp/test-bootstrap/protected-canary.txt")'));
  for (const forbidden of ['(allow network-outbound)', '(subpath "/")', '(subpath "/System")', '(allow process-exec)', 'auth.json']) assert.equal(policy.includes(forbidden), false);
  for (const value of [0, -1, 65536, 2.5, "52345"]) assert.throws(() => judgeHostControlPolicy("/private/tmp/test-bootstrap", value));
  assert.throws(() => judgeHostControlPolicy("/tmp/evil\n(allow default)", 23456));
});

test("loader policy maps fixed system roots and target dyld cache aliases without broad host reads", () => {
  const policy = judgeHostControlPolicy("/private/tmp/test-bootstrap", 52345);
  assert.equal(JUDGE_HOST_POLICY_REVISION, "seatbelt-loopback-bootstrap-v4");
  assert.ok(policy.includes("(allow file-map-executable"));
  for (const root of JUDGE_HOST_EXECUTABLE_MAP_ROOTS)
    assert.ok(policy.includes(`(subpath ${JSON.stringify(root)})`), `missing map root ${root}`);
  for (const root of JUDGE_HOST_LOADER_READ_ROOTS)
    assert.ok(policy.includes(`(subpath ${JSON.stringify(root)})`), `missing read root ${root}`);
  for (const root of JUDGE_HOST_DYLD_CACHE_ROOTS.slice(1))
    assert.ok(policy.includes(`(path-ancestors ${JSON.stringify(root)})`), `missing dyld ancestor traversal ${root}`);
  for (const broad of ["/System", "/Library", "/System/Volumes/Preboot", "/private/preboot"])
    assert.equal(policy.includes(`(subpath ${JSON.stringify(broad)})`), false, `broad read root ${broad}`);
});

test("loader policy includes the macOS 26 Cryptex dyld cache observed by Stage B", () => {
  const observed = "/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld";
  assert.ok(JUDGE_HOST_DYLD_CACHE_ROOTS.includes(observed));
  const policy = judgeHostControlPolicy("/private/tmp/test-bootstrap", 52345);
  assert.ok(policy.includes(`(subpath ${JSON.stringify(observed)})`));
  assert.ok(policy.includes(`(path-ancestors ${JSON.stringify(observed)})`));
});

test("loader root directory open has a literal-only data allowance, never recursive root access", () => {
  const policy = judgeHostControlPolicy("/private/tmp/test-bootstrap", 52345);
  assert.ok(policy.includes('(allow file-read-data (literal "/"))\n'));
  for (const broad of ["/", "/System", "/Library", "/System/Volumes/Preboot", "/private/preboot"])
    assert.equal(policy.includes(`(subpath ${JSON.stringify(broad)})`), false);
  assert.equal(policy.includes('(allow file-read* (literal "/"))'), false);
  assert.equal(policy.includes('(allow file-write* (literal "/"))'), false);
  assert.equal(policy.includes('(allow file-map-executable (literal "/"))'), false);
});

test("root directory loader correction invalidates the historical v3 policy template", () => {
  assert.notEqual(judgeHostControlTemplateDigest(),
    "sha256:bde04f7c13658e878401373ec1d6f6c2ac28ac2f1ac08a21cd0b5d71e5cb4e98");
});

test("all-denied operations, absent canaries and refused TCP cannot pass control verification", () => {
  const positives = new Set(["read_allowed", "write_allowed", "read_protected", "connect_allowed"]);
  const value = { type: "host_control_result", mode: "synthetic", results: CONTROL_IDS.map(id => ({ id, ok: positives.has(id), errno: positives.has(id) ? 0 : 13 })) };
  const input = { mode: "synthetic", deniedConnections: 0, baselineReachable: true, canariesUnchanged: true };
  const encoded = v => Buffer.from(JSON.stringify(v));
  assert.equal(inspectJudgeHostControlTrace(encoded(value), input).verdict, "passed");
  for (let index = 0; index < value.results.length; index++) {
    const changed = structuredClone(value); changed.results[index] = { ...changed.results[index], ok: !value.results[index].ok, errno: value.results[index].ok ? 13 : 0 };
    assert.equal(inspectJudgeHostControlTrace(encoded(changed), input).verdict, "failed");
  }
  for (const errno of [2, 61, 60, 111, 110]) {
    const changed = structuredClone(value);changed.results.at(-1).errno = errno;
    assert.equal(inspectJudgeHostControlTrace(encoded(changed), input).verdict, "failed");
  }
  for (const change of [{ deniedConnections: 1 }, { baselineReachable: false }, { canariesUnchanged: false }])
    assert.equal(inspectJudgeHostControlTrace(encoded(value), { ...input, ...change }).verdict, "failed");
});

test("unconfined real syscalls fail controls and never reach even the scripted CLI", async t => {
  const c = context(t, "unconfined_controls"), result = await runJudgeHostBootstrap(c);
  assert.equal(result.state, "failed");
  assert.equal(result.control.verdict, "failed");
  assert.ok(result.control.failed_controls.includes("read_forbidden"));
  assert.ok(result.control.failed_controls.includes("write_auth_link"));
  assert.ok(result.control.failed_controls.includes("connect_forbidden"));
  assert.equal(existsSync(resolve(c.evidenceRoot, "capture.json")), false);
  assert.equal(result.request?.request_count ?? 0, 0);
  assert.deepEqual(await runJudgeHostBootstrap(c), result);
});
for (const scenario of ["zero", "multiple", "tools", "authorization", "timeout", "invalid_stream", "tool_event"]) {
  test(`${scenario} is saved as failure; replay never retries`, async t => {
    const c = context(t, scenario), result = await runJudgeHostBootstrap(c);
    assert.equal(result.state, "failed");
    assert.equal(result.live_execution_authorized, false);
    assert.deepEqual(await runJudgeHostBootstrap(c), result);
  });
}
for (const scenario of ["invalid_tail", "tool_tail"]) {
  test(`${scenario} after a valid request cannot become verified_local`, async t => {
    const c = context(t, scenario), result = await runJudgeHostBootstrap(c);
    assert.equal(result.request.request_count, 1);
    const captured = JSON.parse(readFileSync(resolve(c.evidenceRoot, "capture.json")));
    assert.equal(result.state, "failed", JSON.stringify({ result, captured }));
    assert.equal(captured.cause, "incomplete_event_stream");
    assert.equal(readFileSync(resolve(c.evidenceRoot, "capture.stdout")).at(-1) === 10, false);
    assert.deepEqual(reopenJudgeHostBootstrap(c), result);
    assert.deepEqual(await runJudgeHostBootstrap(c), result);
  });
}

for (const file of ["request-1.bin", "request-1.json", "control.stdout", "capture.stdout", "model-catalog.json", "instruction.txt", "response-schema.json", "stdin.bin", "outer-policy.sbpl", "home/.codex/config.toml", "codex-native", "control-native", "permission.json", "protected-canary.txt", "forbidden-canary.txt", "scratch/allowed-write"]) {
  test(`tampered ${file} is rejected without executing or repairing`, async t => {
    const c = context(t); await runJudgeHostBootstrap(c);
    const path = resolve(c.evidenceRoot, file);chmodSync(path, 0o600);writeFileSync(path, "tampered");
    assert.throws(() => reopenJudgeHostBootstrap(c));
    await assert.rejects(runJudgeHostBootstrap(c));
  });
}
for (const field of ["environment", "capture_command", "control_command", "policy_digest"]) {
  test(`rehashing a changed ${field} does not validate a different launch`, async t => {
    const c = context(t); await runJudgeHostBootstrap(c);
    rehash(c.evidenceRoot, "precall.json", body => {
      if (field === "environment") body.environment.OPENAI_API_KEY = "synthetic-marker";
      else if (field === "policy_digest") body.policy_digest = hash(Buffer.from("different"));
      else body[field].argv.push("--different");
    });
    const precall = JSON.parse(readFileSync(resolve(c.evidenceRoot, "precall.json")));
    rehash(c.evidenceRoot, "observations.json", body => { body.precall_digest = precall.record_digest; });
    assert.throws(() => reopenJudgeHostBootstrap(c));
  });
}

test("started without a terminal record is ambiguous and cannot restart", async t => {
  const c = context(t); await runJudgeHostBootstrap(c);
  rmSync(resolve(c.evidenceRoot, "result.json"));
  assert.equal(reopenJudgeHostBootstrap(c).state, "ambiguous");
  assert.equal((await runJudgeHostBootstrap(c)).state, "ambiguous");
  assert.equal(existsSync(resolve(c.evidenceRoot, "result.json")), false);
});

test("evidence transplant fails the root binding", async t => {
  const c = context(t); await runJudgeHostBootstrap(c);
  const moved = resolve(c.parent, "moved"); renameSync(c.evidenceRoot, moved);
  assert.throws(() => reopenJudgeHostBootstrap({ ...c, evidenceRoot: moved }), /plan_transplant/);
});

test("concurrent controllers reserve only one bootstrap namespace", async t => {
  const c = context(t);
  const results = await Promise.all(Array.from({ length: 3 }, () => runJudgeHostBootstrap(c)));
  assert.equal(results.filter(result => result.state === "verified_local").length, 1);
  assert.equal(reopenJudgeHostBootstrap(c).state, "verified_local");
});

test("raw stdout replay checks framing and the same event whitelist", () => {
  const error = '{"type":"error","message":"capture only"}';
  const tool = '{"type":"item.started","item":{"type":"command_execution"}}';
  assert.equal(judgeProcessStreamFailure(Buffer.alloc(0)), null);
  assert.equal(judgeProcessStreamFailure(Buffer.from(error + "\n")), null);
  assert.equal(judgeProcessStreamFailure(Buffer.from(error)), "incomplete_event_stream");
  assert.equal(judgeProcessStreamFailure(Buffer.from(error + "\n" + tool)), "incomplete_event_stream");
  assert.equal(judgeProcessStreamFailure(Buffer.from(tool + "\n")), "tool_or_unknown_event");
  assert.equal(judgeProcessStreamFailure(Buffer.from('{broken\n')), "invalid_event_stream");
  assert.equal(judgeProcessStreamFailure(Buffer.from('{"type":"error","type":"error"}\n')), "invalid_event_stream");
  assert.equal(judgeProcessStreamFailure(Buffer.from(error + "\n"), "control"), "tool_or_unknown_event");
  const control = '{"type":"host_control_result"}';
  assert.equal(judgeProcessStreamFailure(Buffer.from(control + "\n"), "control"), null);
  assert.equal(judgeProcessStreamFailure(Buffer.from(control), "control"), "incomplete_event_stream");
});

for (const scenario of ["invalid_tail", "tool_tail"]) {
  test(`rehashing ${scenario} process flags cannot hide the raw stream failure`, async t => {
    const c = context(t, scenario), result = await runJudgeHostBootstrap(c);
    assert.equal(result.state, "failed");
    rehash(c.evidenceRoot, "capture.json", body => { body.cause = null; });
    rehash(c.evidenceRoot, "result.json", body => { body.state = "verified_local"; body.failures = []; });
    assert.throws(() => reopenJudgeHostBootstrap(c), /result_rederivation/);
    await assert.rejects(runJudgeHostBootstrap(c), /result_rederivation/);
  });
}

test("actual stdin EPIPE cannot be converted into a successful observation", async () => {
  // /bin/true is absent on the target Mac. Use the already running Node image
  // to close stdin without reading, so this test exercises EPIPE, not ENOENT.
  const result = await captureJudgeProcess({ executable: process.execPath, argv: ["-e", "process.exit(0)"], cwd: tmpdir(), env: {}, input: Buffer.alloc(2 * 1024 * 1024, 65), timeoutMs: 3000 });
  assert.equal(result.cause, "stdin_error");
});

test("target mode cannot run on a synthetic Linux host or accept a fake scenario", t => {
  const c = context(t);
  if (process.platform !== "darwin") assert.throws(() => prepareJudgeHostBootstrap({ evidenceRoot: resolve(c.parent, "target"), codexBinary: "/never-read" }), /target_host_required/);
  assert.throws(() => prepareJudgeHostBootstrap({ evidenceRoot: resolve(c.parent, "target"), mode: "target", scenario: "zero" }), /synthetic_identity/);
  assert.throws(() => prepareJudgeHostBootstrap({ evidenceRoot: resolve(c.parent, "fake"), mode: "synthetic", codexBinary: "/never-read" }), /synthetic_identity/);
});


test("a crash after exclusive reservation but before start stays ambiguous", async t => {
  const c = context(t);
  mkdirSync(resolve(c.evidenceRoot, "attempt-claim"));
  assert.equal(reopenJudgeHostBootstrap(c).state, "ambiguous");
  assert.equal((await runJudgeHostBootstrap(c)).state, "ambiguous");
  assert.equal(existsSync(resolve(c.evidenceRoot, "capture.json")), false);
});

test("independent controller processes cannot launch two requests from one permission", async t => {
  const c = context(t);
  const modulePath = resolve(import.meta.dirname, "ask-benchmark-judge-host-bootstrap.mjs");
  const start = () => new Promise((ok, no) => {
    const input = { evidenceRoot: c.evidenceRoot, planDigest: c.planDigest,
      permissionPath: c.permissionPath, expectedPermissionDigest: c.expectedPermissionDigest };
    const code = `import {runJudgeHostBootstrap} from ${JSON.stringify(modulePath)};
      console.log(JSON.stringify(await runJudgeHostBootstrap(${JSON.stringify(input)})));`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code]);
    let out = "", err = ""; child.stdout.on("data", b => { out += b; }); child.stderr.on("data", b => { err += b; });
    child.on("error", no); child.on("close", status => { if (status !== 0) no(new Error(err)); else ok(JSON.parse(out)); });
  });
  const results = await Promise.all([start(), start(), start()]);
  if (!results.some(result => result.state === "verified_local")) {
    t.diagnostic(readFileSync(resolve(c.evidenceRoot, "control.json"), "utf8"));
    t.diagnostic(readFileSync(resolve(c.evidenceRoot, "observations.json"), "utf8"));
  }
  assert.ok(results.some(result => result.state === "verified_local"), JSON.stringify(results));
  const saved = reopenJudgeHostBootstrap(c);
  assert.equal(saved.state, "verified_local");
  assert.equal(saved.request.request_count, 1);
});

test("bounded HTTP collector preserves failed partial bytes, not a success-shaped request", async () => {
  const { startJudgeLoopbackCapture } = await import("./ask-benchmark-judge-tool-free-capture.mjs");
  const { connect } = await import("node:net");
  const capture = await startJudgeLoopbackCapture();
  try {
    await new Promise((ok, no) => {
      const client = connect({ host: "127.0.0.1", port: capture.port });
      client.on("error", no);client.on("connect", () => {
        client.end(`POST /v1/responses HTTP/1.1\r\nHost: 127.0.0.1:${capture.port}\r\nContent-Length: 100\r\n\r\npartial`);
      });client.on("close", ok);
    });
    await capture.close();
    assert.equal(capture.requests.length, 1);
    assert.equal(capture.requests[0].body.toString(), "partial");
    assert.equal(capture.requests[0].complete, false);
    assert.notEqual(capture.observation().failure, null);
  } finally { await capture.close(); }
});


// Codex review 5361045447: exercise the actual launcher with a deterministic
// wall clock. No production override or target-host allowance is introduced.
for (const phase of ["control", "capture"]) {
  test(`permission expiry during ${phase} setup cannot start that child`, async t => {
    const c = context(t), end = Date.parse(c.permission.expires_at);
    let now = Date.now(), advanced = false;
    const clock = t.mock.method(Date, "now", () => now);
    const originalListen = Server.prototype.listen, originalOpen = fs.openSync;
    const listener = t.mock.method(Server.prototype, "listen", function (...args) {
      if (phase === "control") { now = end; advanced = true; }
      return originalListen.apply(this, args);
    });
    const reader = t.mock.method(fs, "openSync", function (path, ...args) {
      if (phase === "capture" && path === resolve(c.evidenceRoot, "stdin.bin")
        && existsSync(resolve(c.evidenceRoot, "control.json"))) {
        now = end; advanced = true;
      }
      return originalOpen.call(this, path, ...args);
    });
    syncBuiltinESMExports();
    let result;
    try { result = await runJudgeHostBootstrap(c); }
    finally { clock.mock.restore(); listener.mock.restore(); reader.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(advanced, true);
    const childPath = resolve(c.evidenceRoot, `${phase}.json`);
    const child = existsSync(childPath) ? JSON.parse(readFileSync(childPath)) : null;
    assert.equal(child?.pid ?? null, null, `${phase} started after expiry: ${JSON.stringify(child)}`);
    assert.equal(result.state, "failed");
    if (phase === "control") assert.equal(existsSync(resolve(c.evidenceRoot, "capture.json")), false);
    assert.deepEqual(reopenJudgeHostBootstrap(c), result);
    assert.deepEqual(await runJudgeHostBootstrap(c), result);
  });
}

for (const phase of ["control", "capture"]) {
  test(`replay rejects ${phase} launch outside permission even with a rehashed process`, async t => {
    const c = context(t); await runJudgeHostBootstrap(c);
    rehash(c.evidenceRoot, `${phase}.json`, body => {
      body.launch = { requested_at: c.permission.expires_at,
        observed_at: c.permission.expires_at, completed_at: c.permission.expires_at };
    });
    assert.throws(() => reopenJudgeHostBootstrap(c));
    await assert.rejects(runJudgeHostBootstrap(c));
  });
}

for (const invalid of ["September 30, 2026 12:00:00 GMT", "2026-02-30T00:00:00Z",
  "2026-09-30", "2026-09-30T12:00:00", "2026-09-30T24:00:00Z"]) {
  test(`permission rejects ambiguous or normalized timestamp ${invalid}`, t => {
    const c = context(t), parsed = Date.parse(invalid);
    assert.ok(Number.isFinite(parsed), "fixture must reproduce Date.parse permissiveness");
    const start = { ...c.permission, not_before: invalid,
      expires_at: new Date(parsed + 60000).toISOString() };
    assert.throws(() => validateJudgeBootstrapPermission(start, c.plan, parsed));
    const end = { ...c.permission, not_before: new Date(parsed - 60000).toISOString(), expires_at: invalid };
    assert.throws(() => validateJudgeBootstrapPermission(end, c.plan, parsed - 1));
  });
}

test("symlink replacement and unlink need their own fixed negative probe outcomes", () => {
  assert.ok(CONTROL_IDS.includes("replace_auth_link"));
  assert.ok(CONTROL_IDS.includes("unlink_auth_link"));
});

test("unconfined symlink rename and unlink are executed and rejected independently", async t => {
  const c = context(t, "unconfined_controls"), result = await runJudgeHostBootstrap(c);
  const trace = JSON.parse(readFileSync(resolve(c.evidenceRoot, "control.stdout")));
  for (const id of ["replace_auth_link", "unlink_auth_link"]) {
    const row = trace.results.find(item => item.id === id);
    assert.deepEqual(row, { id, ok: true, errno: 0 });
    assert.ok(result.control.failed_controls.includes(id));
  }
  assert.equal(result.state, "failed");
  assert.equal(existsSync(resolve(c.evidenceRoot, "capture.json")), false);
  assert.deepEqual(reopenJudgeHostBootstrap(c), result);
});

// Positive/boundary controls for the stricter timestamp and per-spawn evidence.
test("canonical UTC permissions accept real leap dates and exact start but exclude expiry", t => {
  const c = context(t);
  for (const not_before of ["2024-02-29T00:00:00Z", "2024-02-29T00:00:00.001Z"]) {
    const start = Date.parse(not_before), expires_at = new Date(start + 1000).toISOString();
    const permission = { ...c.permission, not_before, expires_at };
    assert.equal(validateJudgeBootstrapPermission(permission, c.plan, start), true);
    assert.equal(validateJudgeBootstrapPermission(permission, c.plan, start + 999), true);
    assert.throws(() => validateJudgeBootstrapPermission(permission, c.plan, start - 1), /permission_expiry/);
    assert.throws(() => validateJudgeBootstrapPermission(permission, c.plan, start + 1000), /permission_expiry/);
  }
  for (const timestamp of ["2026-02-29T00:00:00Z", "2026-04-31T00:00:00Z", "2026-09-30T23:59:60Z",
    "2026-09-30T00:00:00+09:00", "2026-09-30T00:00:00.0000Z", "2026-09-30T00:00:00Z ", "2026-09-30t00:00:00z"]) {
    assert.throws(() => validateJudgeBootstrapPermission({ ...c.permission, not_before: timestamp }, c.plan));
  }
});

test("each completed child has its own permission-window observation and replay ignores today's expiry", async t => {
  const c = context(t), outcome = await runJudgeHostBootstrap(c);
  const control = JSON.parse(readFileSync(resolve(c.evidenceRoot, "control.json")));
  const capture = JSON.parse(readFileSync(resolve(c.evidenceRoot, "capture.json")));
  for (const record of [control, capture]) {
    for (const key of ["requested_at", "observed_at", "completed_at"])
      assert.equal(new Date(record.launch[key]).toISOString(), record.launch[key]);
    for (const key of ["requested_at", "observed_at"])
      assert.equal(validateJudgeBootstrapPermission(c.permission, c.plan, Date.parse(record.launch[key])), true);
    assert.ok(record.launch.requested_at <= record.launch.observed_at);
    assert.ok(record.launch.observed_at <= record.launch.completed_at);
  }
  assert.ok(control.launch.completed_at <= capture.launch.requested_at);
  const clock = t.mock.method(Date, "now", () => Date.parse(c.permission.expires_at) + 1);
  try {
    assert.deepEqual(reopenJudgeHostBootstrap(c), outcome);
    assert.deepEqual(await runJudgeHostBootstrap(c), outcome);
  } finally { clock.mock.restore(); }
});

for (const damage of ["missing", "before_request", "before_previous_child", "calendar_normalized"]) {
  test(`replay rejects ${damage} launch evidence instead of accepting the reservation timestamp`, async t => {
    const c = context(t); await runJudgeHostBootstrap(c);
    const before = JSON.parse(readFileSync(resolve(c.evidenceRoot, "control.json")));
    rehash(c.evidenceRoot, "capture.json", body => {
      if (damage === "missing") delete body.launch;
      else if (damage === "before_request") body.launch.observed_at = new Date(Date.parse(body.launch.requested_at) - 1).toISOString();
      else if (damage === "before_previous_child") body.launch.requested_at = new Date(Date.parse(before.launch.requested_at) - 1).toISOString();
      else body.launch.observed_at = "2026-02-30T00:00:00Z";
    });
    assert.throws(() => reopenJudgeHostBootstrap(c), /result_rederivation/);
    await assert.rejects(runJudgeHostBootstrap(c), /result_rederivation/);
  });
}

test("expiry at the OS spawn observation terminates the child and cannot pass", async t => {
  const cp = (await import("node:child_process")).default;
  const base = Date.now(), end = base + 1000;
  let now = base;
  const clock = t.mock.method(Date, "now", () => now), original = cp.spawn;
  const launcher = t.mock.method(cp, "spawn", function (...args) {
    const child = original.apply(this, args); now = end; return child;
  });
  syncBuiltinESMExports();
  let result;
  try {
    result = await captureJudgeProcess({ executable: process.execPath,
      argv: ["-e", "process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{},1000))"],
      env: {}, cwd: tmpdir(), input: Buffer.alloc(0), timeoutMs: 3000,
      launchWindow: { not_before: base - 1, expires_at: end } });
  } finally { clock.mock.restore(); launcher.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(result.cause, "permission_expired_at_spawn");
  assert.ok(result.pid > 1);
  assert.equal(result.launch.requested_at, new Date(base).toISOString());
  assert.equal(result.launch.observed_at, new Date(end).toISOString());
});

test("symlink syscall success, ENOENT or absent rows never establish a denial", () => {
  const positives = new Set(["read_allowed", "write_allowed", "read_protected", "connect_allowed"]);
  const value = { type: "host_control_result", mode: "synthetic", results: CONTROL_IDS.map(id =>
    ({ id, ok: positives.has(id), errno: positives.has(id) ? 0 : 13 })) };
  const inspect = trace => inspectJudgeHostControlTrace(Buffer.from(JSON.stringify(trace)), {
    mode: "synthetic", deniedConnections: 0, baselineReachable: true, canariesUnchanged: true });
  assert.equal(inspect(value).verdict, "passed");
  for (const id of ["replace_auth_link", "unlink_auth_link"]) {
    for (const [ok, errno] of [[true, 0], [false, 2], [false, 0]]) {
      const bad = structuredClone(value); Object.assign(bad.results.find(row => row.id === id), { ok, errno });
      assert.ok(inspect(bad).failed_controls.includes(id));
    }
    const missing = structuredClone(value); missing.results = missing.results.filter(row => row.id !== id);
    assert.throws(() => inspect(missing), /probe inventory/);
  }
});

for (const link of ["home/.codex/auth-canary-link", "home/.codex/auth-canary-unlink-link"]) {
  test(`protected ${link} has an exact write exclusion and retained link evidence`, async t => {
    const c = context(t); const result = await runJudgeHostBootstrap(c);
    const policy = readFileSync(resolve(c.evidenceRoot, "outer-policy.sbpl"), "utf8");
    assert.ok(policy.includes(`(require-not (literal ${JSON.stringify(resolve(c.evidenceRoot, link))}))`));
    const observation = JSON.parse(readFileSync(resolve(c.evidenceRoot, "observations.json")));
    assert.equal(observation.link_after[link], resolve(c.evidenceRoot, "protected-canary.txt"));
    rmSync(resolve(c.evidenceRoot, link));
    assert.throws(() => reopenJudgeHostBootstrap(c), /canary_link_artifact_drift/);
    assert.equal(result.state, "verified_local");
  });
}
