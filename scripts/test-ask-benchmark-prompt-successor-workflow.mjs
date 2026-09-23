import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Execute the workflow's actual shell, not a separately maintained copy. These
// disposable Git fixtures prove source packaging only, never measured execution.
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workflow = readFileSync(resolve(root, ".github/workflows/issue291-measured.yml"), "utf8");
function shellStep(name) {
  const lines = workflow.split("\n");
  const matches = lines.flatMap((line, index) => line === `      - name: ${name}` ? [index] : []);
  assert.equal(matches.length, 1, `one exact workflow step: ${name}`);
  const start = matches[0] + 1;
  const next = lines.findIndex((line, index) => index >= start && /^      - /u.test(line));
  const step = lines.slice(start, next < 0 ? lines.length : next);
  const run = step.indexOf("        run: |");
  assert.ok(run >= 0, `${name}: a literal shell block is required`);
  const body = step.slice(run + 1).filter((line) => line.trim() !== "");
  assert.ok(body.length > 0 && body.every((line) => line.startsWith("          ")), `${name}: shell indentation`);
  return body.map((line) => line.slice(10)).join("\n");
}
const archiveShell = shellStep("Preserve exact preparation source for local verification");
const whitespaceShell = shellStep("Check exact PR whitespace");

function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), "ask-successor-workflow-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repo = resolve(directory, "repo");
  const runnerTemp = resolve(directory, "runner-temp");
  mkdirSync(repo); mkdirSync(runnerTemp);
  // Do not inherit caller Git repository/config/index overrides.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_") && !["BASH_ENV", "ENV"].includes(name)));
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Workflow test", GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Workflow test", GIT_COMMITTER_EMAIL: "test@example.invalid",
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
    LC_ALL: "C", RUNNER_TEMP: runnerTemp,
  });
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], {
    env, encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const commit = (path, text) => {
    writeFileSync(resolve(repo, path), text); git("add", "--", path); git("commit", "-m", path);
    return git("rev-parse", "HEAD");
  };
  git("init", "--initial-branch=release");
  const initial = commit("shared.txt", "shared\n");
  git("checkout", "-b", "feature");
  const head = commit("feature.txt", "feature\n");
  git("checkout", "release");
  const base = commit("release.txt", "base\n");
  git("merge", "--no-ff", "--no-edit", "feature");
  const checkout = git("rev-parse", "HEAD");
  // A reachable remote/local ref that must not be included in the bundle.
  git("checkout", "--orphan", "unrelated"); git("rm", "-rf", ".");
  const unrelated = commit("unrelated.txt", "must not enter source bundle\n");
  git("checkout", "--detach", checkout);
  Object.assign(env, { PR_BASE_SHA: base, PR_HEAD_SHA: head, EXPECTED_CHECKOUT_SHA: checkout });
  const run = (shell, overrides = {}) => spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", shell], {
    cwd: repo, env: { ...env, ...overrides }, encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024,
  });
  return { directory, repo, runnerTemp, env, git, commit, initial, base, head, checkout, unrelated, run };
}
function succeeds(result) {
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
}
function rejectsBeforePublication(f, overrides) {
  const result = f.run(archiveShell, overrides);
  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(resolve(f.runnerTemp, "ask291-source")), false, "reject before creating an artifact directory");
}

