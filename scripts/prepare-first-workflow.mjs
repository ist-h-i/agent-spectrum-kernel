#!/usr/bin/env node
// A bounded fixture preparer, never an agent/model/evaluation launcher.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { devNull, release, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureApplyTarget, managedSetupIdentities, setupChildEnvironment } from "./ask-setup-apply-state.mjs";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const FIXTURE = "docs/fixtures/first-workflow-315";
// Closed public seed inventory. Do not copy a benchmark fixture directory.
const SEED = "benchmarks/fixtures/checkpoint-b2/impl-rule-batch-medium-hard";
const FILES = ["package.json", "docs/rule-batches.md", "docs/rule-batch.schema.json", "src/errors.mjs",
  "src/index.mjs", "src/rule-service.mjs", "src/rule-store.mjs", "src/validation.mjs", "test/rule-service.test.mjs"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function sourceBytes(path) {
  const absolute = resolve(ROOT, path);
  assert.equal(realpathSync(absolute), absolute, "seed inputs must be canonical regular files");
  assert.ok(lstatSync(absolute).isFile());
  return readFileSync(absolute);
}
function writePrivate(path, bytes) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
}
function localProcess(executable, args, cwd, env) {
  const result = spawnSync(executable, args, { cwd, env, encoding: "utf8", shell: false, timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.error, undefined, "local preparation command must complete");
  assert.equal(result.signal, null);
  return result;
}

export function prepareFirstWorkflow() {
  assert.match(process.version, /^v24\./u, "use the documented Node 24 runtime");
  const seed = JSON.parse(sourceBytes(`${FIXTURE}/seed.json`));
  assert.equal(seed.source_base, SEED);
  assert.equal(seed.task, "task.md");
  assert.deepEqual(seed.workspace_files, FILES);
  const parent = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-first-workflow-")));
  chmodSync(parent, 0o700);
  const workspace = resolve(parent, "workspace");
  const evidence = resolve(parent, "local-records");
  const env = { ...setupChildEnvironment(), GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: devNull };
  mkdirSync(workspace, { mode: 0o700 });
  const inputFiles = FILES.map((path) => {
    const bytes = sourceBytes(`${SEED}/workspace/${path}`);
    writePrivate(resolve(workspace, path), bytes);
    return { path, sha256: sha256(bytes) };
  });
  const task = sourceBytes(`${SEED}/task.md`);
  writePrivate(resolve(workspace, "task.md"), task);
  inputFiles.push({ path: "task.md", sha256: sha256(task) });
  for (const name of ["implementation-input-ja.md", "bypass-input-ja.md"]) {
    writePrivate(resolve(parent, name), sourceBytes(`${FIXTURE}/${name}`));
  }
  function git(args, cwd = workspace) {
    const result = localProcess("git", ["-c", `core.hooksPath=${devNull}`, ...args], cwd, env);
    assert.equal(result.status, 0, "owned fixture Git preparation failed");
    return result.stdout.trim();
  }
  git(["init", "-q"]);
  git(["add", "--", ...inputFiles.map((file) => file.path)]);
  git(["-c", "user.name=ASK fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "public first-workflow seed"]);
  const seedCommit = git(["rev-parse", "HEAD"]);
  const steps = [];
  function setup(command, args = []) {
    const result = localProcess(process.execPath, [resolve(ROOT, "scripts/ask-setup.mjs"), command,
      "--target", workspace, ...args, "--json"], ROOT, env);
    writePrivate(resolve(evidence, `${steps.length + 1}-${command}.json`), result.stdout);
    assert.equal(result.status, 0, `existing setup ${command} failed; retain local evidence`);
    steps.push({ command: `ask-setup ${command}`, exit_status: result.status });
    return JSON.parse(result.stdout);
  }
  setup("inspect");
  const recommendation = setup("recommend", ["--adapter", "codex", "--purpose", "implementation"]);
  assert.equal(recommendation.profile, "implementation");
  const planPath = resolve(evidence, "install-plan.json");
  const plan = setup("plan", ["--adapter", "codex", "--profile", "implementation", "--output", planPath]);
  assert.equal(setup("check", ["--plan", planPath]).valid, true);
  assert.equal(setup("apply", ["--plan", planPath, "--dry-run"]).status, "validated");
  assert.equal(setup("apply", ["--plan", planPath]).status, "applied");
  const before = captureApplyTarget(workspace).binding;
  const doctor = setup("doctor");
  assert.deepEqual(captureApplyTarget(workspace).binding, before, "doctor must be read-only");
  assert.equal(doctor.setup_interpretation.installed.status, "pass");
  assert.equal(doctor.setup_interpretation.activated.status, "insufficient_evidence");
  assert.equal(doctor.setup_interpretation.operational.status, "insufficient_evidence");
  const baseline = localProcess(process.execPath, ["--test", "--test-reporter=tap", "test/rule-service.test.mjs"], workspace, env);
  writePrivate(resolve(evidence, "seed-test.log"), baseline.stdout + baseline.stderr);
  assert.equal(baseline.status, seed.baseline_expected.exit_status);
  assert.match(baseline.stdout, /Not implemented/u);
  for (const [field, count] of [["tests", 3], ["pass", 2], ["fail", 1]]) assert.match(baseline.stdout, new RegExp(`# ${field} ${count}(?:\\r?\\n|$)`, "u"));
  assert.deepEqual(captureApplyTarget(workspace).binding, before, "baseline must leave task and installation unchanged");
  for (const file of inputFiles) assert.equal(sha256(readFileSync(resolve(workspace, file.path))), file.sha256);
  // This worksheet remains outside the future task workspace, with no automatic upload.
  const record = JSON.parse(sourceBytes(`${FIXTURE}/acceptance-record-template.json`));
  record.preparation = {
    status: "prepared", fixture_id: seed.fixture_id, source_commit: git(["rev-parse", "HEAD"], ROOT),
    source_worktree_clean: git(["status", "--porcelain", "--untracked-files=normal"], ROOT) === "",
    host: { platform: process.platform, arch: process.arch, os_release: release(), node: process.version },
    workspace, local_records: evidence, seed_commit: seedCommit, input_files: inputFiles,
    profile: plan.selection.profile, steps, managed_identities: managedSetupIdentities(workspace),
    baseline: { command: seed.baseline_command, exit_status: baseline.status, tests: 3, passed: 2, failed: 1, log: "seed-test.log" },
    subprocess_boundary: "local Git, current Node ask-setup and public seed Node test only; no Codex/model/auth/sandbox launch",
    preparation_file_hashes: ["scripts/prepare-first-workflow.mjs", `${FIXTURE}/seed.json`, `${FIXTURE}/implementation-input-ja.md`,
      `${FIXTURE}/bypass-input-ja.md`, `${FIXTURE}/acceptance-record-template.json`].map((path) => ({ path, sha256: sha256(sourceBytes(path)) })),
  };
  record.installed = { ...doctor.setup_interpretation.installed, evidence_ref: "7-doctor.json", scope: "this owned artificial workspace at preparation time" };
  writePrivate(resolve(evidence, "acceptance-record.json"), json(record));
  return { parent, workspace, evidence, record };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.slice(2).length <= 1 && process.argv.slice(2).every((arg) => arg === "--json"), "only --json is accepted; no real target can be supplied");
    const prepared = prepareFirstWorkflow();
    console.log(process.argv.includes("--json") ? json(prepared)
      : `Prepared public engineering input: ${prepared.workspace}\nInputs: ${prepared.parent}\nPrivate records: ${prepared.evidence}\nInstalled=pass; Activated/Operational=insufficient_evidence. Seed tests intentionally fail (2 pass/1 fail); no agent task or bypass has run.`);
  } catch (error) {
    console.error(`First-workflow preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
