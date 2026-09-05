#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  linkSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  auditRiskWorkspace,
  createRiskWorkspace,
  disposeRiskWorkspace,
  promoteRiskWorkspace,
  runInRiskWorkspace,
  validateRiskActionEnforcement,
} from "./codex-risk-workspace.mjs";
import { materializeRiskExecutionEnvironment, readStableExecutableFile, resolveRiskExecutionEnvironment, riskCodexRuntimePolicy, verifyRiskCodexExecutor } from "./codex-risk-approval.mjs";

const root = realpathSync(mkdtempSync(resolve(tmpdir(), "codex-risk-workspace-test-")));
const repository = resolve(root, "repository");
const outside = resolve(root, "outside.txt");

function run(command, args, cwd = repository) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function commit(message) {
  run("git", ["add", "."]);
  run("git", ["-c", "user.name=ASK Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", message]);
}

const action = {
  target_scope: ["allowed"],
  permitted_effects: ["create", "modify", "delete"],
  prohibited_effects: ["external_side_effects", "git_metadata_changes", "write_outside_target_scope"],
};

function request() {
  return {
    request_sha256: `sha256:${"a".repeat(64)}`,
    action,
    invocation: {
      repository: {
        head_sha: run("git", ["rev-parse", "HEAD^{commit}"]),
        tree_sha: run("git", ["rev-parse", "HEAD^{tree}"]),
      },
      runtime_policy: riskCodexRuntimePolicy(),
    },
  };
}

