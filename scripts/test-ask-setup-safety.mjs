#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readSetupRepositoryId, setupRepositoryId, validateSetupGitMetadata } from "./ask-setup-git.mjs";
import { parseSetupJson, readSetupJson, sanitizeSetupDoctorReport, summarizeSetupProcessFailure } from "./ask-setup-diagnostics.mjs";

const CANARY = "PRIVATE_TEST_CANARY_296";
const ORIGIN = "https://example.invalid/safety-fixture.git";
const HASH = "a".repeat(40);
const LINK_ERROR = /Symlink is not supported for setup Git metadata/;

function fixture() {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-setup-safety-")));
  const target = resolve(root, "target");
  const gitDir = resolve(target, ".git");
  mkdirSync(resolve(gitDir, "refs/heads"), { recursive: true });
  writeFileSync(resolve(gitDir, "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(resolve(gitDir, "refs/heads/main"), `${HASH}\n`);
  writeFileSync(resolve(gitDir, "config"), `[remote "origin"]\n url = ${ORIGIN}\n`);
  const external = resolve(root, "global-config");
  writeFileSync(external, `[remote "origin"]\n url = https://example.invalid/global-only.git\n`);
  return { root, target, gitDir, external };
}

function privateError(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.match(error.message, pattern);
    assert.equal(error.message.includes(CANARY), false);
    assert.equal(error.message.includes(CANARY.slice(0, 8)), false);
    assert.equal(error.cause, undefined, "a raw parser error must not be retained as cause");
    return true;
  });
}

