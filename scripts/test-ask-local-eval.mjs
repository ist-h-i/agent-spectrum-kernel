import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectLocalRoute, localPreflight, runLocalFake, reopenLocalEval, summarizeLocalEval } from "./ask-local-eval.mjs";

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "ask-local-eval.mjs");
const mac = { platform: "darwin", arch: "arm64", release: "25.6.0", node: "v24.19.0", distro: { id: null, version: null }, glibc: null };
const linux = { ...mac, platform: "linux", arch: "x64", release: "6.8.0", distro: { id: "ubuntu", version: "24.04" }, glibc: "2.39" };
for (const host of [mac, { ...mac, arch: "x64" }, linux, { ...linux, arch: "arm64" }, { ...linux, release: "5.15.167.4-microsoft-standard-WSL2" }]) {
  test(`planned route ${host.platform}/${host.arch}/${host.release} remains live-unadmitted`, () => {
    assert.equal(selectLocalRoute(host).fake_ready, true);
    assert.equal(selectLocalRoute(host).live_ready, false);
  });
}
for (const host of [{ ...mac, platform: "win32" }, { ...mac, node: "v22.20.0" }, { ...mac, arch: "ia32" },
  { ...mac, release: "22.6.0" }, { ...linux, release: "4.4.0-Microsoft" }, { ...linux, glibc: null },
  { ...linux, glibc: "2.28" }, { ...linux, distro: { id: "alpine", version: "3.20" } }]) {
  test(`unsupported route fails closed ${JSON.stringify(host)}`, () => assert.equal(selectLocalRoute(host).fake_ready, false));
}
test("WSL2 selector requires Linux Node and exposes a distinct route", () => {
  assert.equal(selectLocalRoute({ ...linux, release: "6.6.87.2-microsoft-standard-WSL2" }).route, "windows-wsl2");
  assert.equal(selectLocalRoute({ ...linux, platform: "win32" }).fake_ready, false);
});
test("preflight records only selected non-personal host facts and admits no live calls", () => {
  const result = localPreflight();
  assert.equal(result.selected.live_ready, false);
  assert.equal(result.host.node, process.version);
  assert.deepEqual(Object.keys(result.host).sort(), ["arch", "distro", "glibc", "node", "platform", "release"]);
  assert.ok(result.checks_not_performed.includes("authentication"));
});
test("unknown and incomplete outcomes are understandable without assumed zero usage", () => {
  const summary = summarizeLocalEval({ slots: [{ condition: "plain", state: "spent_incomplete" },
    { condition: "kernel_only", state: "not_started", usage: { total_tokens: null } }], stop: "usage_unknown", retry: 0 });
  assert.match(summary, /spent_incomplete; grade=unavailable; usage=unknown/u);
  assert.match(summary, /not_started; grade=unavailable; usage=unknown/u);
  assert.match(summary, /Stop: usage_unknown; retries: 0/u);
});
function ownedRoot(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "ask-local-eval-test-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return join(base, "evidence");
}
function snapshot(root) {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true }).filter(x => x.isFile())
    .map(x => { const path = join(x.parentPath, x.name); return [path, readFileSync(path).toString("base64")]; }));
}
test("distribution entry saves sealed identity, reopens without commands/writes and refuses reuse", t => {
  const root = ownedRoot(t), result = runLocalFake(root);
  const plan = JSON.parse(readFileSync(join(root, "plan.json"), "utf8"));
  assert.equal(plan.controller_root, realpathSync(join(dirname(ENTRY), "../..")));
  t.after(() => rmSync(plan.workspace_root, { recursive: true, force: true }));
  assert.equal(result.report.fake_exec_starts, 2);
  assert.equal(result.report.native_cli_starts, 0);
  assert.equal(result.report.provider_model_calls, 0);
  assert.deepEqual(result.report.slots.map(x => x.grade.status), ["pass", "pass"]);
  assert.match(result.summary, /plain: completed; grade=pass; usage=120/u);
  const before = snapshot(root);
  assert.deepEqual(reopenLocalEval(root), result);
  // Empty PATH denies git/Codex launch during a fresh-process read-only reopen.
  const reopened = JSON.parse(execFileSync(process.execPath, [ENTRY, "reopen", root], { env: { PATH: "" }, encoding: "utf8" }));
  assert.deepEqual(reopened, result);
  assert.deepEqual(snapshot(root), before);
  assert.throws(() => runLocalFake(root));
  assert.deepEqual(snapshot(root), before);
  const identity = join(root, "local-eval.json");
  writeFileSync(identity, readFileSync(identity, "utf8").replace("fake_only", "native"));
  assert.throws(() => reopenLocalEval(root), /digest mismatch/u);
});
test("CLI rejects extra args and live mode before creating evidence", t => {
  const root = ownedRoot(t);
  for (const args of [["live", root], ["fake", root, "retry"], ["preflight", root]]) {
    const result = spawnSync(process.execPath, [ENTRY, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /preserved/u);
  }
});