try {
  mkdirSync(resolve(repository, "allowed"), { recursive: true });
  writeFileSync(resolve(repository, "allowed/modify.txt"), "before\n");
  writeFileSync(resolve(repository, "allowed/delete.txt"), "delete\n");
  writeFileSync(resolve(repository, "sibling.txt"), "sibling\n");
  run("git", ["init", "-b", "main"]);
  commit("fixture");

  assert.doesNotThrow(() => validateRiskActionEnforcement(action));
  assert.throws(() => validateRiskActionEnforcement({ ...action, permitted_effects: ["publish"] }), /create, modify, and delete/u);
  assert.throws(() => validateRiskActionEnforcement({ ...action, target_scope: [".git/config"] }), /reserved Git metadata/u);
  assert.throws(() => validateRiskActionEnforcement({ ...action, prohibited_effects: ["write_outside_target_scope"] }), /must include/u);

  mkdirSync(resolve(repository, ".codex"));
  writeFileSync(resolve(repository, ".codex/config.toml"), "[mcp_servers.unapproved]\ncommand = '/tmp/unapproved'\n");
  commit("project config fixture");
  assert.throws(() => createRiskWorkspace({ target: repository, request: request() }), /project Codex configuration layer/u, "a tracked project config must fail closed before Codex execution");
  run("git", ["reset", "--hard", "HEAD~1"]);

  const exact = createRiskWorkspace({ target: repository, request: request() });
  try {
    assert.equal(readFileSync(resolve(exact.workspace, "allowed/modify.txt"), "utf8"), "before\n");
    assert.throws(() => readFileSync(resolve(exact.workspace, ".git/config"), "utf8"), /ENOENT/u, "isolated workspace must contain no Git metadata");
    writeFileSync(resolve(exact.workspace, "allowed/modify.txt"), "after\n");
    writeFileSync(resolve(exact.workspace, "allowed/create.txt"), "created\n");
    rmSync(resolve(exact.workspace, "allowed/delete.txt"));
    const audit = auditRiskWorkspace(exact);
    assert.deepEqual(audit.observed_effects, ["create", "delete", "modify"]);
    assert.equal(readFileSync(resolve(repository, "allowed/modify.txt"), "utf8"), "before\n", "candidate execution must not directly mutate the repository");
    const promoted = promoteRiskWorkspace(exact, audit);
    assert.deepEqual(promoted.promoted_paths, ["allowed/create.txt", "allowed/delete.txt", "allowed/modify.txt"]);
    assert.equal(readFileSync(resolve(repository, "allowed/modify.txt"), "utf8"), "after\n");
    assert.equal(readFileSync(resolve(repository, "allowed/create.txt"), "utf8"), "created\n");
  } finally {
    disposeRiskWorkspace(exact);
  }

  run("git", ["reset", "--hard", "HEAD"]);
  run("git", ["clean", "-fd"]);
  const outOfScope = createRiskWorkspace({ target: repository, request: request() });
  try {
    writeFileSync(resolve(outOfScope.workspace, "sibling.txt"), "changed\n");
    assert.throws(() => auditRiskWorkspace(outOfScope), /out-of-scope/u);
    assert.equal(readFileSync(resolve(repository, "sibling.txt"), "utf8"), "sibling\n");
  } finally {
    disposeRiskWorkspace(outOfScope);
  }

  const symlink = createRiskWorkspace({ target: repository, request: request() });
  try {
    symlinkSync("../sibling.txt", resolve(symlink.workspace, "allowed/link"));
    assert.throws(() => auditRiskWorkspace(symlink), /symbolic link/u);
  } finally {
    disposeRiskWorkspace(symlink);
  }

  const hardlink = createRiskWorkspace({ target: repository, request: request() });
  try {
    linkSync(resolve(hardlink.workspace, "allowed/modify.txt"), resolve(hardlink.workspace, "allowed/hardlink"));
    assert.throws(() => auditRiskWorkspace(hardlink), /hard-linked/u);
  } finally {
    disposeRiskWorkspace(hardlink);
  }

  const special = createRiskWorkspace({ target: repository, request: request() });
  try {
    run("mkfifo", [resolve(special.workspace, "allowed/fifo")], root);
    assert.throws(() => auditRiskWorkspace(special), /special file/u);
  } finally {
    disposeRiskWorkspace(special);
  }

  const drift = createRiskWorkspace({ target: repository, request: request() });
  try {
    writeFileSync(resolve(drift.workspace, "allowed/modify.txt"), "approved candidate\n");
    const audit = auditRiskWorkspace(drift);
    writeFileSync(resolve(repository, "allowed/modify.txt"), "unapproved original drift\n");
    assert.throws(() => promoteRiskWorkspace(drift, audit), /clean|base bytes changed/u);
    assert.equal(readFileSync(resolve(repository, "allowed/modify.txt"), "utf8"), "unapproved original drift\n");
  } finally {
    run("git", ["reset", "--hard", "HEAD"]);
    run("git", ["clean", "-fd"]);
    disposeRiskWorkspace(drift);
  }

  if (process.platform === "darwin") {
    const riskEnvironmentSpec = resolveRiskExecutionEnvironment({ OPENAI_API_KEY: "fixture-api-key" });
    const nodeEvidence = readStableExecutableFile(process.execPath, "Node test executable");
    const nodeExecutor = {
      native_binary: {
        canonical_path: nodeEvidence.path,
        raw_sha256: nodeEvidence.file_sha256,
        size_bytes: nodeEvidence.bytes.length,
        executable_format: "mach-o",
      },
      spawn_path: nodeEvidence.path,
      spawn_method: "runner_owned_verified_snapshot",
    };
    const isolated = createRiskWorkspace({ target: repository, request: request() });
    const executable = resolve(root, "fake-risk-executable.mjs");
    writeFileSync(executable, `import { writeFileSync } from "node:fs";\nimport { resolve } from "node:path";\nlet denied = false;\ntry { writeFileSync(process.argv[2], "mutated\\n"); } catch { denied = true; }\nwriteFileSync(resolve(process.cwd(), "allowed/isolation.txt"), denied ? "outside-denied\\n" : "outside-allowed\\n");\n`);
    run("chmod", ["755", executable], root);
    writeFileSync(outside, "original\n");
    try {
      const riskEnvironment = materializeRiskExecutionEnvironment(riskEnvironmentSpec, isolated.taskRoot);
      const result = await runInRiskWorkspace({ context: isolated, executable: process.execPath, executorBinding: nodeExecutor, args: [executable, outside], input: "", env: riskEnvironment.environment, environmentPolicy: riskEnvironment.policy });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(readFileSync(outside, "utf8"), "original\n", "OS isolation must deny writes outside the disposable workspace");
      assert.equal(readFileSync(resolve(isolated.workspace, "allowed/isolation.txt"), "utf8"), "outside-denied\n");
    } finally {
      disposeRiskWorkspace(isolated);
    }

    const boundary = createRiskWorkspace({ target: repository, request: request() });
    const boundaryExecutable = resolve(root, "fake-cross-boundary-links.mjs");
    writeFileSync(boundaryExecutable, `
import { existsSync, linkSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
for (const [kind, create] of [
  ["hardlink", (path) => linkSync(process.argv[2], path)],
  ["symlink", (path) => symlinkSync(process.argv[2], path)],
]) {
  const path = resolve(process.cwd(), "allowed/" + kind);
  try {
    create(path);
    writeFileSync(path, kind + "-mutation\\n");
  } catch {}
  finally { if (existsSync(path)) unlinkSync(path); }
}
`);
    run("chmod", ["755", boundaryExecutable], root);
    writeFileSync(outside, "original\n");
    try {
      const riskEnvironment = materializeRiskExecutionEnvironment(riskEnvironmentSpec, boundary.taskRoot);
      const result = await runInRiskWorkspace({ context: boundary, executable: process.execPath, executorBinding: nodeExecutor, args: [boundaryExecutable, outside], input: "", env: riskEnvironment.environment, environmentPolicy: riskEnvironment.policy });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(readFileSync(outside, "utf8"), "original\n", "hardlink and symlink attempts must not mutate outside bytes before audit");
      assert.deepEqual(auditRiskWorkspace(boundary).delta, [], "transient cross-boundary links must leave no accepted workspace delta");
    } finally {
      disposeRiskWorkspace(boundary);
    }

    const residual = createRiskWorkspace({ target: repository, request: request() });
    const residualExecutable = resolve(root, "fake-residual-child.mjs");
    writeFileSync(residualExecutable, "import { spawn } from 'node:child_process';\nspawn(process.execPath, ['-e', `setTimeout(() => require('node:fs').writeFileSync('allowed/residual.txt', 'late\\\\n'), 500)`], { detached: true, stdio: 'ignore' }).unref();\n");
    run("chmod", ["755", residualExecutable], root);
    try {
      const riskEnvironment = materializeRiskExecutionEnvironment(riskEnvironmentSpec, residual.taskRoot);
      const result = await runInRiskWorkspace({ context: residual, executable: process.execPath, executorBinding: nodeExecutor, args: [residualExecutable], input: "", env: riskEnvironment.environment, environmentPolicy: riskEnvironment.policy });
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
      assert.equal(result.error === null || /residual child process/u.test(result.error), true);
      assert.equal(existsSync(resolve(residual.workspace, "allowed/residual.txt")), false, "isolated execution must leave no child able to mutate after process return");
    } finally {
      disposeRiskWorkspace(residual);
    }

    const swapped = createRiskWorkspace({ target: repository, request: request() });
    const swappedExecutable = resolve(root, "swapped-native");
    copyFileSync(process.execPath, swappedExecutable);
    chmodSync(swappedExecutable, 0o755);
    const swappedEvidence = readStableExecutableFile(swappedExecutable, "pre-swap native executable");
    const swappedBinding = {
      native_binary: {
        canonical_path: swappedEvidence.path,
        raw_sha256: swappedEvidence.file_sha256,
        size_bytes: swappedEvidence.bytes.length,
        executable_format: "mach-o",
      },
      spawn_path: swappedEvidence.path,
      spawn_method: "runner_owned_verified_snapshot",
    };
    verifyRiskCodexExecutor(swappedBinding);
    writeFileSync(swappedExecutable, Buffer.concat([swappedEvidence.bytes, Buffer.from("post-verification replacement", "utf8")]));
    chmodSync(swappedExecutable, 0o755);
    try {
      const riskEnvironment = materializeRiskExecutionEnvironment(riskEnvironmentSpec, swapped.taskRoot);
      await assert.rejects(
        runInRiskWorkspace({ context: swapped, executable: swappedExecutable, executorBinding: swappedBinding, args: [], input: "", env: riskEnvironment.environment, environmentPolicy: riskEnvironment.policy }),
        /identity changed/u,
        "an executable replaced after the caller's verification must be rejected again inside the spawn boundary",
      );
    } finally {
      disposeRiskWorkspace(swapped);
    }
  }

  console.log("Codex risk workspace tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
