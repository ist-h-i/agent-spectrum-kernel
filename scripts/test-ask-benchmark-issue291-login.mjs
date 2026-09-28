import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import { isSuccessorChatGptLoginStatusResult, probeSuccessorChatGptLoginStatus } from "./ask-benchmark-prompt-successor-login-status.mjs";
import { runNoModelPreflight } from "./ask-benchmark-prompt-successor-host-diagnostic.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function fixture(t) {
  const work = realpathSync(mkdtempSync(resolve(tmpdir(), "ask291-login-fake-")));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const binary = resolve(work, "codex");
  const compiler = process.platform === "darwin" ? "/usr/bin/clang" : "cc";
  const compiled = spawnSync(compiler, ["-std=c11", "-Wall", "-Wextra", "-Werror", "-O0",
    resolve(root, "scripts/test-fixtures/prompt-successor-fake-codex.c"), "-o", binary],
  { encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
  assert.equal(compiled.error, undefined, compiled.error?.message);
  assert.equal(compiled.status, 0, compiled.stderr);
  const privateRoot = resolve(work, "private");
  mkdirSync(privateRoot);
  const sources = {};
  for (const [fixtureId] of CALIBRATION_SOURCE_BINDINGS) {
    const fixtureRoot = resolve(privateRoot, fixtureId);
    mkdirSync(fixtureRoot);
    const manifestPath = resolve(fixtureRoot, "manifest.json");
    const reviewAuthorityPath = resolve(fixtureRoot, "review-authority.json");
    const reviewArchivePath = resolve(fixtureRoot, "review-archive.json");
    for (const path of [manifestPath, reviewAuthorityPath, reviewArchivePath]) writeFileSync(path, "{}\n");
    sources[fixtureId] = { privateRoot: fixtureRoot, manifestPath, reviewAuthorityPath,
      reviewArchivePath, reviewAuthoritySourceDigest: `sha256:${"a".repeat(64)}` };
  }
  const runtime = { schema_version: "1.2.0", adapter: "codex", availability: "available",
    unavailable_reason: null, expected_executable_version: "codex-cli 0.153.4", model: "gpt-6-sol",
    reasoning_effort: "medium", case_timeout_ms: 900000, sandbox_policy: "workspace-write",
    permission_policy: "never", successor_private_evaluator_root: privateRoot,
    executor: { id: "successor-native-fake", version: "1.0.0" },
    environment_allowlist: ["HOME", "PATH"], environment_value_allowlist: [], thermal_state: "cold",
    claude_cli: null, command_evidence: { capture_required: true, support: "supported",
      event_transport: "codex_exec_jsonl", event_format_revision: "codex-exec-jsonl-v1",
      parser_revision: "1.3.0", shell_capability: { support_status: "supported", family: "posix_bash",
        executable: "/bin/bash", envelope_arguments: ["-lc"],
        authority_source: "codex_exec_jsonl_command_rendering", probe_status: "runtime_event_required",
        downgrade_reason: null } } };
  const runtimePath = resolve(work, "runtime.json");
  writeFileSync(runtimePath, `${JSON.stringify(runtime)}\n`);
  // Deliberate overlap is the next normal gate after login. The test stops
  // there, before any run namespace, claim, or provider execution exists.
  const runRoot = resolve(privateRoot, "run");
  const specPath = resolve(work, "spec.json");
  writeFileSync(specPath, `${JSON.stringify({ schema_version: "1.0.0", run_root: runRoot,
    runtime_config_path: runtimePath, agent_bin: binary, private_admission_sources: sources,
    seed: "synthetic-login-test", plan_seed: "synthetic-login-plan" })}\n`);
  return { binary, runRoot, specPath };
}

function cleanRepository(t) {
  const clone = realpathSync(mkdtempSync(resolve(tmpdir(), "ask291-login-source-")));
  t.after(() => rmSync(clone, { recursive: true, force: true }));
  const command = (args, cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 60000,
      maxBuffer: 1024 * 1024 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
  };
  command(["clone", "--quiet", "--no-hardlinks", root, clone]);
  for (const file of ["scripts/ask-benchmark-issue291-preflight.mjs",
    "scripts/ask-benchmark-prompt-successor-login-status.mjs"]) {
    if (existsSync(resolve(root, file))) copyFileSync(resolve(root, file), resolve(clone, file));
  }
  command(["add", "scripts/ask-benchmark-issue291-preflight.mjs",
    ...(existsSync(resolve(clone, "scripts/ask-benchmark-prompt-successor-login-status.mjs"))
      ? ["scripts/ask-benchmark-prompt-successor-login-status.mjs"] : [])], clone);
  command(["-c", "user.name=Synthetic Test", "-c", "user.email=synthetic@example.invalid",
    "commit", "--quiet", "--allow-empty", "-m", "Synthetic login source"], clone);
  return clone;
}

test("login status accepts exactly one ChatGPT line on either stream", t => {
  const { binary } = fixture(t);
  for (const mode of ["stdout", "stderr"]) {
    assert.equal(probeSuccessorChatGptLoginStatus(binary, {
      env: { ...process.env, ASK_SUCCESSOR_FAKE_LOGIN_MODE: mode },
    }), "Logged in using ChatGPT", mode);
  }
  for (const mode of ["api-key", "logged-out", "empty", "duplicate", "contradiction",
    "extra", "nonzero", "signal", "overflow", "invalid-utf8"]) {
    assert.equal(probeSuccessorChatGptLoginStatus(binary, {
      env: { ...process.env, ASK_SUCCESSOR_FAKE_LOGIN_MODE: mode },
    }), null, mode);
  }
});

test("login result rejects errors, timeout, malformed streams, and excess bytes", () => {
  const success = Buffer.from("Logged in using ChatGPT\n");
  const result = { status: 0, signal: null, error: undefined, stdout: Buffer.alloc(0), stderr: success };
  assert.equal(isSuccessorChatGptLoginStatusResult(result), true);
  for (const change of [
    { status: 7 }, { signal: "SIGTERM" }, { error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) },
    { stdout: "" }, { stderr: "Logged in using ChatGPT\n" },
    { stderr: Buffer.from([0xff]) }, { stderr: Buffer.alloc(16 * 1024 + 1, 0x20) },
    { stdout: success }, { stderr: Buffer.from("Logged in using ChatGPT\nunknown\n") },
  ]) assert.equal(isSuccessorChatGptLoginStatusResult({ ...result, ...change }), false);
});

