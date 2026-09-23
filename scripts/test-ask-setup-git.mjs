#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readSetupRepositoryId, setupRepositoryId } from "./ask-setup-git.mjs";

const CANARY = "ASK_TEST_ONLY_CREDENTIAL_296";
const ORIGIN = `https://fixture-user:${CANARY}@example.invalid/team/repo.git?token=${CANARY}#${CANARY}`;
const CLEAN_ORIGIN = "https://example.invalid/team/repo.git";

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "ask-setup-git-"));
  const target = resolve(root, "target");
  const home = resolve(root, "home");
  const globalConfig = resolve(home, ".gitconfig");
  const systemConfig = resolve(root, "system-config");
  mkdirSync(target);
  mkdirSync(home);
  writeFileSync(globalConfig, "");
  writeFileSync(systemConfig, "");
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_"))),
    HOME: home,
    XDG_CONFIG_HOME: resolve(home, "xdg"),
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_SYSTEM: systemConfig,
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (args, cwd = target) => {
    const result = spawnSync("git", args, { cwd, env: { ...env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull }, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, `fixture git ${args[0]} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(["init", "--quiet"]);
  git(["-c", "user.name=ASK fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture"]);
  const config = (...args) => git(["config", "--file", resolve(target, ".git/config"), "--no-includes", ...args], root);
  return { root, target, globalConfig, systemConfig, env, git, config };
}

function withEnvironment(env, fn) {
  const saved = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, env);
    return fn();
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

function assertPrivate(text) {
  assert.equal(text.includes(CANARY), false, "credential canary must not leave the Git identity boundary");
  assert.equal(text.includes("fixture-user"), false, "Git userinfo must not be emitted");
  assert.equal(text.includes("example.invalid/team/repo.git"), false, "origin must be opaque, not a display URL");
}

export function runSetupGitTests() {
  let count = 0;
  const check = (name, fn) => { fn(); count += 1; };
  const expected = `git:sha256:${createHash("sha256").update(`url:${CLEAN_ORIGIN}`).digest("hex")}`;
  check("exact opaque identity", () => assert.equal(setupRepositoryId(CLEAN_ORIGIN), expected));
  for (const origin of [ORIGIN, "https://another:rotated@example.invalid/team/repo.git?other=rotated#rotated", "https://%66ixture-user:%73ecret@example.invalid/team/repo.git", "HTTPS://example.invalid:443/team/repo.git"]) {
    check("userinfo/query/fragment/default port do not alter identity", () => {
      assert.equal(setupRepositoryId(origin), expected);
      assertPrivate(JSON.stringify(setupRepositoryId(origin)));
    });
  }
  for (const [credentialed, clean] of [
    [`ssh://fixture-user:${CANARY}@example.invalid/team/repo.git?token=${CANARY}`, "ssh://example.invalid/team/repo.git"],
    [`git://fixture-user:${CANARY}@example.invalid/team/repo.git#${CANARY}`, "git://example.invalid/team/repo.git"],
    [`fixture-user:${CANARY}@example.invalid:team/repo.git?token=${CANARY}`, "example.invalid:team/repo.git"],
    [`fixture-user@[::1]:team/repo.git#${CANARY}`, "[::1]:team/repo.git"],
    [`https://fixture-user:${CANARY}@[::1]:8443/team/repo.git`, "https://[::1]:8443/team/repo.git"],
  ]) {
    check("supported transport credentials are discarded", () => {
      assert.match(setupRepositoryId(clean), /^git:sha256:[a-f0-9]{64}$/);
      assert.equal(setupRepositoryId(credentialed), setupRepositoryId(clean));
      assertPrivate(JSON.stringify(setupRepositoryId(credentialed)));
    });
  }
  for (const origin of [null, undefined, 12, "", " ", "https://", "https://example.invalid/", "https://example.invalid/repo\nsecret", "https://example.invalid\\repo", `ext::${CANARY}`, `file:///tmp/${CANARY}`, `ftp://fixture-user:${CANARY}@example.invalid/repo`, "/tmp/local-repository"]) {
    check("unknown or malformed origin has no fabricated identity", () => assert.equal(setupRepositoryId(origin), null));
  }
  check("repository path drift", () => assert.notEqual(setupRepositoryId(CLEAN_ORIGIN), setupRepositoryId("https://example.invalid/team/other.git")));
  check("repository host drift", () => assert.notEqual(setupRepositoryId(CLEAN_ORIGIN), setupRepositoryId("https://other.invalid/team/repo.git")));
  check("scp relative and ssh absolute paths are distinct", () => assert.notEqual(setupRepositoryId("example.invalid:team/repo.git"), setupRepositoryId("ssh://example.invalid/team/repo.git")));

  const f = fixture();
  try {
    f.config("remote.origin.url", ORIGIN);
    check("real local Git origin is private", () => withEnvironment(f.env, () => assert.equal(readSetupRepositoryId(resolve(f.target, ".git")), expected)));
    const before = readFileSync(resolve(f.target, ".git/config"));
    writeFileSync(f.globalConfig, `invalid global config ${CANARY}\n`);
    writeFileSync(f.systemConfig, `invalid system config ${CANARY}\n`);
    check("global and system config are not parsed", () => withEnvironment({ ...f.env, GIT_CONFIG_NOSYSTEM: "0" }, () => assert.equal(readSetupRepositoryId(resolve(f.target, ".git")), expected)));
    check("local Git config is unchanged", () => assert.deepEqual(readFileSync(resolve(f.target, ".git/config")), before));
    const included = resolve(f.root, "included-config");
    writeFileSync(included, `invalid included config ${CANARY}\n`);
    f.config("include.path", included);
    f.config('includeIf.gitdir:/**.path', included);
    check("local includes and conditional includes are not followed", () => withEnvironment(f.env, () => assert.equal(readSetupRepositoryId(resolve(f.target, ".git")), expected)));
    const trace = resolve(f.root, "must-not-create-trace");
    check("inherited Git overrides and tracing are ignored", () => withEnvironment({
      ...f.env,
      GIT_DIR: resolve(f.root, "nonexistent-git-dir"),
      GIT_WORK_TREE: f.root,
      GIT_CONFIG: included,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "remote.origin.url",
      GIT_CONFIG_VALUE_0: `https://${CANARY}@other.invalid/repo`,
      GIT_CONFIG_PARAMETERS: "malformed parameters",
      GIT_TRACE: trace,
      GIT_TRACE2_EVENT: trace,
    }, () => {
      assert.equal(readSetupRepositoryId(resolve(f.target, ".git")), expected);
      assert.equal(existsSync(trace), false);
    }));
    f.config("--unset-all", "remote.origin.url");
    writeFileSync(f.globalConfig, `[remote "origin"]\n  url = ${ORIGIN}\n`);
    writeFileSync(f.systemConfig, `[remote "origin"]\n  url = ${ORIGIN}\n`);
    writeFileSync(included, `[remote "origin"]\n  url = ${ORIGIN}\n`);
    check("no fallback to global/system/include-only origin", () => withEnvironment(f.env, () => assert.equal(readSetupRepositoryId(resolve(f.target, ".git")), null)));
    f.config("--add", "remote.origin.url", ORIGIN);
    f.config("--add", "remote.origin.url", "https://other.invalid/repo");
    check("multiple local origins are ambiguous", () => withEnvironment(f.env, () => assert.equal(readSetupRepositoryId(resolve(f.target, ".git")), null)));
    f.config("--unset-all", "remote.origin.url");
    f.config("remote.origin.url", CLEAN_ORIGIN);
    f.config("--unset-all", "include.path");
    f.config("--unset-all", 'includeIf.gitdir:/**.path');
    writeFileSync(f.globalConfig, "");
    const worktree = resolve(f.root, "worktree");
    f.git(["worktree", "add", "--quiet", "--detach", worktree, "HEAD"]);
    check("linked worktree reads its repository-local origin", () => withEnvironment(f.env, () => assert.equal(readSetupRepositoryId(f.git(["rev-parse", "--absolute-git-dir"], worktree)), expected)));
    check("missing Git executable yields unknown identity", () => withEnvironment({ ...f.env, PATH: resolve(f.root, "no-executables") }, () => assert.equal(readSetupRepositoryId(resolve(f.target, ".git")), null)));
    check("not a Git repository", () => withEnvironment(f.env, () => assert.equal(readSetupRepositoryId(resolve(f.root, ".git")), null)));
    writeFileSync(resolve(f.target, ".git/config"), `invalid local config ${CANARY}\n`);
    check("Git errors are not echoed into identity output", () => withEnvironment(f.env, () => assert.equal(readSetupRepositoryId(resolve(f.target, ".git")), null)));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
  console.log(`ASK setup Git privacy tests passed: ${count} cases`);
  return count;
}

// Called by the full-source setup suite; never substitute a mock installer.
export function runSetupGitCliTests({ setupScript, repoRoot, auditTree }) {
  const f = fixture();
  const run = (args, status = 0) => {
    const result = spawnSync(process.execPath, [setupScript, ...args], {
      cwd: repoRoot, env: f.env, encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024,
    });
    assertPrivate(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    assert.equal(result.status, status, result.stderr);
    return result;
  };
  try {
    f.config("remote.origin.url", ORIGIN);
    const included = resolve(f.root, "included-config");
    writeFileSync(included, `invalid included config ${CANARY}\n`);
    f.config("include.path", included);
    writeFileSync(f.globalConfig, `invalid global config ${CANARY}\n`);
    const before = auditTree(f.target);
    const inspectArgs = ["inspect", "--target", f.target, "--json"];
    const inspected = JSON.parse(run(inspectArgs).stdout);
    assert.equal(inspected.target.repository_id, setupRepositoryId(CLEAN_ORIGIN));
    assert.match(inspected.target.revision, /^[a-f0-9]{40}$/);
    const planPath = resolve(f.root, "plan.json");
    const planArgs = ["plan", "--target", f.target, "--adapter", "kernel-only", "--json"];
    const planned = JSON.parse(run([...planArgs, "--output", planPath]).stdout);
    assertPrivate(readFileSync(planPath, "utf8"));
    assert.deepEqual(planned, JSON.parse(readFileSync(planPath, "utf8")));
    assert.equal(planned.target.repository_id, inspected.target.repository_id);
    assert.equal(planned.target.revision, inspected.target.revision);
    assert.equal(planned.selection.profile, "kernel-only");
    const explicit = JSON.parse(run([...planArgs, "--profile", "kernel-only"]).stdout);
    assert.equal(explicit.plan_digest, planned.plan_digest, "omitted and explicit kernel-only profile must agree");
    const checkArgs = ["check", "--target", f.target, "--plan", planPath, "--json"];
    assert.equal(JSON.parse(run(checkArgs).stdout).valid, true);
    assert.deepEqual(auditTree(f.target), before, "inspect/plan/check must not change even .git files");
    f.config("remote.origin.url", "https://rotated-user:rotated-token@example.invalid/team/repo.git?rotated-token#rotated-token");
    assert.equal(JSON.parse(run(checkArgs).stdout).valid, true, "credential rotation must not invalidate a saved plan");
    f.config("remote.origin.url", "https://other.invalid/team/repo.git");
    assert.match(run(checkArgs, 1).stderr, /identity or revision changed/);
    f.config("--unset-all", "remote.origin.url");
    writeFileSync(f.globalConfig, `[remote "origin"]\n  url = ${ORIGIN}\n`);
    writeFileSync(included, `[remote "origin"]\n  url = ${ORIGIN}\n`);
    assert.equal(JSON.parse(run(inspectArgs).stdout).target.repository_id, null);
    const globalPlanPath = resolve(f.root, "global-only-plan.json");
    const globalOnlyPlan = JSON.parse(run([...planArgs, "--output", globalPlanPath]).stdout);
    assert.equal(globalOnlyPlan.target.repository_id, null);
    assertPrivate(readFileSync(globalPlanPath, "utf8"));
    assert.equal(JSON.parse(run(["check", "--target", f.target, "--plan", globalPlanPath, "--json"]).stdout).valid, true);
    const invalidBefore = auditTree(f.target);
    for (const profile of ["full", "not-a-profile", ""]) {
      for (const command of ["recommend", "plan"]) {
        const output = resolve(f.root, `${command}-${profile || "empty"}.json`);
        const args = [command, "--target", f.target, "--adapter", "kernel-only", "--json", "--profile", profile];
        if (command === "plan") args.push("--output", output);
        assert.match(run(args, 1).stderr, /Unknown kernel-only profile|explicit profile name/);
        assert.equal(existsSync(output), false, "invalid profile must not save a plan");
      }
    }
    for (const suffix of [["--profile"], ["--profile", "--json"]]) {
      assert.match(run([...planArgs, ...suffix], 1).stderr, /explicit profile name/);
    }
    assert.deepEqual(auditTree(f.target), invalidBefore, "profile rejection must precede target mutation");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
  console.log("ASK setup Git privacy and profile CLI regressions passed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runSetupGitTests();
