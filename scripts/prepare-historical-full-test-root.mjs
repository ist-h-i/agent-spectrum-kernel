// Test-only historical context. Never reseals authority or enables execution.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { skillAssets } from "./skill-assets.mjs";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SPECS = [
  ["docs/mac-ask-full-static-inventory.json", "3634c9ef3801067636d990a63f1793c268390ccb4012a1e2f1c4ac2e5b566bed"],
  ["docs/mac-ask-full-reference-supplement.json", "466da3374a9d2311a335ebf7113288dccd1d1c25c9a5b9e278f4d03e61a05b5f"],
];
// This public task snapshot belongs only to the isolated historical protocol.
// Keep its matching reference separate from current model inputs and resources.
const TASK_REVISION = "9068e22a1c48378d0c266a103e3f8fb93861942e";
const TASK_ROOT = "benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap";
const TASK_FILES = [
  ["task.md", "4247670f22a882a630aadc8688e6ed9a7c7040fb31aad17bbab7a6bb831fa435", 437],
  ["workspace/.github/workflows/pull-request.yml", "d1a079e6bf8aea15c532c1ee06e9f505e92e40f6492be626dc8fd24f86eb382c", 431],
  ["workspace/ci/pull-request-314.log", "8cdd6705480e8b6a859bf40098fe0e3c358564c1e775acd14d8bb8c55ec98fd6", 403],
  ["workspace/docs/verification.md", "04b970363da50dd818517c0be65bd5e832e791d98d420bc978e9d1b5da702639", 529],
  ["workspace/package-lock.json", "1441bbf380d78c27f1604d32ba6c31806099a8d1e533877cd058c462e2b77723", 218],
  ["workspace/package.json", "849ad5e187dfe0a542479aef8411203d606559ab0f140865601913e165a88fe7", 373],
  ["workspace/pr.diff", "903d8a715665c7091aa7b7a0dba214235079abed3b09faa20510e46c64fbe834", 541],
  ["workspace/review.schema.json", "22e7984d1a6b3c8e92177500b7a566d5f0cc06fa5325acc55dc6c4dc6e91a62a", 1849],
  ["workspace/scripts/upload-diagnostics.mjs", "4f82ac80e4c5622d0e33bdd44c8e01628ed63eee9a2d313a1cd0c6e73857dd2c", 138],
  ["workspace/scripts/validate-review.mjs", "008cd831c8e38041af31be0cbbdc8fcb3b42ba45006492fbf32b870814882422", 2210],
  ["workspace/src/quote-order.mjs", "9b74bbd8aebbce93ccaca984dee24dcdef2161e219c6bb9f609381a46a7a43f4", 398],
  ["workspace/test/checkout/quote-order-contract.test.mjs", "92ec6bc43700ff64ae2c6d83725a3f71c1c871a5d9545a228f41f452f237f1fa", 381],
  ["workspace/test/unit/quote-order.test.mjs", "d82815c4131eb7fe5d42b83d88658bd6c3814b542203c15566848b2d4150e0c5", 664],
  ["input-manifest.json", "13e5d0c70feffed4db0bdf68b2b89b9b15005c53525a8e5b10d9198775d7ac25", 2698],
  ["verification-command-contract.json", "5426f0f2b1f82047f23cc6a76bd7689a2c22d7165d67af72a56df90072b78e78", 2748],
  ["evaluator-reference.json", "16aa4e11e6dd3cae7ae9b1d445b388f3b4177d9c797fa833657bc5ed03f7ddb2", 78981],
];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (root, args, encoding = "utf8") => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], {
  encoding, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
});
export function historicalSourceEntries(root) {
  const entries = new Map();
  let selectedSkills;
  for (const [path, digest] of SPECS) {
    assert.ok(lstatSync(resolve(root, path)).isFile() && !lstatSync(resolve(root, path)).isSymbolicLink(), "historical manifest must be regular");
    const bytes = readFileSync(resolve(root, path));
    assert.equal(hash(bytes), digest, "historical manifest drift");
    const manifest = JSON.parse(bytes);
    assert.match(manifest.source_commit, /^[a-f0-9]{40}$/u);
    selectedSkills ??= manifest.selected_skills;
    const records = manifest.assets ?? [...manifest.core_sources, ...manifest.renderer_inputs.canonical,
      ...manifest.renderer_inputs.adapter_owned, manifest.kernel_renderer_source];
    for (const entry of records) {
      assert.match(entry.path, /^(?:skills|scripts|schemas|docs|adapters)\/[A-Za-z0-9._/-]+$|^(?:AGENTS\.md|CUSTOM_INSTRUCTIONS\.md|README\.md|manifest\.json)$/u);
      assert.ok(!entry.path.split("/").some(part => ["", ".", ".."].includes(part)), "unsafe historical path");
      assert.match(entry.digest, /^sha256:[a-f0-9]{64}$/u);
      const mode = git(root, ["ls-tree", manifest.source_commit, "--", entry.path]).trim();
      assert.match(mode, /^100(?:644|755) blob [a-f0-9]{40}\t/u, "historical source must be regular");
      const value = git(root, ["show", `${manifest.source_commit}:${entry.path}`], null);
      assert.equal(`sha256:${hash(value)}`, entry.digest, `historical source drift: ${entry.path}`);
      if (entries.has(entry.path)) assert.equal(hash(entries.get(entry.path).value), hash(value), "conflicting historical sources");
      entries.set(entry.path, { value });
    }
  }
  for (const [relative, digest, bytes] of TASK_FILES) {
    assert.match(relative, /^(?:task\.md|input-manifest\.json|verification-command-contract\.json|evaluator-reference\.json|workspace\/[A-Za-z0-9._/-]+)$/u);
    assert.ok(!relative.split("/").some(part => ["", ".", ".."].includes(part)), "unsafe historical task path");
    const path = `${TASK_ROOT}/${relative}`;
    assert.equal(entries.has(path), false, "conflicting historical task source");
    const mode = git(root, ["ls-tree", TASK_REVISION, "--", path]).trim();
    assert.match(mode, /^100(?:644|755) blob [a-f0-9]{40}\t/u, "historical task source must be regular");
    const value = git(root, ["show", `${TASK_REVISION}:${path}`], null);
    assert.equal(value.length, bytes, `historical task byte length drift: ${path}`);
    assert.equal(hash(value), digest, `historical task source drift: ${path}`);
    entries.set(path, { value });
  }
  return { entries, selectedSkills };
}
export function prepareHistoricalFullTestRoot(root, destination) {
  const target = resolve(destination);
  assert.ok(!existsSync(target), "test destination must be new");
  const before = git(root, ["status", "--porcelain", "--untracked-files=normal"]);
  assert.equal(before, "", "historical compatibility requires a clean source checkout");
  const { entries, selectedSkills } = historicalSourceEntries(root);
  const revision = git(root, ["rev-parse", "HEAD"]).trim();
  git(root, ["clone", "--quiet", "--no-hardlinks", "--no-checkout", root, target]);
  git(target, ["checkout", "--quiet", "--detach", revision]);
  for (const [path, { value }] of entries) {
    let cursor = target;
    for (const part of path.split("/")) {
      cursor = resolve(cursor, part);
      assert.equal(lstatSync(cursor).isSymbolicLink(), false, "historical destination symlink");
    }
    assert.ok(lstatSync(cursor).isFile());
    writeFileSync(cursor, value);
  }
  // Recursive reference discovery must see exactly the sealed asset set.
  // Removal is confined to this newly created isolated checkout.
  const removed = new Set();
  for (const asset of skillAssets(target, selectedSkills)) {
    if (!entries.has(asset.sourcePath)) {
      removed.add(asset.sourcePath);
      rmSync(resolve(target, asset.sourcePath));
    }
  }
  const changed = git(target, ["diff", "--name-only"]).trim().split("\n").filter(Boolean);
  assert.ok(changed.every(path => entries.has(path) || removed.has(path)), "unexpected historical context change");
  git(target, ["add", "--", ...entries.keys(), "skills"]);
  git(target, ["-c", "user.name=ASK historical test", "-c", "user.email=synthetic-test@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "test-only immutable Full source context"]);
  assert.equal(git(target, ["rev-parse", "HEAD^"]).trim(), revision, "historical context parent changed");
  for (const path of git(root, ["ls-files", "scripts"]).trim().split("\n")) {
    if (!entries.has(path)) assert.deepEqual(readFileSync(resolve(target, path)), readFileSync(resolve(root, path)), `current script replaced: ${path}`);
  }
  assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), revision, "source HEAD changed");
  assert.equal(git(root, ["status", "--porcelain", "--untracked-files=normal"]), before, "source checkout changed");
  return target;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3);
  process.stdout.write(`${prepareHistoricalFullTestRoot(ROOT, process.argv[2])}\n`);
}
