#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAdoptionPlan, planDigestPayload, verifySavedPlan } from "./ask-setup.mjs";
import { jsonDigest } from "./ask-setup-inputs.mjs";
import { skillAssets } from "./skill-assets.mjs";
import { applyAdoptionPlan } from "./ask-setup-apply.mjs";
import { captureApplyTarget, managedSetupIdentities, setupChildEnvironment } from "./ask-setup-apply-state.mjs";
import { validateJsonSchema } from "./json-schema-validation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(args, expected = 0) {
  const result = spawnSync(process.execPath, [resolve(ROOT, "scripts/ask-setup.mjs"), ...args, "--json"], {
    cwd: ROOT, env: setupChildEnvironment(), encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, expected, `CLI failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}
function schema(result) {
  assert.deepEqual(validateJsonSchema(result, { schemaPath: resolve(ROOT, "schemas/adoption-apply-result.schema.json") }), []);
}
function put(root, path, contents) { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), contents); }

function git(target, args) {
  const result = spawnSync("git", ["-C", target, ...args], {
    env: { ...setupChildEnvironment(), GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull, GIT_CONFIG_NOSYSTEM: "1" },
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
}

export async function runSetupApplyIntegrationTests() {
  // Unlike the older standalone read-only suite, this test must never silently
  // replace actual installer execution with a partial-checkout simulation.
  assert.ok(existsSync(resolve(ROOT, "manifest.json")), "actual installer integration requires a complete ASK checkout");
  const parent = mkdtempSync(resolve(tmpdir(), "ask-apply-cli-"));
  let scenarios = 0;
  try {
    for (const [adapter, profile] of [["kernel-only", "kernel-only"], ["codex", "minimal"], ["claude-code", "implementation"]]) {
      const target = resolve(parent, adapter);
      mkdirSync(target);
      put(target, "AGENTS.md", "# Project rules\n\nKeep project policy.\n");
      put(target, "src/app.js", "export const project = true;\n");
      put(target, ".env", "SECRET_SETUP_SENTINEL=do-not-output\n");
      if (adapter === "claude-code") put(target, ".claude/settings.json", JSON.stringify({ permissions: { deny: ["Read(.env)"] }, env: { PROJECT_SENTINEL: "SECRET_SETUP_SENTINEL" } }));
      // Bind a real committed repository, not only a non-Git directory.
      git(target, ["init", "-q"]);
      git(target, ["config", "user.name", "ASK setup fixture"]);
      git(target, ["config", "user.email", "fixture@example.invalid"]);
      git(target, ["add", "AGENTS.md", "src/app.js"]);
      git(target, ["commit", "-qm", "fixture"]);
      const before = captureApplyTarget(target).binding;
      const plan = await createAdoptionPlan({ target, adapter, profile });
      assert.equal(plan.schema_version, "1.1.0");
      assert.deepEqual(validateJsonSchema(plan, { schemaPath: resolve(ROOT, "schemas/adoption-plan.schema.json") }), []);
      assert.deepEqual(captureApplyTarget(target).binding, before);
      assert.equal(JSON.stringify(plan).includes("SECRET_SETUP_SENTINEL"), false);
      const savedPath = resolve(parent, `${adapter}.json`);
      writeFileSync(savedPath, JSON.stringify(plan));
      assert.equal((await verifySavedPlan(plan, { target })).valid, true);
      const unauthorized = await applyAdoptionPlan(plan, { target });
      schema(unauthorized);
      assert.equal(unauthorized.reason, "authorization_required");
      assert.deepEqual(captureApplyTarget(target).binding, before);
      const dry = run(["apply", "--target", target, "--plan", savedPath, "--dry-run"]);
      schema(dry);
      assert.equal(dry.status, "validated");
      assert.equal(dry.mutation_attempted, false);
      assert.deepEqual(captureApplyTarget(target).binding, before);
      const applied = run(["apply", "--target", target, "--plan", savedPath]);
      schema(applied);
      assert.equal(applied.status, "applied");
      assert.equal(applied.readiness.installed, "installed");
      assert.equal(applied.readiness.operational, "insufficient_evidence");
      assert.equal(applied.readiness.activated, "insufficient_evidence");
      assert.deepEqual(applied.resulting_managed_identities, plan.application.phases.at(-1).managed_identities);
      assert.deepEqual(managedSetupIdentities(target), applied.resulting_managed_identities);
      assert.equal(JSON.stringify(applied).includes("SECRET_SETUP_SENTINEL"), false);
      assert.equal(readFileSync(resolve(target, "src/app.js"), "utf8"), "export const project = true;\n");
      assert.match(readFileSync(resolve(target, "AGENTS.md"), "utf8"), /Keep project policy/);
      if (adapter === "claude-code") {
        const settings = JSON.parse(readFileSync(resolve(target, ".claude/settings.json"), "utf8"));
        assert.deepEqual(settings.permissions.deny, ["Read(.env)"]);
        assert.equal(settings.env.PROJECT_SENTINEL, "SECRET_SETUP_SENTINEL");
      }
      const after = captureApplyTarget(target).binding;
      const again = run(["apply", "--target", target, "--plan", savedPath]);
      schema(again);
      assert.equal(again.status, "already_applied");
      assert.equal(again.mutation_attempted, false);
      assert.deepEqual(captureApplyTarget(target).binding, after);
      const deterministicAgain = run(["apply", "--target", target, "--plan", savedPath]);
      assert.deepEqual(deterministicAgain, again, "repeat no-op result is deterministic");
      const managed = applied.resulting_managed_identities.flatMap((entry) => entry.files)
        .find((entry) => entry.ownership === "managed_file");
      assert.ok(managed, "fixture must include an actual managed file");
      const managedPath = resolve(target, managed.path);
      const originalManaged = readFileSync(managedPath);
      writeFileSync(managedPath, Buffer.concat([originalManaged, Buffer.from("\nlocal managed change\n")]));
      const managedDrift = captureApplyTarget(target).binding;
      const managedDenied = run(["apply", "--target", target, "--plan", savedPath], 1);
      assert.equal(managedDenied.status, "blocked");
      assert.equal(managedDenied.mutation_attempted, false);
      assert.deepEqual(captureApplyTarget(target).binding, managedDrift);
      writeFileSync(managedPath, originalManaged);
      assert.deepEqual(captureApplyTarget(target).binding, after);
      // Exact repeat is not permission to repair later local changes.
      put(target, "src/app.js", "local change after apply\n");
      const drifted = captureApplyTarget(target).binding;
      const stale = run(["apply", "--target", target, "--plan", savedPath], 1);
      schema(stale);
      assert.equal(stale.status, "blocked");
      assert.equal(stale.mutation_attempted, false);
      assert.deepEqual(captureApplyTarget(target).binding, drifted);
      scenarios += 1;
    }

    const target = resolve(parent, "negative"); mkdirSync(target);
    put(target, "AGENTS.md", "Project owned\n");
    const plan = await createAdoptionPlan({ target, adapter: "codex", profile: "minimal" });
    const original = captureApplyTarget(target).binding;
    for (const mutation of [
      (value) => { value.plan_digest = `sha256:${"a".repeat(64)}`; },
      (value) => { value.selection.profile = "not-a-profile"; },
      (value) => { value.application.write_paths.push("../escape"); },
      (value) => { value.source.identity_digest = `sha256:${"a".repeat(64)}`; },
      (value) => { value.application.phases[0].expected_target.digest = `sha256:${"b".repeat(64)}`; },
      (value) => { value.assets.exact_refs.push({ stable_id: "invented" }); },
    ]) {
      const changed = structuredClone(plan); mutation(changed);
      // A self-consistent attacker-supplied digest is not authority. Verify
      // semantic/schema rejection too, rather than only the old digest mismatch.
      if (changed.plan_digest === plan.plan_digest) changed.plan_digest = jsonDigest(planDigestPayload(changed));
      const result = await applyAdoptionPlan(changed, { target, authorized: true });
      assert.equal(result.status, "blocked");
      assert.deepEqual(captureApplyTarget(target).binding, original);
      scenarios += 1;
    }
    const gitTarget = resolve(parent, "head-drift"); mkdirSync(gitTarget);
    put(gitTarget, "AGENTS.md", "Project owned\n");
    git(gitTarget, ["init", "-q"]);
    git(gitTarget, ["config", "user.name", "ASK setup fixture"]);
    git(gitTarget, ["config", "user.email", "fixture@example.invalid"]);
    git(gitTarget, ["add", "AGENTS.md"]);
    git(gitTarget, ["commit", "-qm", "fixture"]);
    const gitPlan = await createAdoptionPlan({ target: gitTarget, adapter: "codex", profile: "minimal" });
    git(gitTarget, ["commit", "--allow-empty", "-qm", "same tree new HEAD"]);
    const newHead = captureApplyTarget(gitTarget).binding;
    const headDenied = await applyAdoptionPlan(gitPlan, { target: gitTarget, authorized: true });
    assert.equal(headDenied.status, "blocked");
    assert.equal(headDenied.mutation_attempted, false);
    assert.deepEqual(captureApplyTarget(gitTarget).binding, newHead);
    scenarios += 1;

    const conflictTarget = resolve(parent, "reference-conflict"); mkdirSync(conflictTarget);
    const selected = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8")).skills;
    const referenceAsset = skillAssets(ROOT, selected).find((asset) => asset.relativePath.startsWith("references/"));
    assert.ok(referenceAsset, "current canonical Skill inventory must include a reference");
    put(conflictTarget, referenceAsset.sourcePath, "project-owned reference must survive\n");
    const conflictBefore = captureApplyTarget(conflictTarget).binding;
    await assert.rejects(() => createAdoptionPlan({ target: conflictTarget, adapter: "kernel-only", profile: "kernel-only" }));
    assert.deepEqual(captureApplyTarget(conflictTarget).binding, conflictBefore);
    scenarios += 1;

    const referencePath = resolve(parent, "portfolio.json");
    writeFileSync(referencePath, JSON.stringify({ portfolio_id: "unverified", lock_digest: `sha256:${"a".repeat(64)}` }));
    const referenced = await createAdoptionPlan({ target, adapter: "codex", profile: "minimal", portfolioPath: referencePath });
    const denied = await applyAdoptionPlan(referenced, { target, authorized: true });
    assert.equal(denied.reason, "portfolio_authority_unverified");
    assert.deepEqual(captureApplyTarget(target).binding, original);
    const outside = resolve(parent, "outside.md"); writeFileSync(outside, "outside\n");
    rmSync(resolve(target, "AGENTS.md")); symlinkSync(outside, resolve(target, "AGENTS.md"));
    const linkResult = await applyAdoptionPlan(plan, { target, authorized: true });
    assert.equal(linkResult.status, "blocked");
    assert.equal(readFileSync(outside, "utf8"), "outside\n");
    scenarios += 2;
    console.log(`ASK apply actual installer CLI integration passed (${scenarios} scenarios; kernel/Codex/Claude, no skip).`);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runSetupApplyIntegrationTests();
