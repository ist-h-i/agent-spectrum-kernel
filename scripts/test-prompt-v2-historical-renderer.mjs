import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { verifyHistoricalRenderer } from "./prompt-v2-historical-renderer.mjs";
import { loadPromptV2Preregistration } from "./ask-benchmark-prompt-v2.mjs";

function fixture(t, { symlink = false } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "ask-historical-renderer-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  mkdirSync(resolve(root, "scripts"));
  const path = "scripts/install-codex-adapter.mjs";
  const bytes = "// exact historical renderer\n";
  if (symlink) symlinkSync("outside.mjs", resolve(root, path)); else writeFileSync(resolve(root, path), bytes);
  git("add", "."); git("commit", "-qm", "historical source");
  const repository = { revision: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
  const binding = { path, raw_byte_digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
  return { root, git, repository, binding };
}

test("frozen renderer is checked without reading or changing the current renderer", (t) => {
  const f = fixture(t);
  writeFileSync(resolve(f.root, f.binding.path), "// different current implementation\n");
  assert.doesNotThrow(() => verifyHistoricalRenderer(f.root, f.repository, f.binding));
  rmSync(resolve(f.root, f.binding.path));
  assert.doesNotThrow(() => verifyHistoricalRenderer(f.root, f.repository, f.binding));
});
for (const key of ["revision", "tree"]) test(`rejects substituted source ${key}`, (t) => {
  const f = fixture(t);
  assert.throws(() => verifyHistoricalRenderer(f.root, { ...f.repository, [key]: "a".repeat(40) }, f.binding), /unavailable|mismatch/);
});
test("a matching-looking digest cannot replace the frozen bytes", (t) => {
  const f = fixture(t);
  assert.throws(() => verifyHistoricalRenderer(f.root, f.repository, { ...f.binding, raw_byte_digest: `sha256:${"0".repeat(64)}` }), /digest mismatch/);
});
test("rejects branches, arbitrary paths, and symbolic-link renderer objects", (t) => {
  const f = fixture(t);
  assert.throws(() => verifyHistoricalRenderer(f.root, { ...f.repository, revision: "HEAD" }, f.binding), /exact source/);
  for (const path of ["../outside", "scripts/other.mjs", "scripts/./install-codex-adapter.mjs"]) assert.throws(() => verifyHistoricalRenderer(f.root, f.repository, { ...f.binding, path }), /Invalid historical/);
  const linked = fixture(t, { symlink: true });
  assert.throws(() => verifyHistoricalRenderer(linked.root, linked.repository, linked.binding), /regular Git blob/);
});
test("Git replacement refs cannot substitute a historical commit", (t) => {
  const f = fixture(t);
  writeFileSync(resolve(f.root, f.binding.path), "// substituted\n");
  f.git("add", "."); f.git("commit", "-qm", "replacement");
  f.git("replace", f.repository.revision, f.git("rev-parse", "HEAD"));
  assert.doesNotThrow(() => verifyHistoricalRenderer(f.root, f.repository, f.binding));
});
test("ordinary preregistration validation still rejects a changed live renderer", () => {
  assert.throws(() => loadPromptV2Preregistration(), /renderer raw byte digest mismatch/);
});
test("historical mode cannot skip repository bindings or accept unknown modes", () => {
  assert.throws(() => loadPromptV2Preregistration({ rendererSource: "frozen_renderer_source", verifyRepositoryBindings: false }), /cannot skip/);
  assert.throws(() => loadPromptV2Preregistration({ rendererSource: "latest" }), /unknown renderer/);
});

// Exercise the real source pins as well as isolated synthetic Git fixtures.
// The execution workspace revision is intentionally not the renderer archive
// revision; the Codex renderer differs between them.
test("historical preregistration resolves the real frozen renderer source", () => {
  assert.doesNotThrow(() => loadPromptV2Preregistration({ rendererSource: "frozen_renderer_source" }));
});
