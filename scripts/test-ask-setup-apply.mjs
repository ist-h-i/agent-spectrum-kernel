#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSetupSourceIdentity, canonicalJson, copyTargetForSimulation, jsonDigest, sha256 } from "./ask-setup-inputs.mjs";
import {
  SetupApplyError, SETUP_INSTALLERS, assertNoSetupInProgress, assertSetupWritePaths,
  captureApplyTarget, captureApplyTree, managedSetupIdentities, overlayStagingResult,
  readApplyJson, resultBinding, setupChildEnvironment, setupInstallerInvocations,
} from "./ask-setup-apply-state.mjs";
import { applyAdoptionPlan, executeValidatedSetupApply } from "./ask-setup-apply.mjs";
import { skillAssets } from "./skill-assets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = [];
let checks = 0;
function temp() { const path = mkdtempSync(resolve(tmpdir(), "ask-apply-test-")); fixtures.push(path); return path; }
function put(root, path, contents) { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), contents); }
function equal(actual, expected, message) { checks += 1; assert.deepEqual(actual, expected, message); }
function rejects(fn, pattern) { checks += 1; assert.throws(fn, pattern); }
function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...setupChildEnvironment(), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function state(name, path, contents) {
  const definition = SETUP_INSTALLERS[name];
  return {
    schema_version: 3, installer: definition.installer, install_status: "installed",
    selected_profile: name === "kernel" ? "core" : "minimal", source: { git_revision: "a".repeat(40) },
    managed_files: { [path]: { sha256: sha256(contents), canonical_sha256: sha256(contents), kind: "fixture" } },
    managed_blocks: {}, managed_partial_files: {}, rollback: { files: { [path]: { content: null, sha256: null } }, blocks: {} },
  };
}
function installFixture(root, name, path, contents) {
  put(root, path, contents);
  put(root, SETUP_INSTALLERS[name].state, JSON.stringify(state(name, path, contents)) + "\n");
}
function phaseFixture() {
  const root = temp();
  put(root, "project.txt", "must survive\n");
  const before = captureApplyTarget(root);
  const stage = temp();
  put(stage, "project.txt", "must survive\n");
  const stageBefore = captureApplyTree(stage);
  const phases = [];
  const definitions = [["kernel", "AGENTS.md", "kernel\n"], ["codex", ".agents/prompt.md", "adapter\n"]];
  for (const [index, [name, path, text]] of definitions.entries()) {
    installFixture(stage, name, path, text);
    const entries = overlayStagingResult(before.entries, stageBefore, captureApplyTree(stage));
    phases.push({ phase: index === 0 ? "kernel" : "adapter", expected_target: resultBinding(before.binding.git, entries), managed_identities: managedSetupIdentities(stage) });
  }
  const originals = new Map(before.entries.map((entry) => [entry.path, entry]));
  const operations = captureApplyTree(stage).filter((entry) => entry.type === "file" && entry.sha256 !== originals.get(entry.path)?.sha256)
    .map((entry) => ({ action: "create", path: entry.path, ownership: entry.path.startsWith(".agent-spectrum-kernel/") ? "managed_state" : "managed_file", installer: "fixture", after_sha256: entry.sha256 }));
  const plan = {
    plan_digest: `sha256:${"1".repeat(64)}`, operations,
    assets: { status: "none_confirmed", exact_refs: [] }, portfolio: { status: "unselected", identity: null },
    recommendation: { capabilities: [] }, preservation: { project_owned_state: [] },
    application: { target_before: before.binding, write_paths: operations.map((operation) => operation.path), phases },
  };
  const invocations = setupInstallerInvocations("codex", "minimal", ["risk-gate"], root);
  const invoke = async (_, invocation) => {
    const [name, path, text] = definitions[invocation.phase === "kernel" ? 0 : 1];
    installFixture(root, name, path, text);
    return { failed: false, status: 0 };
  };
  return { root, plan, invocations, invoke, before };
}

