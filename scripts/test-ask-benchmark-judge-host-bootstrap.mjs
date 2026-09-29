import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { prepareJudgeHostBootstrap, runJudgeHostBootstrap, reopenJudgeHostBootstrap,
  validateJudgeBootstrapPermission } from "./ask-benchmark-judge-host-bootstrap.mjs";
import { judgeHostControlPolicy, inspectJudgeHostControlTrace, CONTROL_IDS } from "./ask-benchmark-judge-host-controls.mjs";
import { captureJudgeProcess } from "./ask-benchmark-judge-process.mjs";

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

test("actual stdin EPIPE cannot be converted into a successful observation", async () => {
  const result = await captureJudgeProcess({ executable: "/bin/true", argv: [], cwd: tmpdir(), env: {}, input: Buffer.alloc(2 * 1024 * 1024, 65), timeoutMs: 3000 });
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
