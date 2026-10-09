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
  for (const asset of skillAssets(target, selectedSkills)) {
    if (!entries.has(asset.sourcePath)) rmSync(resolve(target, asset.sourcePath));
  }
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
