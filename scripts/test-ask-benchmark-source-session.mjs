import assert from "node:assert/strict";
import { execFileSync, fork } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { once } from "node:events";
import { test } from "node:test";
import { pinSourceSession } from "./ask-benchmark-source-session.mjs";

const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-source-session-test-")));
const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], {
  encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
}).trim();
const commit = message => {
  git("add", "--", ".");
  git("-c", "user.name=ASK Test", "-c", "user.email=ask-test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", message);
  return git("rev-parse", "HEAD");
};
try {
  git("init", "--quiet");
  writeFileSync(resolve(root, "implementation.mjs"), 'export const version = "A";\n');
  const helper = pathToFileURL(resolve(fileURLToPath(new URL(".", import.meta.url)), "ask-benchmark-source-session.mjs")).href;
  writeFileSync(resolve(root, "worker.mjs"), `import { pinSourceSession } from ${JSON.stringify(helper)};
import { version } from "./implementation.mjs";
const session = pinSourceSession(${JSON.stringify(root)}, ["implementation.mjs", "worker.mjs"]);
process.send({ loaded: version });
process.once("message", () => {
  try { process.send({ identity: session.assertCurrent(), loaded: version }); }
  catch (error) { process.send({ error: error.code, loaded: version }); }
  process.disconnect();
});\n`);
  const a = commit("A");
  await test("clean pinned source returns detached identity without mutation", () => {
    const session = pinSourceSession(root, ["implementation.mjs"]);
    const identity = session.assertCurrent();
    assert.equal(identity.revision, a); identity.revision = "changed";
    assert.equal(session.assertCurrent().revision, a);
  });
  await test("same process keeps A loaded and refuses clean checkout B before its first API check", async () => {
    const child = fork(resolve(root, "worker.mjs"), [], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    const done = once(child, "exit");
    try {
      const [loaded] = await once(child, "message", { signal: AbortSignal.timeout(10000) }); assert.equal(loaded.loaded, "A");
      writeFileSync(resolve(root, "implementation.mjs"), 'export const version = "B";\n'); commit("B");
      assert.equal(git("status", "--porcelain"), "");
      const response = once(child, "message", { signal: AbortSignal.timeout(10000) }); child.send("check");
      const [result] = await response;
      assert.deepEqual(result, { error: "SUCCESSOR_SOURCE_SESSION_CHANGED", loaded: "A" });
      const [exit] = await done; assert.equal(exit, 0);
    } finally { if (child.exitCode === null) child.kill(); }
  });
  await test("an empty commit is still an identity change", () => {
    const session = pinSourceSession(root, ["implementation.mjs"]);
    commit("same tree, new revision");
    assert.throws(() => session.assertCurrent(), { code: "SUCCESSOR_SOURCE_SESSION_CHANGED" });
  });
  await test("dirty capture cannot be legitimized by restoring bytes before the first call", () => {
    const path = resolve(root, "implementation.mjs"); const original = readFileSync(path);
    writeFileSync(path, "dirty\n"); const session = pinSourceSession(root, ["implementation.mjs"]);
    writeFileSync(path, original);
    assert.throws(() => session.assertCurrent(), { code: "SUCCESSOR_DIRTY_SOURCE" });
  });
  await test("dirty edits after loading are rejected", () => {
    const path = resolve(root, "implementation.mjs"); const original = readFileSync(path);
    const session = pinSourceSession(root, ["implementation.mjs"]);
    try { writeFileSync(path, "dirty\n"); assert.throws(() => session.assertCurrent(), { code: "SUCCESSOR_DIRTY_SOURCE" }); }
    finally { writeFileSync(path, original); }
  });
  await test("a missing or escaping source inventory fails closed", () => {
    for (const path of ["missing.mjs", "../implementation.mjs", "/etc/passwd"]) assert.throws(() => pinSourceSession(root, [path]).assertCurrent());
  });
  await test("a committed symlink cannot be an implementation authority", () => {
    symlinkSync("implementation.mjs", resolve(root, "link.mjs")); commit("link fixture");
    assert.throws(() => pinSourceSession(root, ["link.mjs"]).assertCurrent(), { code: "SUCCESSOR_IMPLEMENTATION_TRANSPLANT" });
  });
} finally { rmSync(root, { recursive: true, force: true }); }
