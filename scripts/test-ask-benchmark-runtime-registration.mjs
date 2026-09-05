#!/usr/bin/env node
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildPortfolioRuntimeRegistrationProjection,
  checkPortfolioRuntimeRegistrationProjection,
  writePortfolioRuntimeRegistrationProjection,
} from "./ask-benchmark-runtime-registration.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = resolve(ROOT, "scripts/ask-benchmark-runtime-registration.mjs");
const CONFIG_PATH = "benchmarks/adaptive-portfolio.config.json";
const TARGET_FIXTURES = ["mp-data-migration-handoff", "mp-iac-rollback-design", "mp-performance-investigation"];

function createRepository() {
  const root = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-runtime-registration-"));
  cpSync(resolve(ROOT, "benchmarks"), resolve(root, "benchmarks"), { recursive: true });
  return root;
}

function readConfig(root) {
  return JSON.parse(readFileSync(resolve(root, CONFIG_PATH), "utf8"));
}

function writeConfig(root, config) {
  writeFileSync(resolve(root, CONFIG_PATH), `${JSON.stringify(config, null, 2)}\n`);
}

function withoutBindingDigests(config) {
  const copy = structuredClone(config);
  for (const fixture of copy.fixtures) {
    delete fixture.input_manifest_sha256;
    if (fixture.verification_command_contract) delete fixture.verification_command_contract.sha256;
  }
  return copy;
}

const work = createRepository();
try {
  const stale = readConfig(work);
  for (const fixture of stale.fixtures) {
    if (!TARGET_FIXTURES.includes(fixture.id)) continue;
    fixture.input_manifest_sha256 = "0".repeat(64);
    fixture.verification_command_contract.sha256 = "1".repeat(64);
  }
  writeConfig(work, stale);

  const projection = buildPortfolioRuntimeRegistrationProjection({ root: work });
  assert.deepEqual(projection.changes.map(({ fixture_id: fixtureId }) => fixtureId), TARGET_FIXTURES);
  assert.deepEqual(withoutBindingDigests(projection.config), withoutBindingDigests(stale), "projection may update digest fields only");
  assert.equal(checkPortfolioRuntimeRegistrationProjection({ root: work }).status, "stale");

  const staleCli = spawnSync(process.execPath, [SCRIPT, "--check", "--root", work], { encoding: "utf8" });
  assert.equal(staleCli.status, 1, staleCli.stderr || staleCli.stdout);
  assert.deepEqual(JSON.parse(staleCli.stdout).fixture_ids, TARGET_FIXTURES);

  const written = writePortfolioRuntimeRegistrationProjection({ root: work });
  assert.equal(written.status, "written");
  assert.deepEqual(written.fixture_ids, TARGET_FIXTURES);
  const firstBytes = readFileSync(resolve(work, CONFIG_PATH));
  assert.equal(checkPortfolioRuntimeRegistrationProjection({ root: work }).status, "current");
  const repeated = writePortfolioRuntimeRegistrationProjection({ root: work });
  assert.equal(repeated.status, "current");
  assert.deepEqual(readFileSync(resolve(work, CONFIG_PATH)), firstBytes, "repeated writer must be byte-identical");

  const currentCli = spawnSync(process.execPath, [SCRIPT, "--check", "--root", work], { encoding: "utf8" });
  assert.equal(currentCli.status, 0, currentCli.stderr || currentCli.stdout);

  const duplicate = readConfig(work);
  duplicate.fixtures[1].id = duplicate.fixtures[0].id;
  writeConfig(work, duplicate);
  assert.throws(() => buildPortfolioRuntimeRegistrationProjection({ root: work }), /duplicate fixture IDs/u);

  writeFileSync(resolve(work, CONFIG_PATH), firstBytes);
  const escaped = readConfig(work);
  escaped.fixtures[0].input_manifest_path = "../outside.json";
  writeConfig(work, escaped);
  assert.throws(() => buildPortfolioRuntimeRegistrationProjection({ root: work }), /portable repository-relative path/u);

  writeFileSync(resolve(work, CONFIG_PATH), firstBytes);
  const target = resolve(work, "benchmarks/fixtures/checkpoint-b2/mp-data-migration-handoff/input-manifest.json");
  const preserved = `${target}.preserved`;
  cpSync(target, preserved);
  rmSync(target);
  symlinkSync(preserved, target);
  assert.throws(() => buildPortfolioRuntimeRegistrationProjection({ root: work }), /symlink/u);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log("ASK portfolio runtime registration writer tests passed");
