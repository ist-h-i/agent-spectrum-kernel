import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectChildTermination, linuxProcessState } from "./test-successor-process-state.mjs";
const error = code => Object.assign(new Error(code), { code });
const present = () => {};

test("only ESRCH is reported as reaped", () => {
  assert.deepEqual(inspectChildTermination(123, { probe: () => { throw error("ESRCH"); } }),
    { state: "absent", execution_terminated: true, reaped: true });
});
test("Linux zombie is terminated but explicitly not reaped", () => {
  assert.deepEqual(inspectChildTermination(123, { platform: "linux", probe: present, readStat: () => "123 (codex) Z 1 123 123 0" }),
    { state: "zombie", execution_terminated: true, reaped: false });
});
test("every non-zombie state stays present", () => {
  for (const state of ["R", "S", "D", "T", "t", "I", "X"]) {
    assert.equal(inspectChildTermination(123, { platform: "linux", probe: present, readStat: () => `123 (fake) ${state} 1` }).execution_terminated, false);
  }
});
test("proc stat parser tolerates spaces and parentheses in comm, but not PID substitution", () => {
  assert.equal(linuxProcessState("123 (fake ) process) Z 1", 123), "Z");
  for (const value of ["124 (fake) Z 1", "123 (fake)", "123 fake Z 1"]) assert.throws(() => linuxProcessState(value, 123));
});
test("permission and IO errors are never interpreted as termination", () => {
  for (const code of ["EPERM", "EACCES", "EIO"]) {
    assert.throws(() => inspectChildTermination(123, { probe: () => { throw error(code); } }), { code });
    assert.throws(() => inspectChildTermination(123, { platform: "linux", probe: present, readStat: () => { throw error(code); } }), { code });
  }
});
test("proc disappearance requires an ESRCH recheck", () => {
  let count = 0;
  const options = { platform: "linux", probe: () => { if (++count === 2) throw error("ESRCH"); }, readStat: () => { throw error("ENOENT"); } };
  assert.equal(inspectChildTermination(123, options).reaped, true);
  assert.throws(() => inspectChildTermination(123, { ...options, probe: present }), /state is unavailable/u);
});
test("non-Linux platforms do not infer zombies from procfs", () => {
  assert.equal(inspectChildTermination(123, { platform: "darwin", probe: present, readStat: () => { throw new Error("must not read"); } }).execution_terminated, false);
});
test("invalid child identities are rejected before any process inspection", () => {
  for (const pid of [-1, 0, 1, 1.5, "123", NaN]) assert.throws(() => inspectChildTermination(pid, { probe: () => assert.fail("must not probe") }));
});
