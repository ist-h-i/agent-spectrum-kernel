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
  const fixtureRevision = "9068e22a1c48378d0c266a103e3f8fb93861942e";
  const fixtures = [
    ["mp-ci-evidence-gap", 13, "13e5d0c70feffed4db0bdf68b2b89b9b15005c53525a8e5b10d9198775d7ac25", "5426f0f2b1f82047f23cc6a76bd7689a2c22d7165d67af72a56df90072b78e78", "16aa4e11e6dd3cae7ae9b1d445b388f3b4177d9c797fa833657bc5ed03f7ddb2", "b1883a5f30545f45ab6c8d8ec26d84dcc1d3cace48e22e900c62575852b5a7ca"],
    ["mn-focused-regression-test", 5, "065c84ece98ef98807a63b14790abd368ace054f0194f3e5bcf40e9c0fd9797b", "c3d48711701c8c4d8e3be2df938df964a4bb7f6050b7cc73d8e9c9abb5a04347", "5f87f3ee691c0ebbb1840c75cdd8bb598b7a405999652e83866cc92f4ee397e4", "50a120bd71749c6d6e754176f768c555a765c564989cc2f41f9a4a1ae30f9991"],
  ];
  const originals = new Map(fixtures.flatMap(([fixture]) => ["task.md", "evaluator-reference.json"].map(name => {
    const path = `benchmarks/fixtures/checkpoint-b2/${fixture}/${name}`;
    return [path, readFileSync(resolve(ROOT, path))];
  })));
  assert.equal(prepareHistoricalFullTestRoot(ROOT, target), target);
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  const publicPaths = new Set();
  for (const [fixture, count, inputDigest, verificationDigest, referenceDigest, freezeDigest] of fixtures) {
    const fixtureRoot = `benchmarks/fixtures/checkpoint-b2/${fixture}`;
    const manifestBytes = readFileSync(resolve(target, fixtureRoot, "input-manifest.json"));
    assert.equal(digest(manifestBytes), inputDigest);
    const files = JSON.parse(manifestBytes).fixtures[fixture].files;
    assert.equal(files.length, count);
    for (const file of files) {
      const bytes = readFileSync(resolve(target, fixtureRoot, file.path));
      assert.equal(bytes.length, file.bytes);
      assert.equal(digest(bytes), file.sha256);
      publicPaths.add(`${fixtureRoot}/${file.path}`);
    }
    for (const [name, expected] of [["verification-command-contract.json", verificationDigest], ["evaluator-reference.json", referenceDigest], ["scoring-input-freeze-manifest.json", freezeDigest]])
      assert.equal(digest(readFileSync(resolve(target, fixtureRoot, name))), expected);
    for (const name of ["input-manifest.json", "metadata.json", "scoring-input-freeze-manifest.json"])
      publicPaths.add(`${fixtureRoot}/${name}`);
    const freeze = JSON.parse(readFileSync(resolve(target, fixtureRoot, "scoring-input-freeze-manifest.json")));
    for (const value of Object.values(freeze)) if (value && typeof value === "object" && "path" in value) publicPaths.add(value.path);
  }
  assert.equal(publicPaths.size, 41);
  for (const path of publicPaths) {
    const expected = execFileSync("git", ["-C", ROOT, "show", `${fixtureRevision}:${path}`], { encoding: null });
    assert.deepEqual(readFileSync(resolve(target, path)), expected, path);
  }
  for (const [path, bytes] of originals) assert.deepEqual(readFileSync(resolve(ROOT, path)), bytes, path);
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
