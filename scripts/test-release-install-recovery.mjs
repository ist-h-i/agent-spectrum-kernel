#!/usr/bin/env node
// Model-free CLI smoke. Targets are always owned disposable fixtures.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { devNull, release, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureApplyTarget, managedSetupIdentities, setupChildEnvironment } from "./ask-setup-apply-state.mjs";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
assert.ok(process.argv.slice(2).every((arg) => arg === "--json"), "only --json is accepted; no real target can be supplied");
const parent = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-release-recovery-")));
const steps = [];
const env = { ...setupChildEnvironment(), GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1" };
const projectRules = "# Project rules\n\nKeep project-owned policy.\n";
const projectCode = "export const fixture = true;\n";

function run(script, args, { expected = 0, json = false } = {}) {
  assert.ok(["ask-setup.mjs", "install-codex-adapter.mjs", "install-kernel.mjs"].includes(script));
  const result = spawnSync(process.execPath, [resolve(ROOT, "scripts", script), ...args], {
    cwd: ROOT, env, encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024, shell: false,
  });
  assert.equal(result.error, undefined, "local CLI must complete without spawn/timeout error");
  assert.equal(result.status, expected, `${script} unexpected exit: ${result.stderr}`);
  const command = `node scripts/${script} ${args.map((arg) => arg.startsWith(parent) ? "<fixture-path>" : arg).join(" ")}`;
  steps.push({ command, exit_status: result.status });
  return json ? JSON.parse(result.stdout) : result;
}
function setup(target, command, args = [], options = {}) {
  return run("ask-setup.mjs", [command, "--target", target, ...args, "--json"], { json: true, ...options });
}
function binding(target) { return captureApplyTarget(target).binding; }
function managedSurfaces(target) {
  return managedSetupIdentities(target).map(({ identity_digest, files, ...identity }) => ({
    ...identity,
    files: files.map((file) => {
      if (file.ownership !== "managed_block") return file;
      // Shared AGENTS.md has project-owned bytes outside the managed block.
      const text = readFileSync(resolve(target, file.path), "utf8");
      const start = text.indexOf("<!-- agent-spectrum-kernel:start -->");
      const endMarker = "<!-- agent-spectrum-kernel:end -->";
      const end = text.indexOf(endMarker, start);
      assert.ok(start >= 0 && end >= start);
      const actual_sha256 = createHash("sha256").update(text.slice(start, end + endMarker.length)).digest("hex");
      assert.equal(actual_sha256, file.managed_sha256, "managed block must match its recorded hash");
      return { ...file, actual_sha256 };
    }),
  }));
}
function unchanged(target, before) { assert.deepEqual(binding(target), before, "read-only/refused command changed fixture"); }
function fixture(name) {
  const target = resolve(parent, name);
  mkdirSync(resolve(target, "src"), { recursive: true });
  writeFileSync(resolve(target, "AGENTS.md"), projectRules);
  writeFileSync(resolve(target, "README.md"), "# Disposable ASK fixture\n");
  writeFileSync(resolve(target, "src/example.js"), projectCode);
  for (const args of [["init", "-q"], ["add", "AGENTS.md", "README.md", "src/example.js"],
    ["-c", "user.name=ASK fixture", "-c", "user.email=fixture@example.invalid", "-c", `core.hooksPath=${devNull}`, "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]]) {
    const result = spawnSync("git", ["-C", target, ...args], { env, encoding: "utf8", timeout: 30000, shell: false });
    assert.equal(result.status, 0, result.stderr);
  }
  return target;
}
function preserved(target) {
  assert.equal(readFileSync(resolve(target, "src/example.js"), "utf8"), projectCode);
  assert.equal(readFileSync(resolve(target, "README.md"), "utf8"), "# Disposable ASK fixture\n");
  assert.ok(readFileSync(resolve(target, "AGENTS.md"), "utf8").startsWith(projectRules));
}
function plan(target, name, profile) {
  const before = binding(target);
  const path = resolve(parent, `${name}.json`);
  const result = setup(target, "plan", ["--adapter", "codex", "--profile", profile, "--output", path]);
  assert.equal(result.selection.profile, profile);
  assert.equal(result.portfolio.status, "unselected");
  unchanged(target, before);
  assert.equal(setup(target, "check", ["--plan", path]).valid, true);
  unchanged(target, before);
  assert.equal(setup(target, "apply", ["--plan", path, "--dry-run"]).status, "validated");
  unchanged(target, before);
  const applied = setup(target, "apply", ["--plan", path]);
  assert.equal(applied.status, "applied");
  assert.equal(applied.readiness.installed, "installed");
  assert.equal(applied.readiness.activated, "insufficient_evidence");
  assert.equal(applied.readiness.operational, "insufficient_evidence");
  preserved(target);
  return path;
}
function doctor(target) {
  const before = binding(target);
  const result = setup(target, "doctor");
  assert.equal(result.setup_interpretation.installed.status, "pass");
  assert.equal(result.setup_interpretation.activated.status, "insufficient_evidence");
  assert.equal(result.setup_interpretation.operational.status, "insufficient_evidence");
  unchanged(target, before);
  return result.setup_interpretation;
}
function recover(target, action) {
  for (const script of ["install-codex-adapter.mjs", "install-kernel.mjs"]) {
    const before = binding(target);
    run(script, ["--target", target, `--${action}`, "--dry-run"]);
    unchanged(target, before);
    run(script, ["--target", target, `--${action}`]);
    preserved(target);
  }
}
function retainedRemovedSkill(target) {
  const statePath = resolve(target, ".agent-spectrum-kernel/install-state.json");
  const originalState = readFileSync(statePath);
  const state = JSON.parse(originalState);
  const skill = "removed-release-fixture";
  const managedPath = `skills/${skill}/SKILL.md`;
  const destination = resolve(target, managedPath);
  const content = "# Retained fixture Skill\n";
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
  state.managed_files[managedPath] = { kind: "stale_skill", skill, sha256: createHash("sha256").update(content).digest("hex") };
  state.retained_stale_skills = [...(state.retained_stale_skills ?? []), skill];
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const retained = binding(target);
  const warning = setup(target, "doctor");
  assert.equal(warning.status, "warn");
  assert.ok(warning.warnings.some((text) => text.includes("retained stale managed skill")));
  assert.ok(warning.warnings.some((text) => text.includes("managed source asset could not be verified")));
  unchanged(target, retained);
  writeFileSync(destination, `${content}fixture drift\n`);
  const drifted = binding(target);
  const failure = setup(target, "doctor", [], { expected: 1 });
  assert.equal(failure.setup_interpretation.installed.status, "fail");
  assert.ok(failure.failures.some((text) => text.includes(`managed file hash mismatch: ${managedPath}`)));
  unchanged(target, drifted);
  writeFileSync(statePath, originalState);
  rmSync(dirname(destination), { recursive: true });
}

try {
  const target = fixture("update-and-detach");
  const before = binding(target);
  assert.deepEqual(setup(target, "inspect").ask.active_adapters, []);
  const recommendation = setup(target, "recommend", ["--adapter", "codex", "--purpose", "implementation"]);
  assert.equal(recommendation.profile, "implementation");
  assert.equal(recommendation.basis.effectiveness_proven, false);
  unchanged(target, before);
  const firstPlan = plan(target, "install-minimal", "minimal");
  const initialManaged = managedSurfaces(target);
  const afterInstall = binding(target);
  assert.equal(setup(target, "apply", ["--plan", firstPlan]).status, "already_applied");
  unchanged(target, afterInstall);
  const deployment = doctor(target);
  plan(target, "update-implementation", "implementation");
  doctor(target);
  assert.equal(managedSetupIdentities(target).find((item) => item.installer === "agent-spectrum-codex-adapter").profile, "implementation");
  recover(target, "rollback");
  assert.deepEqual(managedSurfaces(target), initialManaged, "rollback must restore prior managed profile and hashes");
  doctor(target);
  retainedRemovedSkill(target);

  const managedSkill = resolve(target, ".agents/skills/test-first-verification/SKILL.md");
  const managedBytes = readFileSync(managedSkill);
  writeFileSync(managedSkill, Buffer.concat([managedBytes, Buffer.from("\nfixture drift\n")]));
  const drifted = binding(target);
  const driftDoctor = setup(target, "doctor", [], { expected: 1 });
  assert.equal(driftDoctor.setup_interpretation.installed.status, "fail");
  unchanged(target, drifted);
  run("ask-setup.mjs", ["plan", "--target", target, "--adapter", "codex", "--profile", "minimal", "--json"], { expected: 1 });
  unchanged(target, drifted);
  run("install-codex-adapter.mjs", ["--target", target, "--detach", "--dry-run"], { expected: 1 });
  unchanged(target, drifted);
  writeFileSync(managedSkill, managedBytes); // Restore only our artificial drift.
  recover(target, "detach");
  assert.ok(managedSetupIdentities(target).every((item) => item.install_status === "detached"));
  assert.equal(readFileSync(resolve(target, "AGENTS.md"), "utf8").trimEnd(), projectRules.trimEnd());

  const fresh = fixture("fresh-rollback");
  plan(fresh, "fresh-install", "minimal");
  recover(fresh, "rollback");
  assert.deepEqual(managedSetupIdentities(fresh), [], "fresh rollback removes install state");
  assert.equal(readFileSync(resolve(fresh, "AGENTS.md"), "utf8").trimEnd(), projectRules.trimEnd());

  const report = {
    source_boundary: "current local checkout; bind its revision and file hashes before citing this run",
    host: { platform: process.platform, arch: process.arch, os_release: release(), node: process.version },
    adapter: "codex", profiles: ["minimal", "implementation"], result: "passed", steps,
    deployment, scenarios: ["clean_install", "read_only_checks", "exact_reapply", "same_source_profile_update",
      "update_rollback", "retained_removed_skill", "drift_refusal", "detach", "fresh_install_rollback", "project_owned_preservation"],
    limits: ["Disposable synthetic Git repositories only; existing local Node installers and doctor.",
      "No Codex CLI, sandbox/model/provider launch, credentials, global setup, or real project apply.",
      "No first engineering workflow, activation, operational readiness, cross-version upgrade, or product value proof.",
      "Rollback/detach cover managed surfaces; initialize-once project state and empty directories may remain."],
  };
  console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2)
    : `Release install/recovery smoke passed: ${report.scenarios.length} scenarios, ${steps.length} CLI executions (${process.platform}/${process.arch}, ${process.version}). Installed=pass; Activated/Operational=insufficient_evidence.`);
} finally {
  rmSync(parent, { recursive: true, force: true });
}