test("source archive round-trips the exact checkout and event identities, excluding unrelated refs", (t) => {
  const f = fixture(t);
  succeeds(f.run(archiveShell));
  const output = resolve(f.runnerTemp, "ask291-source");
  assert.equal(readFileSync(resolve(output, "identity.txt"), "utf8"), `${f.checkout}\n${f.git("rev-parse", `${f.checkout}^{tree}`)}\n`);
  assert.equal(readFileSync(resolve(output, "pr-context.txt"), "utf8"), [
    "evidence_scope=preparation_only", `pr_base_commit=${f.base}`, `pr_base_tree=${f.git("rev-parse", `${f.base}^{tree}`)}`,
    `pr_head_commit=${f.head}`, `pr_head_tree=${f.git("rev-parse", `${f.head}^{tree}`)}`, "",
  ].join("\n"));
  const bundle = resolve(output, "source.bundle");
  f.git("bundle", "verify", bundle);
  assert.equal(f.git("bundle", "list-heads", bundle), `${f.checkout} HEAD`);
  const clone = resolve(f.directory, "restored");
  execFileSync("git", ["clone", "--quiet", bundle, clone], { env: f.env, timeout: 10000, stdio: "pipe" });
  const restored = (...args) => spawnSync("git", ["-C", clone, ...args], { env: f.env, encoding: "utf8", timeout: 10000 });
  for (const sha of [f.initial, f.base, f.head, f.checkout]) succeeds(restored("cat-file", "-e", `${sha}^{commit}`));
  assert.notEqual(restored("cat-file", "-e", `${f.unrelated}^{commit}`).status, 0);
  assert.equal(restored("rev-parse", "HEAD^{tree}").stdout.trim(), f.git("rev-parse", "HEAD^{tree}"));
  assert.equal(readFileSync(resolve(clone, "feature.txt"), "utf8"), "feature\n");
  assert.equal(readFileSync(resolve(clone, "release.txt"), "utf8"), "base\n");
});

for (const [name, invalid] of [
  ["wrong checkout", (f) => ({ EXPECTED_CHECKOUT_SHA: f.head })],
  ["unrelated base", (f) => ({ PR_BASE_SHA: f.unrelated })],
  ["unrelated head", (f) => ({ PR_HEAD_SHA: f.unrelated })],
  ["missing base object", () => ({ PR_BASE_SHA: "f".repeat(40) })],
  ["missing head object", () => ({ PR_HEAD_SHA: "f".repeat(40) })],
  ["empty checkout identity", () => ({ EXPECTED_CHECKOUT_SHA: "" })],
  ["empty base identity", () => ({ PR_BASE_SHA: "" })],
  ["empty head identity", () => ({ PR_HEAD_SHA: "" })],
]) test(`source packaging rejects ${name} before publication`, (t) => {
  const f = fixture(t); rejectsBeforePublication(f, invalid(f));
});

test("missing runner temp cannot redirect artifact writes to the filesystem root", (t) => {
  const f = fixture(t);
  // The stub prevents any root write even when this regression is run against
  // the old shell. Merely receiving a nonzero exit is not sufficient evidence.
  const marker = resolve(f.directory, "mkdir-called");
  const guarded = `mkdir() { printf '%s\\n' "$*" > "$MKDIR_MARKER"; return 73; }\n${archiveShell}`;
  const result = f.run(guarded, { RUNNER_TEMP: "", MKDIR_MARKER: marker });
  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(marker), false, "validate RUNNER_TEMP before calling mkdir");
});

test("whitespace checks use the event's non-main base and head, not a later moving ref", (t) => {
  const f = fixture(t);
  // Neither main nor origin/main exists in this fixture.
  succeeds(f.run(whitespaceShell));
  f.git("checkout", "feature"); f.commit("late.txt", "trailing whitespace \n");
  f.git("checkout", "--detach", f.checkout);
  succeeds(f.run(whitespaceShell));
  succeeds(f.run(archiveShell));
});

test("whitespace introduced by the pinned PR head fails", (t) => {
  const f = fixture(t);
  f.git("checkout", "feature");
  const bad = f.commit("bad.txt", "trailing whitespace \n");
  const result = f.run(whitespaceShell, { PR_HEAD_SHA: bad });
  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /bad\.txt:1: trailing whitespace/u);
});

test("preparation workflow retains its read-only and missing-artifact boundaries", () => {
  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.doesNotMatch(workflow, /^\s*pull_request_target:/mu);
  assert.match(workflow, /node-version: '24'/u);
  assert.match(workflow, /if-no-files-found: error/u);
  assert.match(workflow, /node --test scripts\/test-ask-benchmark-prompt-successor-workflow\.mjs/u);
});
