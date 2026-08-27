#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const target = mkdtempSync(resolve(tmpdir(), "ask-dual-runtime-migration-"));
const coreInstaller = resolve(root, "scripts/install-kernel.mjs");
const claudeInstaller = resolve(root, "scripts/install-claude-adapter.mjs");
const codexInstaller = resolve(root, "scripts/install-codex-adapter.mjs");
const fixedEntries = ["skill-implement.md", "skill-investigate.md", "skill-review.md", "skill-verify.md", "skill-handoff.md"];
const implementationFixedEntries = ["skill-implement.md", "skill-verify.md", "skill-handoff.md"];
const exactAssetRefFields = ["asset_type", "content_digest", "record_digest", "stable_id", "version"];

function run(script, args) {
  const result = spawnSync(process.execPath, [script, "--target", target, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${script} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result;
}

function state(name) {
  return JSON.parse(readFileSync(resolve(target, `.agent-spectrum-kernel/${name}-install-state.json`), "utf8"));
}

function managedBytes(adapterState) {
  return Object.fromEntries(
    Object.entries(adapterState.managed_files ?? {})
      .filter(([, record]) => record?.sha256)
      .map(([path, record]) => [path, record.sha256]),
  );
}

function assertInstalledProfile(name, profile) {
  const current = state(name);
  assert.equal(current.install_status, "installed");
  assert.equal(current.selected_profile, profile);
  assert.deepEqual(current.installed_skills, current.selected_skills, `${name} pruned profile must not retain stale discoverable Skills`);
  return current;
}

function assertFixedEntryProjection(name, adapterState, entries) {
  const rootPath = name === "claude" ? ".claude/commands" : ".agents/prompts";
  const marker = name === "claude" ? "ASK_CLAUDE_FIXED_ENTRY_PROFILE" : "ASK_CODEX_COMPACT_PROFILE";
  const profiles = adapterState.compact_runtime_profiles ?? [];
  assert.equal(profiles.length, entries.length, `${name} must record exactly one compact profile per selected fixed entry`);
  for (const entry of entries) {
    const profile = profiles.find((candidate) => candidate.prompt_name === entry);
    const path = `${rootPath}/${entry}`;
    const record = adapterState.managed_files?.[path];
    assert.ok(profile, `${name} omitted compact profile metadata for ${entry}`);
    assert.equal(profile.schema_version, "1.2.0", `${name} ${entry} used an obsolete compact profile revision`);
    assert.deepEqual(record?.compact_profile, profile, `${name} ${entry} managed provenance must use the selected compact profile`);
    assert.equal(profile.canonical_asset_refs?.length, 2, `${name} ${entry} must bind both registered fixed-entry Assets`);
    for (const reference of profile.canonical_asset_refs) {
      assert.deepEqual(Object.keys(reference).sort(), exactAssetRefFields, `${name} ${entry} must preserve an exact Asset reference tuple`);
      assert.match(reference.record_digest, /^sha256:[a-f0-9]{64}$/u);
      assert.match(reference.content_digest, /^sha256:[a-f0-9]{64}$/u);
    }
    const content = readFileSync(resolve(target, path), "utf8");
    assert.ok(content.includes(marker), `${name} ${entry} omitted its fixed-entry provenance marker`);
    assert.ok(!content.includes("{{ASK_COMPACT_"), `${name} ${entry} retained an unrendered fixed-entry placeholder`);
    assert.ok(!content.includes("operating-mode-router") && !content.includes("skill-router"), `${name} ${entry} must skip upper routers`);
  }
}

try {
  writeFileSync(resolve(target, "README.md"), "# Adopting project\n");
  writeFileSync(resolve(target, "AGENTS.md"), "# Project-owned instructions\n\nKeep this text.\n");
  mkdirSync(resolve(target, ".claude"), { recursive: true });
  mkdirSync(resolve(target, ".agents"), { recursive: true });
  writeFileSync(resolve(target, ".claude/project-owned-note.md"), "Keep Claude-adjacent project content.\n");
  writeFileSync(resolve(target, ".agents/project-owned-note.md"), "Keep Codex-adjacent project content.\n");

  run(coreInstaller, ["--merge-agents"]);
  assert.ok(existsSync(resolve(target, "schemas/adapter-runtime-event.schema.json")), "core projection omitted the normalized runtime event schema");
  assert.ok(existsSync(resolve(target, "schemas/normalized-event-schema-registry.json")), "core projection omitted the normalized event registry");
  assert.ok(existsSync(resolve(target, "docs/verification-proof-policy-contract.md")), "core projection omitted the verification proof policy contract");
  assert.ok(existsSync(resolve(target, "schemas/verification-proof-policy.schema.json")), "core projection omitted the verification proof policy schema");
  assert.ok(existsSync(resolve(target, "docs/review-finding-contract.md")), "core projection omitted the review finding contract");
  assert.ok(existsSync(resolve(target, "schemas/review-finding.schema.json")), "core projection omitted the review finding schema");
  assert.ok(existsSync(resolve(target, "schemas/fixed-entry-profile-registry.json")), "core projection omitted the fixed-entry semantic registry");
  run(claudeInstaller, ["--profile", "implementation"]);
  run(codexInstaller, ["--profile", "implementation"]);

  const claudeInitial = state("claude");
  const codexInitial = state("codex");
  const claudeInitialBytes = managedBytes(claudeInitial);
  const codexInitialBytes = managedBytes(codexInitial);
  assertFixedEntryProjection("claude", claudeInitial, implementationFixedEntries);
  assertFixedEntryProjection("codex", codexInitial, implementationFixedEntries);
  assert.ok(existsSync(resolve(target, ".claude/commands/skill-implement.md")));
  assert.ok(existsSync(resolve(target, ".agents/prompts/skill-implement.md")));
  for (const path of [
    ".claude/commands/skill-implement.md",
    ".claude/commands/skill-verify.md",
    ".agents/prompts/skill-implement.md",
    ".agents/prompts/skill-verify.md",
  ]) {
    const projected = readFileSync(resolve(target, path), "utf8");
    assert.ok(projected.includes("ask.verification-proof-policy@1.0.0"), `${path} omitted the proof policy revision`);
    assert.ok(projected.includes("compact_proof"), `${path} omitted the Compact Proof path`);
    assert.ok(projected.includes("formal_verification_contract"), `${path} omitted the formal verification path`);
  }
  assert.equal(claudeInitial.projection_plan?.renderer_version, "5", "Claude migration used an unexpected renderer revision");
  assert.equal(codexInitial.projection_plan?.renderer_version, "7", "Codex migration used an unexpected renderer revision");

  run(claudeInstaller, ["--profile", "implementation"]);
  run(codexInstaller, ["--profile", "implementation"]);
  assert.deepEqual(managedBytes(state("claude")), claudeInitialBytes, "Claude idempotent regeneration changed managed bytes");
  assert.deepEqual(managedBytes(state("codex")), codexInitialBytes, "Codex idempotent regeneration changed managed bytes");

  run(claudeInstaller, ["--profile", "full"]);
  run(codexInstaller, ["--profile", "full"]);
  const claudeFull = state("claude");
  const codexFull = state("codex");
  assert.equal(claudeFull.selected_profile, "full");
  assert.equal(codexFull.selected_profile, "full");
  assertFixedEntryProjection("claude", claudeFull, fixedEntries);
  assertFixedEntryProjection("codex", codexFull, fixedEntries);

  run(claudeInstaller, ["--rollback"]);
  assert.equal(state("claude").selected_profile, "implementation");
  assert.equal(state("codex").selected_profile, "full", "Claude rollback must not change Codex ownership");
  run(codexInstaller, ["--rollback"]);
  assert.equal(state("codex").selected_profile, "implementation");

  run(claudeInstaller, ["--profile", "full"]);
  run(codexInstaller, ["--profile", "full"]);
  run(claudeInstaller, ["--profile", "implementation", "--prune"]);
  run(codexInstaller, ["--profile", "implementation", "--prune"]);
  assertInstalledProfile("claude", "implementation");
  assertInstalledProfile("codex", "implementation");

  run(codexInstaller, ["--detach"]);
  assert.equal(state("codex").install_status, "detached");
  assert.ok(existsSync(resolve(target, ".claude/commands/skill-implement.md")), "Codex detach removed Claude assets");
  assert.equal(state("claude").install_status, "installed");

  run(claudeInstaller, ["--detach"]);
  assert.equal(state("claude").install_status, "detached");
  assert.ok(readFileSync(resolve(target, "AGENTS.md"), "utf8").includes("Keep this text."), "adapter detach removed project-owned AGENTS content");
  assert.ok(readFileSync(resolve(target, ".claude/project-owned-note.md"), "utf8").includes("Keep Claude-adjacent"), "Claude lifecycle removed a non-managed nested project file");
  assert.ok(readFileSync(resolve(target, ".agents/project-owned-note.md"), "utf8").includes("Keep Codex-adjacent"), "Codex lifecycle removed a non-managed nested project file");
  assert.ok(existsSync(resolve(target, ".agent-spectrum-kernel/install-state.json")), "adapter detach removed core ownership state");

  console.log("Dual-runtime migration tests passed");
} finally {
  rmSync(target, { recursive: true, force: true });
}
