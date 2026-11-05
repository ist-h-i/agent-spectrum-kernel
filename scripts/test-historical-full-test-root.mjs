import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareHistoricalFullTestRoot, historicalSourceEntries } from "./prepare-historical-full-test-root.mjs";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scratch = t => { const path = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-historical-test-"))); t.after(() => rmSync(path, { recursive: true, force: true })); return path; };
test("isolated sealed assets preserve current helpers/tests and the source checkout", t => {
  const target = resolve(scratch(t), "checkout");
  const original = readFileSync(resolve(ROOT, "skills/ui-ux-design/references/ui-capability-contract.md"));
  const fixtureRoot = "benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap";
  const originalTask = readFileSync(resolve(ROOT, fixtureRoot, "task.md"));
  const originalReference = readFileSync(resolve(ROOT, fixtureRoot, "evaluator-reference.json"));
  assert.equal(prepareHistoricalFullTestRoot(ROOT, target), target);
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  const manifestBytes = readFileSync(resolve(target, fixtureRoot, "input-manifest.json"));
  assert.equal(digest(manifestBytes), "13e5d0c70feffed4db0bdf68b2b89b9b15005c53525a8e5b10d9198775d7ac25");
  const files = JSON.parse(manifestBytes).fixtures["mp-ci-evidence-gap"].files;
  assert.equal(files.length, 13);
  for (const file of files) {
    const bytes = readFileSync(resolve(target, fixtureRoot, file.path));
    assert.equal(bytes.length, file.bytes);
    assert.equal(digest(bytes), file.sha256);
  }
  assert.equal(digest(readFileSync(resolve(target, fixtureRoot, "verification-command-contract.json"))), "5426f0f2b1f82047f23cc6a76bd7689a2c22d7165d67af72a56df90072b78e78");
  assert.equal(digest(readFileSync(resolve(target, fixtureRoot, "evaluator-reference.json"))), "16aa4e11e6dd3cae7ae9b1d445b388f3b4177d9c797fa833657bc5ed03f7ddb2");
  assert.deepEqual(readFileSync(resolve(ROOT, fixtureRoot, "task.md")), originalTask);
  assert.deepEqual(readFileSync(resolve(ROOT, fixtureRoot, "evaluator-reference.json")), originalReference);
  for (const path of ["scripts/ask-local-full-package.mjs", "scripts/test-ask-local-full-package.mjs", "scripts/ask-local-three-arm.mjs", "scripts/test-ask-local-three-arm.mjs"]) {
    assert.deepEqual(readFileSync(resolve(target, path)), readFileSync(resolve(ROOT, path)), path);
  }
  assert.equal(existsSync(resolve(target, "skills/ui-ux-design/references/ui-capability-contract.md")), false);
  assert.deepEqual(readFileSync(resolve(ROOT, "skills/ui-ux-design/references/ui-capability-contract.md")), original);
  // Current shared producer imports must link against the deliberately sealed
  // historical renderer/runner, which do not export modern collection APIs.
  // Merely retaining the current helper bytes does not prove this closure.
  execFileSync(process.execPath, ["--input-type=module", "--eval",
    'await import("./scripts/ask-local-three-arm.mjs"); await import("./scripts/ask-local-three-arm-qualification.mjs");'],
  { cwd: target, timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
  assert.throws(() => prepareHistoricalFullTestRoot(ROOT, target), /must be new/);
});
test("historical manifest drift fails before creating a checkout", t => {
  const root = scratch(t); mkdirSync(resolve(root, "docs"));
  writeFileSync(resolve(root, "docs/mac-ask-full-static-inventory.json"), "{}\n");
  assert.throws(() => historicalSourceEntries(root), /manifest drift/);
  assert.equal(existsSync(resolve(root, "checkout")), false);
});

test("dirty source refuses before cloning or reading historical manifests", t => {
  const root = scratch(t);
  execFileSync("git", ["-C", root, "init", "--quiet"]);
  writeFileSync(resolve(root, "uncommitted.txt"), "current bytes");
  const target = resolve(root, "checkout");
  assert.throws(() => prepareHistoricalFullTestRoot(root, target), /clean source/);
  assert.equal(existsSync(target), false);
});