export function runSetupSafetyTests() {
  let count = 0;
  const check = (name, action) => {
    const f = fixture();
    try {
      action(f);
      count += 1;
    } catch (error) {
      throw new Error(`Setup safety case failed: ${name}`, { cause: error });
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  };
  check("regular repository", ({ target, gitDir }) => {
    assert.equal(validateSetupGitMetadata(target), gitDir);
    assert.equal(readSetupRepositoryId(gitDir), setupRepositoryId(ORIGIN));
  });
  check("target path alias is canonicalized", ({ root, target, gitDir }) => {
    const alias = resolve(root, "target-alias");
    symlinkSync(target, alias);
    assert.equal(validateSetupGitMetadata(alias), gitDir);
  });
  check("non-Git target", ({ target, gitDir }) => {
    rmSync(gitDir, { recursive: true });
    assert.equal(validateSetupGitMetadata(target), null);
    assert.equal(readSetupRepositoryId(gitDir), null);
  });
  check("Unicode branch", ({ target, gitDir }) => {
    writeFileSync(resolve(gitDir, "HEAD"), "ref: refs/heads/改善\n");
    writeFileSync(resolve(gitDir, "refs/heads/改善"), HASH);
    assert.equal(validateSetupGitMetadata(target), gitDir);
  });
  check("separate Git directory", ({ root, target, gitDir }) => {
    const externalGit = resolve(root, "separate-git");
    mkdirSync(externalGit);
    writeFileSync(resolve(externalGit, "HEAD"), HASH);
    writeFileSync(resolve(externalGit, "config"), `[remote "origin"]\n url = ${ORIGIN}\n`);
    rmSync(gitDir, { recursive: true });
    writeFileSync(gitDir, "gitdir: ../separate-git\n");
    assert.equal(validateSetupGitMetadata(target), externalGit);
    assert.equal(readSetupRepositoryId(externalGit), setupRepositoryId(ORIGIN));
  });
  check("linked worktree and common refs", ({ root, gitDir }) => {
    const worktree = resolve(root, "worktree");
    const metadata = resolve(gitDir, "worktrees/fixture");
    mkdirSync(worktree);
    mkdirSync(metadata, { recursive: true });
    writeFileSync(resolve(worktree, ".git"), `gitdir: ${metadata}\n`);
    writeFileSync(resolve(metadata, "commondir"), "../..\n");
    writeFileSync(resolve(metadata, "HEAD"), "ref: refs/heads/main\n");
    assert.equal(validateSetupGitMetadata(worktree), metadata);
    assert.equal(readSetupRepositoryId(metadata), setupRepositoryId(ORIGIN));
  });
  for (const kind of ["external", "internal", "relative", "dangling", "chain", "cycle"]) {
    check(`config ${kind} link`, ({ gitDir, external, target }) => {
      const config = resolve(gitDir, "config");
      rmSync(config);
      let destination = external;
      if (kind === "internal") {
        destination = resolve(gitDir, "local-config");
        writeFileSync(destination, readFileSync(external));
      }
      if (kind === "relative") destination = "../../global-config";
      if (kind === "dangling") destination = "missing-config";
      if (kind === "chain") {
        symlinkSync(external, resolve(gitDir, "middle"));
        destination = "middle";
      }
      if (kind === "cycle") destination = "config";
      symlinkSync(destination, config);
      privateError(() => readSetupRepositoryId(gitDir), LINK_ERROR);
      privateError(() => validateSetupGitMetadata(target), LINK_ERROR);
    });
  }
  for (const path of ["HEAD", "commondir", "packed-refs", "refs/heads/main", "refs/heads"]) {
    check(`${path} link`, ({ gitDir, external, target }) => {
      const file = resolve(gitDir, path);
      rmSync(file, { recursive: true, force: true });
      symlinkSync(external, file);
      privateError(() => validateSetupGitMetadata(target), LINK_ERROR);
    });
  }
  for (const kind of ["directory", "file", "dangling"]) {
    check(`.git ${kind} link`, ({ target, gitDir, root }) => {
      const destination = resolve(root, `linked-${kind}`);
      if (kind === "directory") mkdirSync(destination);
      if (kind === "file") writeFileSync(destination, "gitdir: somewhere\n");
      rmSync(gitDir, { recursive: true });
      symlinkSync(destination, gitDir);
      privateError(() => validateSetupGitMetadata(target), LINK_ERROR);
    });
  }
  check("Git pointer has linked ancestor", ({ root, target, gitDir }) => {
    const parent = resolve(root, "parent");
    mkdirSync(resolve(parent, "repo"), { recursive: true });
    symlinkSync(parent, resolve(root, "alias"));
    rmSync(gitDir, { recursive: true });
    writeFileSync(gitDir, "gitdir: ../alias/repo\n");
    privateError(() => validateSetupGitMetadata(target), LINK_ERROR);
  });
  for (const ref of ["/outside", "../outside", "refs/../outside", "refs//main", "refs/./main", "refs\\heads\\main"]) {
    check(`unsafe ref ${ref}`, ({ target, gitDir }) => {
      writeFileSync(resolve(gitDir, "HEAD"), `ref: ${ref}\n`);
      privateError(() => validateSetupGitMetadata(target), /Invalid setup Git reference path/);
    });
  }
  for (const path of ["config", "HEAD", "commondir", "packed-refs"]) {
    check(`${path} directory is not a file`, ({ gitDir, target }) => {
      const file = resolve(gitDir, path);
      rmSync(file, { force: true });
      mkdirSync(file);
      privateError(() => validateSetupGitMetadata(target), /Unsupported setup Git metadata file type/);
    });
  }
  if (process.platform !== "win32") {
    for (const path of ["config", "HEAD", "commondir", "packed-refs"]) {
      check(`${path} FIFO is rejected without reading`, ({ gitDir, target }) => {
        const file = resolve(gitDir, path);
        rmSync(file, { force: true });
        assert.equal(spawnSync("mkfifo", [file], { timeout: 5000 }).status, 0);
        privateError(() => validateSetupGitMetadata(target), /Unsupported setup Git metadata file type/);
      });
    }
  }
  for (const text of [CANARY, `{ "secret": "${CANARY}", broken }`, `["${CANARY}",]`]) {
    check("JSON parser excerpts are private", ({ root }) => {
      const path = resolve(root, "input.json");
      writeFileSync(path, text);
      privateError(() => parseSetupJson(text), /Invalid JSON in setup input/);
      privateError(() => readSetupJson(path), /Invalid JSON in setup input/);
    });
  }
  check("valid JSON is unchanged", () => assert.deepEqual(parseSetupJson('{"ok":true}'), { ok: true }));
  for (const [output, pattern] of [
    [`fatal: ${CANARY}`, /output is not included/],
    [`Unexpected token P: ${CANARY}`, /Invalid JSON in installer input/],
    [`managed file conflict: ${CANARY}`, /Managed file conflict/],
    [`modified locally: ${CANARY}`, /modified locally/],
  ]) {
    check("subprocess diagnostics omit input", () => {
      for (const stream of ["stdout", "stderr"]) {
        const message = summarizeSetupProcessFailure({ [stream]: output });
        assert.match(message, pattern);
        assert.equal(message.includes(CANARY), false);
      }
    });
  }
  check("valid doctor JSON cannot carry parser excerpts", () => {
    const report = {
      status: "fail", deploymentStatus: { Installed: { status: "fail" } },
      failures: [`hooks are invalid JSON: ${CANARY}`],
      findings: [{ message: `Unexpected token P: ${CANARY}`, severity: "fail" }],
      warnings: ["missing installation state"],
    };
    const safe = sanitizeSetupDoctorReport(report);
    assert.equal(JSON.stringify(safe).includes(CANARY.slice(0, 8)), false);
    assert.equal(safe.status, "fail");
    assert.deepEqual(safe.deploymentStatus, report.deploymentStatus);
    assert.deepEqual(safe.warnings, report.warnings);
    assert.equal(safe.findings[0].severity, "fail");
  });
  check("timeout has fixed diagnostic", () => assert.match(summarizeSetupProcessFailure({ error: { code: "ETIMEDOUT" } }), /timed out/));
  console.log(`ASK setup metadata/diagnostic safety tests passed: ${count} cases`);
  return count;
}

export function runSetupSafetyCliTests({ setupScript, repoRoot, auditTree }) {
  const f = fixture();
  const run = (args, status) => {
    const result = spawnSync(process.execPath, [setupScript, ...args], {
      cwd: repoRoot, encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(output.includes(CANARY.slice(0, 8)), false, "CLI must not emit even a parser's shortened excerpt");
    assert.equal(result.status, status, result.stderr);
    return result;
  };
  try {
    const state = resolve(f.target, ".agent-spectrum-kernel/install-state.json");
    mkdirSync(dirname(state), { recursive: true });
    writeFileSync(state, CANARY);
    const before = auditTree(f.root);
    const inspected = JSON.parse(run(["inspect", "--target", f.target, "--json"], 0).stdout);
    assert.equal(inspected.ask.core.valid, false);
    assert.match(inspected.ask.core.error, /unreadable or invalid/);
    const rejectedPlan = resolve(f.root, "must-not-create.json");
    run(["plan", "--target", f.target, "--adapter", "kernel-only", "--output", rejectedPlan, "--json"], 1);
    run(["doctor", "--target", f.target, "--json"], 1);
    run(["check", "--target", f.target, "--plan", state, "--json"], 1);
    assert.equal(existsSync(rejectedPlan), false);
    assert.deepEqual(auditTree(f.root), before, "failed diagnostics must preserve every fixture byte");
    rmSync(state);
    const hooks = resolve(f.target, ".claude/settings.json");
    mkdirSync(dirname(hooks));
    writeFileSync(hooks, CANARY);
    const hookBefore = auditTree(f.root);
    const health = JSON.parse(run(["doctor", "--target", f.target, "--json"], 1).stdout);
    assert.equal(health.status, "fail", "doctor must preserve its health failure and non-zero exit");
    assert.ok(health.failures.some((message) => /Invalid JSON in doctor input/.test(message)));
    assert.deepEqual(auditTree(f.root), hookBefore);
    rmSync(dirname(hooks), { recursive: true });
    const invalidReference = resolve(f.root, "portfolio.json");
    writeFileSync(invalidReference, CANARY);
    const portfolioBefore = auditTree(f.root);
    run(["plan", "--target", f.target, "--adapter", "kernel-only", "--portfolio-reference", invalidReference, "--json"], 1);
    assert.deepEqual(auditTree(f.root), portfolioBefore);
    const savedPlan = resolve(f.root, "valid-plan.json");
    run(["plan", "--target", f.target, "--adapter", "kernel-only", "--output", savedPlan, "--json"], 0);
    rmSync(resolve(f.gitDir, "config"));
    symlinkSync(f.external, resolve(f.gitDir, "config"));
    const linkedBefore = auditTree(f.root);
    for (const args of [
      ["inspect"], ["recommend", "--adapter", "kernel-only"],
      ["plan", "--adapter", "kernel-only", "--output", rejectedPlan],
      ["check", "--plan", savedPlan], ["doctor"],
    ]) {
      assert.match(run([...args, "--target", f.target, "--json"], 1).stderr, LINK_ERROR);
    }
    assert.equal(existsSync(rejectedPlan), false);
    assert.deepEqual(auditTree(f.root), linkedBefore, "rejected Git metadata must not change target or external files");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
  console.log("ASK setup metadata and diagnostic privacy CLI regressions passed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runSetupSafetyTests();