export async function runSetupApplyUnitTests() {
  try {
    const root = temp();
    put(root, "plain.txt", "before\n");
    const first = captureApplyTarget(root);
    equal(captureApplyTarget(root).binding, first.binding, "stable target observation");
    put(root, "plain.txt", "after\n");
    equal(captureApplyTarget(root).binding.digest === first.binding.digest, false, "unmanaged content drift");
    put(root, "plain.txt", "before\n");
    equal(captureApplyTarget(root).binding, first.binding, "byte restoration restores ordinary content identity");
    chmodSync(resolve(root, "plain.txt"), 0o600);
    equal(captureApplyTarget(root).binding.digest === first.binding.digest, false, "mode drift");
    put(root, ".env", "TOP_SECRET_DO_NOT_EMIT=abc\n");
    const secret = captureApplyTarget(root);
    equal(JSON.stringify(secret).includes("TOP_SECRET"), false, "secret values are never emitted");
    equal(secret.entries.find((entry) => entry.path === ".env").type, "opaque");
    put(root, ".env", "TOP_SECRET_DO_NOT_EMIT=longer\n");
    equal(captureApplyTarget(root).binding.digest === secret.binding.digest, false, "secret metadata drift");
    const outside = temp();
    put(outside, "owned.txt", "outside\n");
    symlinkSync(resolve(outside, "owned.txt"), resolve(root, "link.txt"));
    equal(captureApplyTree(root).find((entry) => entry.path === "link.txt").type, "symlink", "unrelated symlink observed without following");
    rejects(() => assertSetupWritePaths(root, ["link.txt"]), /Symlink/);
    rejects(() => assertSetupWritePaths(root, ["../escape"]), /traversal|unsafe/);
    rejects(() => assertSetupWritePaths(root, ["/escape"]), /traversal|unsafe/);
    rejects(() => assertSetupWritePaths(root, ["a\\b"]), /traversal|unsafe/);
    symlinkSync("missing", resolve(root, "dangling"));
    rejects(() => assertSetupWritePaths(root, ["dangling/child"]), /Symlink/);
    linkSync(resolve(outside, "owned.txt"), resolve(root, "hardlink"));
    rejects(() => assertSetupWritePaths(root, ["hardlink"]), /hardlinked/);
    equal(readFileSync(resolve(outside, "owned.txt"), "utf8"), "outside\n");
    if (process.platform !== "win32") {
      const fifo = spawnSync("mkfifo", [resolve(root, "pipe")]);
      assert.equal(fifo.status, 0);
      equal(captureApplyTree(root).find((entry) => entry.path === "pipe").type, "special");
      rejects(() => assertSetupWritePaths(root, ["pipe"]), /Unsupported/);
      rejects(() => readApplyJson(resolve(root, "pipe")), /unsafe_json/);
    }
    put(root, "bad.json", '{"secret":"PRIVATE_TEXT');
    rejects(() => readApplyJson(resolve(root, "bad.json")), /^SetupApplyError: invalid_json_input$/);
    rejects(() => readApplyJson(resolve(root, "link.txt")), /unsafe_json/);
    put(root, SETUP_INSTALLERS.kernel.state + ".in-progress.json", "{}");
    rejects(() => assertNoSetupInProgress(root), /recovery_required/);

    const repo = temp();
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.name", "Fixture"]);
    git(repo, ["config", "user.email", "fixture@example.invalid"]);
    put(repo, "file.txt", "v1\n");
    git(repo, ["add", "file.txt"]);
    git(repo, ["commit", "-qm", "initial"]);
    const committed = captureApplyTarget(repo);
    git(repo, ["commit", "--allow-empty", "-qm", "new head same tree"]);
    const nextHead = captureApplyTarget(repo);
    equal(committed.binding.git.head_digest === nextHead.binding.git.head_digest, false, "HEAD change with same tree detected");
    put(repo, "file.txt", "v2\n");
    const unstaged = captureApplyTarget(repo);
    git(repo, ["add", "file.txt"]);
    const staged = captureApplyTarget(repo);
    equal(unstaged.binding.worktree_digest, staged.binding.worktree_digest);
    equal(unstaged.binding.git.index_digest === staged.binding.git.index_digest, false, "index-only staged state drift");
    rmSync(resolve(repo, ".git/index"));
    symlinkSync(resolve(outside, "owned.txt"), resolve(repo, ".git/index"));
    rejects(() => captureApplyTarget(repo), /Symlink/);

    const source = temp();
    const sourceFiles = [
      "manifest.json", "scripts/install-kernel.mjs", "scripts/install-codex-adapter.mjs",
      "scripts/install-claude-adapter.mjs", "scripts/installer-lifecycle.mjs", "scripts/ask-doctor.mjs",
      "scripts/ask-setup.mjs", "scripts/ask-setup-inputs.mjs", "schemas/adoption-plan.schema.json",
      "schemas/adoption-apply-result.schema.json", "docs/fixtures/adapter-runtime-profiles.json",
      "AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "schemas/review-signal-gate-map.json",
      "skills/example/SKILL.md", "skills/example/references/nested/example.md",
    ];
    for (const path of sourceFiles) put(source, path, path.endsWith(".json") ? "{}\n" : "canonical\n");
    const sourceOptions = { selectedSkills: ["example"], coreAssets: [], revision: "a".repeat(40) };
    const sourceIdentity = () => buildSetupSourceIdentity(source, sourceOptions);
    const pinnedSource = sourceIdentity();
    const reference = "skills/example/references/nested/example.md";
    equal(pinnedSource.files.some((entry) => entry.path === reference), true, "kernel-only binds reference bytes without a renderer inventory");
    put(source, reference, "changed canonical reference\n");
    equal(sourceIdentity().identity_digest === pinnedSource.identity_digest, false, "reference content drift");
    put(source, reference, "canonical\n");
    equal(sourceIdentity().identity_digest, pinnedSource.identity_digest);
    put(source, "skills/example/references/new.md", "new reference\n");
    equal(sourceIdentity().identity_digest === pinnedSource.identity_digest, false, "reference addition");
    rmSync(resolve(source, "skills/example/references/new.md"));
    equal(sourceIdentity().identity_digest, pinnedSource.identity_digest, "removed new reference restores inventory");
    const targetWithReference = temp();
    put(targetWithReference, reference, "project owned reference\n");
    const selectedPaths = skillAssets(source, ["example"]).map((asset) => asset.sourcePath);
    const copy = resolve(temp(), "staging");
    const beforeCopy = captureApplyTarget(targetWithReference).binding;
    copyTargetForSimulation(targetWithReference, copy, selectedPaths);
    equal(readFileSync(resolve(copy, reference), "utf8"), "project owned reference\n", "staging must expose unmanaged canonical reference conflicts to the installer");
    equal(captureApplyTarget(targetWithReference).binding, beforeCopy, "reference simulation is target-read-only");
    rmSync(resolve(targetWithReference, reference));
    symlinkSync(resolve(outside, "owned.txt"), resolve(targetWithReference, reference));
    const rejectedCopy = resolve(temp(), "staging");
    rejects(() => copyTargetForSimulation(targetWithReference, rejectedCopy, selectedPaths), /Symlink/);
    equal(existsSync(rejectedCopy), false, "reject reference symlink before staging");
    rmSync(resolve(source, reference));
    symlinkSync(resolve(outside, "owned.txt"), resolve(source, reference));
    rejects(sourceIdentity, /symlinks/);

    const savedEnvironment = { NODE_OPTIONS: process.env.NODE_OPTIONS, GIT_TRACE: process.env.GIT_TRACE, SECRET_TOKEN: process.env.SECRET_TOKEN };
    Object.assign(process.env, { NODE_OPTIONS: "--import ./evil.mjs", GIT_TRACE: "secret-file", SECRET_TOKEN: "PRIVATE" });
    try {
      const env = setupChildEnvironment();
      equal(Object.hasOwn(env, "NODE_OPTIONS"), false);
      equal(Object.hasOwn(env, "GIT_TRACE"), false);
      equal(Object.hasOwn(env, "SECRET_TOKEN"), false);
    } finally {
      for (const [key, value] of Object.entries(savedEnvironment)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    for (const adapter of ["codex", "claude-code", "kernel-only"]) {
      const commands = setupInstallerInvocations(adapter, adapter === "kernel-only" ? "kernel-only" : "minimal", ["risk-gate"], "/target");
      equal(commands.length, adapter === "kernel-only" ? 1 : 2);
      equal(commands.some((entry) => entry.args.includes("--force")), false);
    }
    rejects(() => setupInstallerInvocations("plugin", "full", ["risk-gate"], "/target"), /unsupported_adapter/);
    rejects(() => setupInstallerInvocations("codex", "../profile", ["risk-gate"], "/target"), /unsupported_profile/);
    rejects(() => setupInstallerInvocations("codex", "minimal", ["../skill"], "/target"), /invalid_skill/);
    const unauthorized = await applyAdoptionPlan(null, { target: root });
    equal(unauthorized.reason, "authorization_required");
    equal(unauthorized.mutation_attempted, false);

    for (const scenario of ["success", "no_authorization", "before_source_drift", "before_target_drift", "first_failure_no_write", "partial_first", "second_failure", "throw_after_write", "unexpected_write", "observation_failure", "source_drift_after_write", "final_target_drift", "final_pending_marker"]) {
      const fixture = phaseFixture();
      let calls = 0;
      let sourceCalls = 0;
      let observationCalls = 0;
      const verifySource = async () => {
        sourceCalls += 1;
        if (scenario === "final_pending_marker" && sourceCalls === 4) {
          put(fixture.root, SETUP_INSTALLERS.codex.state + ".in-progress.json", "{}");
        }
        if (scenario === "before_source_drift" || scenario === "source_drift_after_write" && sourceCalls > 1) throw new SetupApplyError("source_drift");
      };
      if (scenario === "before_target_drift") put(fixture.root, "project.txt", "changed\n");
      const result = await executeValidatedSetupApply({
        plan: fixture.plan, target: fixture.root, sourceRoot: ROOT, invocations: fixture.invocations,
        authorized: scenario !== "no_authorization", verifySource,
        invoke: async (...args) => {
          calls += 1;
          if (scenario === "first_failure_no_write" || scenario === "second_failure" && calls === 2) return { failed: true, status: 1 };
          if (scenario === "partial_first") {
            put(fixture.root, "AGENTS.md", "kernel\n");
            put(fixture.root, SETUP_INSTALLERS.kernel.state + ".in-progress.json", JSON.stringify({ pending_state: state("kernel", "AGENTS.md", "kernel\n") }));
            return { failed: true, status: 1 };
          }
          const outcome = await fixture.invoke(...args);
          if (scenario === "throw_after_write") throw new Error("PRIVATE subprocess output");
          if (scenario === "unexpected_write") put(fixture.root, "unplanned-private-name.txt", "PRIVATE\n");
          return outcome;
        },
        observe: (path) => {
          observationCalls += 1;
          if (scenario === "final_target_drift" && observationCalls === 5) put(path, ".agents/prompt.md", "PRIVATE later edit\n");
          if (scenario === "observation_failure" && calls > 0) throw new Error("PRIVATE observation");
          return captureApplyTarget(path);
        },
      });
      equal(JSON.stringify(result).includes("PRIVATE"), false, scenario + " redacts exception content");
      equal(JSON.stringify(result).includes("unplanned-private-name"), false, scenario + " redacts unrelated paths");
      equal(result.readiness.operational, "insufficient_evidence");
      equal(result.readiness.activated, "insufficient_evidence");
      const { result_digest, ...payload } = result;
      equal(result_digest, jsonDigest(payload), "sealed machine result");
      if (scenario === "success") {
        equal(result.status, "applied"); equal(calls, 2); equal(result.applied_operations.length, fixture.plan.operations.length);
        equal(result.recovery_required, false); equal(result.resulting_managed_identities, fixture.plan.application.phases.at(-1).managed_identities);
      } else if (["no_authorization", "before_source_drift", "before_target_drift"].includes(scenario)) {
        equal(result.status, "blocked"); equal(calls, 0); equal(result.mutation_attempted, false);
      } else if (scenario === "first_failure_no_write") {
        equal(result.status, "failed"); equal(result.repository_changed, false); equal(result.recovery_required, false);
      } else {
        equal(result.status, "partial", scenario); equal(result.recovery_required, true, scenario); equal(calls <= 2, true);
        if (scenario === "second_failure") equal(result.applied_operations.length > 0 && result.not_applied_operations.length > 0, true);
        if (scenario === "partial_first") equal(result.recovery[0].in_progress, true);
        if (scenario === "observation_failure") equal(result.observation, "unavailable");
        if (scenario === "final_target_drift") {
          equal(result.observation, "complete");
          equal(result.reason, "final_target_mismatch");
          equal(result.blocked_operations.some((entry) => entry.path === ".agents/prompt.md"), true);
        }
        if (scenario === "final_pending_marker") equal(result.recovery[0].in_progress, true);
      }
      equal(readFileSync(resolve(fixture.root, "project.txt"), "utf8"), scenario === "before_target_drift" ? "changed\n" : "must survive\n");
    }
    console.log(`ASK apply boundary/failure tests passed (${checks} assertions).`);
    return checks;
  } finally {
    for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runSetupApplyUnitTests();
