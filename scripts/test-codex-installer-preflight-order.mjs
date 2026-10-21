// Model-free CLI regression: invalid calls must not create their absent target.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureApplyTarget } from "./ask-setup-apply-state.mjs";
const installer = resolve(import.meta.dirname, "install-codex-adapter.mjs");
function call(target, args) {
  return spawnSync(process.execPath, [installer, "--target", target, ...args], { encoding: "utf8", timeout: 120000, env: { PATH: process.env.PATH } });
}
test("Codex preflight retains absent-target diagnostics and existing ownership guards", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-codex-preflight-order-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const cases = [
    ["unknown skill", ["--skills", "missing-skill", "--skip-prompts", "--skip-command"], /Unknown skill/],
    ["invalid closure", ["--skills", "controlled-implementation", "--skip-prompts", "--skip-command"], /Missing required skill\(s\): test-first-verification/],
    ["missing work package", ["--skills", "spec-driven-development,test-first-verification,controlled-implementation", "--skip-prompts", "--skip-command"], /Missing required skill\(s\): work-package-compiler/],
    ["missing core", ["--profile", "full"], /ASK core install state is missing/],
  ];
  for (const [name, args, expected] of cases) await t.test(name, () => {
    const target = join(root, name.replaceAll(" ", "-")); assert.equal(existsSync(target), false);
    const before = readdirSync(root).sort(), result = call(target, args);
    assert.equal(result.status, 1); assert.match(result.stderr, expected); assert.doesNotMatch(result.stderr, /ENOENT.*lstat/);
    assert.equal(existsSync(target), false); assert.deepEqual(readdirSync(root).sort(), before);
  });
  await t.test("existing active owner still blocks normal, forced, rollback and detach without writes", () => {
    const target = join(root, "existing-owned"); mkdirSync(join(target, ".agent-spectrum-kernel"), { recursive: true });
    writeFileSync(join(target, ".agent-spectrum-kernel/personal-prompt-target-state.json"), "{\"fixture_owner\":true}\n", { mode: 0o600 });
    const before = captureApplyTarget(target).binding;
    for (const args of [["--profile", "full"], ["--force"], ["--force", "--rollback"], ["--force", "--detach"]]) {
      const result = call(target, args); assert.equal(result.status, 1); assert.match(result.stderr, /personal Prompt ownership or partial operation/);
      assert.deepEqual(captureApplyTarget(target).binding, before);
    }
  });
});
