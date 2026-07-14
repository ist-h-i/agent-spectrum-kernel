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
  run(claudeInstaller, ["--profile", "implementation"]);
  run(codexInstaller, ["--profile", "implementation"]);

  const claudeInitial = state("claude");
  const codexInitial = state("codex");
  const claudeInitialBytes = managedBytes(claudeInitial);
  const codexInitialBytes = managedBytes(codexInitial);
  assert.ok(existsSync(resolve(target, ".claude/commands/skill-implement.md")));
  assert.ok(existsSync(resolve(target, ".agents/prompts/skill-implement.md")));

  run(claudeInstaller, ["--profile", "implementation"]);
  run(codexInstaller, ["--profile", "implementation"]);
  assert.deepEqual(managedBytes(state("claude")), claudeInitialBytes, "Claude idempotent regeneration changed managed bytes");
  assert.deepEqual(managedBytes(state("codex")), codexInitialBytes, "Codex idempotent regeneration changed managed bytes");

  run(claudeInstaller, ["--profile", "full"]);
  run(codexInstaller, ["--profile", "full"]);
  assert.equal(state("claude").selected_profile, "full");
  assert.equal(state("codex").selected_profile, "full");

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
