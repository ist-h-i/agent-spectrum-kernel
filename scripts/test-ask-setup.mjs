#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  canonicalJson,
  createAdoptionPlan,
  inspectRepository,
  recommendFromFacts,
  snapshotTarget,
  verifySavedPlan,
} from "./ask-setup.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASK_SETUP = resolve(REPO_ROOT, "scripts/ask-setup.mjs");
const HAS_FULL_SOURCE = existsSync(resolve(REPO_ROOT, "manifest.json"))
  && existsSync(resolve(REPO_ROOT, "scripts/install-kernel.mjs"))
  && existsSync(resolve(REPO_ROOT, "scripts/install-codex-adapter.mjs"));

function tempDir(prefix) {
  return mkdtempSync(resolve(tmpdir(), prefix));
}

function runNode(script, args, { expected = [0] } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!expected.includes(result.status)) {
    throw new Error(`${script} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

function snapshotDigest(target) {
  return snapshotTarget(target).digest;
}

async function unitTests() {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');

  const target = tempDir("ask-setup-unit-");
  try {
    writeFileSync(resolve(target, "AGENTS.md"), "project rules\n");
    const first = snapshotTarget(target);
    writeFileSync(resolve(target, "AGENTS.md"), "project rules changed\n");
    const second = snapshotTarget(target);
    assert.notEqual(first.digest, second.digest, "setup-relevant content changes must change the target snapshot");

    mkdirSync(resolve(target, "scripts"), { recursive: true });
    writeFileSync(resolve(target, "scripts/.env"), "SECRET=first\n");
    const secretFirst = snapshotTarget(target);
    writeFileSync(resolve(target, "scripts/.env"), "SECRET=second\n");
    const secretSecond = snapshotTarget(target);
    assert.equal(secretFirst.digest, secretSecond.digest, "secret content must be omitted from the setup snapshot");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }

  const baseInspection = {
    ask: {
      active_adapters: [],
      codex: { selected_profile: null },
      claude: { selected_profile: null },
    },
    profiles: {
      codex: [{ profile: "implementation" }, { profile: "full" }],
      "claude-code": [{ profile: "daily" }, { profile: "organizational" }],
      "kernel-only": [{ profile: "kernel-only" }],
    },
  };
  const undecided = recommendFromFacts({ inspection: baseInspection });
  assert.equal(undecided.adapter, null);
  assert.ok(undecided.human_decisions.some((entry) => entry.id === "adapter"));

  const codex = recommendFromFacts({ inspection: baseInspection, adapter: "codex", purpose: "implementation" });
  assert.equal(codex.profile, "implementation");
  assert.equal(codex.basis.effectiveness_proven, false);

  const unavailable = recommendFromFacts({ inspection: baseInspection, adapter: "claude-code", purpose: "adoption" });
  assert.equal(unavailable.profile, null, "missing profile must not silently fall back to a broader profile");
  assert.ok(unavailable.human_decisions.some((entry) => entry.id === "profile_unavailable"));

  const highRiskFull = recommendFromFacts({ inspection: baseInspection, adapter: "codex", profile: "full", risk: "high" });
  assert.equal(highRiskFull.profile, null, "full must not be selected implicitly for high-risk work");
  assert.ok(highRiskFull.human_decisions.some((entry) => entry.id === "high_risk_full_profile"));
}

async function integrationTests() {
  if (!HAS_FULL_SOURCE) {
    console.log("SKIP integration: full ASK repository source is not available in this checkout");
    return;
  }

  const target = tempDir("ask-setup-integration-");
  const outputRoot = tempDir("ask-setup-output-");
  try {
    writeFileSync(resolve(target, "AGENTS.md"), "# Project-owned instructions\n\nKeep this text.\n");
    writeFileSync(resolve(target, "README.md"), "# Sample target\n");
    const before = snapshotDigest(target);

    const first = await createAdoptionPlan({ target, adapter: "codex", profile: "minimal" });
    assert.equal(snapshotDigest(target), before, "plan generation must not change the target repository");
    assert.equal(first.selection.adapter, "codex");
    assert.equal(first.selection.profile, "minimal");
    assert.equal(first.portfolio.status, "unselected");
    assert.equal(first.readiness.installed, "planned_not_applied");
    assert.equal(first.readiness.activated, "insufficient_evidence");
    assert.equal(first.readiness.operational, "insufficient_evidence");
    assert.ok(first.operations.length > 0);
    assert.ok(first.verification.planning_phases.every((phase) => phase.exit_status === 0 && phase.dry_run_exit_status === 0));
    assert.ok(first.verification.planning_phases.every((phase) => /^sha256:[a-f0-9]{64}$/.test(phase.dry_run_output_digest)));
    assert.ok(first.preservation.project_owned_state.some((entry) => entry.path === "AGENTS.md"));
    const { validateJsonSchema } = await import("./json-schema-validation.mjs");
    const schemaErrors = validateJsonSchema(first, { schemaPath: resolve(REPO_ROOT, "schemas/adoption-plan.schema.json") });
    assert.deepEqual(schemaErrors, [], `adoption plan schema errors: ${schemaErrors.join(" | ")}`);

    const second = await createAdoptionPlan({ target, adapter: "codex", profile: "minimal" });
    assert.equal(second.plan_digest, first.plan_digest, "same source and target state must yield the same semantic plan digest");
    assert.equal(canonicalJson(second.operations), canonicalJson(first.operations));

    const planPath = resolve(outputRoot, "plan.json");
    const cliPlan = runNode(ASK_SETUP, ["plan", "--target", target, "--adapter", "codex", "--profile", "minimal", "--output", planPath, "--json"]);
    const saved = JSON.parse(readFileSync(planPath, "utf8"));
    const printed = JSON.parse(cliPlan.stdout);
    assert.equal(saved.plan_digest, printed.plan_digest);
    assert.deepEqual(verifySavedPlan(saved, { target, adapter: "codex" }), {
      valid: true,
      plan_digest: saved.plan_digest,
      target_snapshot_digest: saved.target.snapshot_digest,
    });

    writeFileSync(resolve(target, "AGENTS.md"), "# Project-owned instructions\n\nChanged after plan.\n");
    assert.throws(() => verifySavedPlan(saved, { target, adapter: "codex" }), /changed after the plan|snapshot/i);
    writeFileSync(resolve(target, "AGENTS.md"), "# Project-owned instructions\n\nKeep this text.\n");
    assert.throws(() => verifySavedPlan(saved, { target, adapter: "claude-code" }), /adapter mismatch/i);

    const otherTarget = tempDir("ask-setup-other-");
    try {
      writeFileSync(resolve(otherTarget, "AGENTS.md"), "# Project-owned instructions\n\nKeep this text.\n");
      writeFileSync(resolve(otherTarget, "README.md"), "# Sample target\n");
      assert.throws(() => verifySavedPlan(saved, { target: otherTarget, adapter: "codex" }), /path does not match/i);
    } finally {
      rmSync(otherTarget, { recursive: true, force: true });
    }

    const insideOutput = resolve(target, "generated", "plan.json");
    const insideResult = runNode(ASK_SETUP, ["plan", "--target", target, "--adapter", "codex", "--profile", "minimal", "--output", insideOutput], { expected: [1] });
    assert.match(insideResult.stderr, /outside the target repository/i);
    assert.equal(existsSync(resolve(target, "generated")), false, "refused output must not create a target directory");

    writeFileSync(resolve(outputRoot, "existing.json"), "{}\n");
    const conflictOutput = runNode(ASK_SETUP, ["plan", "--target", target, "--adapter", "codex", "--profile", "minimal", "--output", resolve(outputRoot, "existing.json")], { expected: [1] });
    assert.match(conflictOutput.stderr, /already exists/i);

    const applyBefore = snapshotDigest(target);
    const apply = runNode(ASK_SETUP, ["apply", "--target", target], { expected: [1] });
    assert.match(apply.stderr, /apply is not implemented/i);
    assert.equal(snapshotDigest(target), applyBefore, "unsupported apply must fail before target mutation");

    await assert.rejects(() => createAdoptionPlan({ target, adapter: "codex", profile: "not-a-profile" }), /resolved profile|Outstanding decisions/i);
    await assert.rejects(() => createAdoptionPlan({ target, adapter: "codex", profile: "minimal", requiredCapabilities: ["not-a-capability"] }), /unsupported or unknown/i);

    const external = tempDir("ask-setup-external-");
    try {
      mkdirSync(resolve(target, ".agents/skills"), { recursive: true });
      try {
        symlinkSync(external, resolve(target, ".agents/skills/escape"));
        await assert.rejects(() => createAdoptionPlan({ target, adapter: "codex", profile: "minimal" }), /Symlink escapes target repository/i);
      } catch (error) {
        if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error;
      }
    } finally {
      rmSync(resolve(target, ".agents/skills/escape"), { force: true });
      rmSync(external, { recursive: true, force: true });
    }
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
  }

  const dirty = tempDir("ask-setup-dirty-");
  try {
    runNode(resolve(REPO_ROOT, "scripts/install-kernel.mjs"), ["--target", dirty, "--merge-agents", "--skills", "test-first-verification,handoff-generation,evidence-ledger,risk-gate"]);
    runNode(resolve(REPO_ROOT, "scripts/install-codex-adapter.mjs"), ["--target", dirty, "--profile", "minimal"]);
    const managed = resolve(dirty, ".agents/skills/test-first-verification/SKILL.md");
    writeFileSync(managed, `${readFileSync(managed, "utf8")}\nlocal dirty change\n`);
    const before = snapshotDigest(dirty);
    await assert.rejects(() => createAdoptionPlan({ target: dirty, adapter: "codex", profile: "minimal" }), /managed file conflict|modified locally/i);
    assert.equal(snapshotDigest(dirty), before, "conflict detection must not repair or overwrite the real target");
  } finally {
    rmSync(dirty, { recursive: true, force: true });
  }
}

await unitTests();
await integrationTests();
console.log("ASK setup tests passed");
