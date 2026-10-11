// Run directly with node: no test-runner child processes, native probes or comparison commands.
import assert from "node:assert/strict";
import { test, mock, after } from "node:test";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";

const SECRET = "DO_NOT_RECORD_RAW_OUTPUT_OR_ENVIRONMENT";
const denied = code => Object.assign(new Error(SECRET), { code });
const nativeCalls = [];
// Install guards before importing production modules. No original process function is retained.
for (const method of ["spawn", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  mock.method(childProcess, method, () => assert.fail(`unexpected native ${method}`));
}
mock.method(childProcess, "spawnSync", (command, argv) => {
  assert.ok(command === "/usr/sbin/sysctl" || command === "/bin/ps", "only fake ownership metadata is supported");
  nativeCalls.push({ command, argv });
  return { error: denied("EPERM"), status: null, signal: null, stdout: SECRET, stderr: SECRET, env: SECRET };
});
mock.method(process, "kill", (pid, signal) => {
  assert.ok(Number.isSafeInteger(pid) && pid > 0); assert.equal(signal, 0);
  nativeCalls.push({ signal_zero: true }); return true;
});
mock.method(os, "hostname", () => "fake-host");
const readFile = fs.readFileSync;
mock.method(fs, "readFileSync", (path, ...args) => {
  if (path === "/proc/sys/kernel/random/boot_id") {
    nativeCalls.push({ boot_read: true }); throw denied("EPERM");
  }
  return readFile(path, ...args);
});
syncBuiltinESMExports();
after(() => { mock.restoreAll(); syncBuiltinESMExports(); });

const { createComparisonProcessObserver, comparisonOwnershipDiagnostics, requireComparisonControllerIdentity,
  acquireComparisonOwner } = await import("./ask-user-comparison-state.mjs");
const { comparisonFailureOverall } = await import("./ask-user-comparison.mjs");
assert.deepEqual(nativeCalls, [], "importing modules does not invoke ownership I/O");

function observer({ platform = "darwin", boot, birth, signals = [], readBoot = () => "fake-boot" } = {}) {
  const calls = []; let signalIndex = 0;
  const success = stdout => ({ error: null, status: 0, signal: null, stdout, stderr: SECRET });
  const observe = createComparisonProcessObserver({ platform, host: () => "fake-host", readBoot,
    run: (command, argv) => {
      calls.push({ command, argv });
      if (command === "/usr/sbin/sysctl") {
        assert.deepEqual(argv, ["-n", "kern.boottime"]); return boot ?? success("fake-boot");
      }
      assert.equal(command, "/bin/ps"); assert.deepEqual(argv, ["-p", "123", "-o", "lstart="]);
      return birth ?? success("fake-birth");
    },
    signalZero: pid => { assert.equal(pid, 123); calls.push({ signal_zero: true });
      const failure = signals[signalIndex++]; if (failure) throw denied(failure); },
  });
  return { observe, calls };
}
function refused(identity) {
  let error;
  try { requireComparisonControllerIdentity(identity); } catch (value) { error = value; }
  assert.ok(error); assert.equal(error.comparisonCode, 9);
  const report = JSON.parse(JSON.stringify({ slots: ["plain", "kernel_principles_v1", "full_ask"].map(condition => ({
    condition, state: "not_started", launch_requested: false, spawn_observed: false, outcome: "unknown",
  })), overall: comparisonFailureOverall(error) }));
  assert.equal(report.overall.state, "execution_blocked"); assert.equal(report.overall.exit_code, 9);
  assert.ok(report.slots.every(slot => slot.state === "not_started" && !slot.launch_requested && !slot.spawn_observed));
  assert.ok(!JSON.stringify(report).includes(SECRET));
  return report.overall.ownership_diagnostics;
}

test("successful fake identity retains the exact original fields and positive gate", () => {
  const { observe, calls } = observer();
  const identity = observe(123);
  assert.deepEqual(identity, { host: "fake-host", platform: "darwin", boot: "fake-boot", pid: 123, birth: "fake-birth", status: "alive" });
  requireComparisonControllerIdentity(identity);
  assert.equal(calls.length, 3);
});

for (const stage of ["boot", "birth"]) {
  for (const [name, value, expected] of [
    ["EPERM", { error: denied("EPERM"), status: null, signal: null, stdout: SECRET, stderr: SECRET }, { reason: "io_error", error_code: "EPERM" }],
    ["nonzero", { status: 1, signal: null, stdout: SECRET, stderr: SECRET }, { reason: "nonzero_exit", exit_status: 1 }],
    ["timeout", { error: denied("ETIMEDOUT"), status: null, signal: "SIGTERM", stdout: SECRET, stderr: SECRET }, { reason: "timeout", error_code: "ETIMEDOUT", signal: "SIGTERM" }],
    ["empty", { status: 0, signal: null, stdout: "", stderr: SECRET }, { reason: "empty_output", exit_status: 0 }],
  ]) {
    test(`${stage} ${name} is distinguishable in refused JSON without raw output`, () => {
      const { observe } = observer({ [stage]: value });
      const identity = observe(123);
      assert.equal(identity.status, "unknown");
      assert.deepEqual(refused(identity), [{ stage, ...expected }]);
    });
  }
}

test("boot failure with successful ps is never mislabeled as a ps failure or alive", () => {
  const { observe } = observer({ boot: { error: denied("EPERM"), status: null, stdout: SECRET } });
  assert.deepEqual(refused(observe(123)), [{ stage: "boot", reason: "io_error", error_code: "EPERM" }]);
});
test("both metadata failures remain present", () => {
  const value = { error: denied("EPERM"), status: null, stdout: SECRET };
  assert.deepEqual(refused(observer({ boot: value, birth: value }).observe(123)), [
    { stage: "boot", reason: "io_error", error_code: "EPERM" }, { stage: "birth", reason: "io_error", error_code: "EPERM" },
  ]);
});
test("missing exit status is unknown or signaled, never mislabeled as nonzero or EPERM", () => {
  assert.deepEqual(refused(observer({ birth: { status: null, signal: null, stdout: "" } }).observe(123)),
    [{ stage: "birth", reason: "unavailable" }]);
  assert.deepEqual(refused(observer({ birth: { status: null, signal: "SIGTERM", stdout: "" } }).observe(123)),
    [{ stage: "birth", reason: "signal_exit", signal: "SIGTERM" }]);
});
for (const code of ["EPERM", "ESRCH"]) {
  test(`existence ${code} preserves unknown versus gone`, () => {
    const { observe, calls } = observer({ signals: [code] }); const identity = observe(123);
    assert.equal(identity.status, code === "ESRCH" ? "gone" : "unknown");
    assert.equal(calls.length, 2, "ps is never reached after first existence failure");
    assert.deepEqual(refused(identity), [{ stage: "existence", reason: "io_error", error_code: code }]);
  });
  test(`existence recheck ${code} remains conservative`, () => {
    const { observe } = observer({ birth: { status: 1, stdout: "" }, signals: [null, code] });
    const identity = observe(123); assert.equal(identity.status, code === "ESRCH" ? "gone" : "unknown");
    assert.deepEqual(refused(identity), [{ stage: "birth", reason: "nonzero_exit", exit_status: 1 },
      { stage: "existence_recheck", reason: "io_error", error_code: code }]);
  });
}
test("Linux boot read error and empty identity preserve the original safety result", () => {
  assert.deepEqual(refused(observer({ platform: "linux", readBoot: () => { throw denied("EPERM"); } }).observe(123)),
    [{ stage: "boot", reason: "io_error", error_code: "EPERM" }]);
  const empty = observer({ platform: "linux", readBoot: () => "" }).observe(123);
  assert.equal(empty.status, "alive", "original observer permits empty Linux boot; controller still refuses it");
  assert.deepEqual(refused(empty), [{ stage: "boot", reason: "empty_output" }]);
});
test("unsupported platform and invalid PID never gain ownership", () => {
  assert.deepEqual(refused(observer({ platform: "win32" }).observe(123)), [{ stage: "boot", reason: "unavailable" }]);
  const { observe, calls } = observer();
  assert.deepEqual(refused(observe(0)), [{ stage: "identity", reason: "missing_identity" }]);
  assert.equal(calls.length, 1, "invalid PID never reaches signal zero or ps");
});
test("missing identity fields cannot be promoted or replace exit9 with exit7", () => {
  const good = { status: "alive", birth: "fake-birth", boot: "fake-boot" };
  for (const field of ["status", "birth", "boot"]) {
    const identity = { ...good }; delete identity[field];
    assert.deepEqual(refused(identity), [{ stage: "identity", reason: "missing_identity" }]);
  }
  const legacy = comparisonFailureOverall(Object.assign(new Error("current controller ownership unavailable"), { comparisonCode: 9 }));
  assert.equal(legacy.exit_code, 9); assert.ok(!("ownership_diagnostics" in legacy));
  const laterReport = { overall: { state: "not_started", exit_code: 7 } };
  assert.equal(JSON.parse(JSON.stringify(laterReport)).overall.exit_code, 7);
});
test("the diagnostic allowlist excludes arbitrary strings, fields and oversized arrays", () => {
  const raw = { stage: "birth", reason: "io_error", error_code: SECRET, signal: SECRET, exit_status: 999,
    stdout: SECRET, stderr: SECRET, env: SECRET, message: SECRET, command: SECRET, identity: SECRET };
  assert.deepEqual(comparisonOwnershipDiagnostics([raw, { ...raw, stage: SECRET }, { ...raw, reason: SECRET }]),
    [{ stage: "birth", reason: "io_error" }]);
  assert.equal(comparisonOwnershipDiagnostics(Array(50).fill(raw)).length, 5);
  assert.deepEqual(comparisonOwnershipDiagnostics(null), []);
  assert.throws(() => createComparisonProcessObserver({ platform: "darwin", host: () => "fake" }), /explicit/);
});
test("actual acquisition with guarded fake native I/O leaves owner/start/history/attempt absent", t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(), "ask-ownership-diagnostics-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(join(root, "control"));
  const plan = { run_id: "fake-run", config: { kernel_condition: "kernel_principles_v1" } };
  let error;
  try { acquireComparisonOwner(root, plan, "fake-digest", false); } catch (value) { error = value; }
  assert.equal(error?.comparisonCode, 9); assert.match(error.message, /current controller ownership unavailable/);
  const overall = JSON.parse(JSON.stringify(comparisonFailureOverall(error)));
  assert.deepEqual(overall.ownership_diagnostics, [
    { stage: "boot", reason: "io_error", error_code: "EPERM" }, { stage: "birth", reason: "io_error", error_code: "EPERM" },
  ]);
  assert.deepEqual(fs.readdirSync(join(root, "control")), []);
  for (const path of ["leases", "start.json", "start.digest", "history", "slots"]) assert.ok(!fs.existsSync(join(root, "control", path)));
  assert.ok(nativeCalls.length > 0, "the production observer reached the fake guards, never native I/O");
});