test("host diagnostic uses the same login verdict for synthetic native statuses", t => {
  const { binary, specPath } = fixture(t);
  const work = resolve(specPath, "..");
  const auth = resolve(work, "synthetic-auth.json");
  writeFileSync(auth, "{}\n");
  const privateRoot = resolve(work, "private");
  const command = { argv: ["exec", "-c",
    `permissions.ask_issue291.filesystem={ "${privateRoot}": "deny" }`, "-"] };
  const runtime = { cli_version: "0.153.4", model: "synthetic-native-fake-not-a-service" };
  for (const mode of ["stdout", "stderr"]) {
    const environment = { HOME: work, ASK_SUCCESSOR_FAKE_LOGIN_MODE: mode };
    const proof = runNoModelPreflight({ executable: binary, environment, auth, command,
      privateRoot, runtime, cwd: work });
    assert.match(proof.login_status_digest, /^sha256:[a-f0-9]{64}$/u);
  }
  for (const mode of ["api-key", "duplicate", "contradiction", "extra", "nonzero", "signal",
    "overflow", "invalid-utf8"]) {
    const environment = { HOME: work, ASK_SUCCESSOR_FAKE_LOGIN_MODE: mode };
    assert.throws(() => runNoModelPreflight({ executable: binary, environment, auth, command,
      privateRoot, runtime, cwd: work }), { code: "SUCCESSOR_HOST_DIAGNOSTIC_INVALID" }, mode);
  }
});

test("preflight create passes stderr-only login and rejects invalid login before namespace creation", t => {
  const input = fixture(t);
  const clone = cleanRepository(t);
  const run = mode => {
    const result = spawnSync(process.execPath, [resolve(clone, "scripts/ask-benchmark-issue291-preflight.mjs"),
      "create", "--spec", input.specPath], { cwd: clone, encoding: "utf8", timeout: 30000,
      env: { ...process.env, ASK_SUCCESSOR_FAKE_LOGIN_MODE: mode } });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 1);
    assert.equal(existsSync(input.runRoot), false);
    return result.stderr;
  };
  assert.match(run("stderr"), /measured run and private authority roots overlap/u);
  assert.match(run("stdout"), /measured run and private authority roots overlap/u);
  for (const mode of ["api-key", "logged-out", "empty", "duplicate", "contradiction",
    "extra", "nonzero", "signal", "overflow", "invalid-utf8"]) {
    const stderr = run(mode);
    assert.match(stderr, /ISSUE291_PREFLIGHT_INVALID:.*ChatGPT subscription login status/u, mode);
    assert.equal(stderr.includes("Logged in using"), false, `${mode}: raw login output leaked`);
  }
});
