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

  const changedDuringPublication = readConfig(work);
  const publicationFixture = changedDuringPublication.fixtures.find(({ id }) => id === "mp-data-migration-handoff");
  publicationFixture.input_manifest_sha256 = "0".repeat(64);
  writeConfig(work, changedDuringPublication);
  const configBeforeRejectedPublication = readFileSync(resolve(work, CONFIG_PATH));
  const publicationInput = resolve(work, publicationFixture.input_manifest_path);
  const publicationInputBytes = readFileSync(publicationInput);
  assert.throws(() => writePortfolioRuntimeRegistrationProjection({
    root: work,
    beforePublish: () => writeFileSync(publicationInput, Buffer.concat([publicationInputBytes, Buffer.from("\n")])),
  }), /changed or was replaced during verification/u);
  assert.deepEqual(readFileSync(resolve(work, CONFIG_PATH)), configBeforeRejectedPublication, "changed source artifact must prevent config publication");
  writeFileSync(publicationInput, publicationInputBytes);
  writePortfolioRuntimeRegistrationProjection({ root: work });

  const currentCli = spawnSync(process.execPath, [SCRIPT, "--check", "--root", work], { encoding: "utf8" });
  assert.equal(currentCli.status, 0, currentCli.stderr || currentCli.stdout);

  writeFileSync(resolve(work, CONFIG_PATH), Buffer.concat([firstBytes, Buffer.from("\n")]));
  const formattingDrift = checkPortfolioRuntimeRegistrationProjection({ root: work });
  assert.equal(formattingDrift.status, "stale");
  assert.notEqual(formattingDrift.current_config_sha256, formattingDrift.expected_config_sha256);
  assert.equal(writePortfolioRuntimeRegistrationProjection({ root: work }).status, "written");
  assert.deepEqual(readFileSync(resolve(work, CONFIG_PATH)), firstBytes, "writer must repair exact-byte formatting drift");

  const semanticallyInvalid = readConfig(work);
  [semanticallyInvalid.conditions[0], semanticallyInvalid.conditions[1]] = [semanticallyInvalid.conditions[1], semanticallyInvalid.conditions[0]];
  semanticallyInvalid.fixtures[0].input_manifest_sha256 = "0".repeat(64);
  writeConfig(work, semanticallyInvalid);
  assert.throws(() => writePortfolioRuntimeRegistrationProjection({ root: work }), /portfolio conditions must be/u);
  writeFileSync(resolve(work, CONFIG_PATH), firstBytes);

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
  const configSchema = resolve(work, "benchmarks/schemas/portfolio-config.schema.json");
  const preservedConfigSchema = `${configSchema}.preserved`;
  cpSync(configSchema, preservedConfigSchema);
  rmSync(configSchema);
  symlinkSync(preservedConfigSchema, configSchema);
  assert.throws(() => buildPortfolioRuntimeRegistrationProjection({ root: work }), /symlink/u);
  rmSync(configSchema);
  cpSync(preservedConfigSchema, configSchema);
  rmSync(preservedConfigSchema);

  const verificationSchema = resolve(work, "benchmarks/schemas/portfolio-verification-command-contract.schema.json");
  const preservedVerificationSchema = `${verificationSchema}.preserved`;
  cpSync(verificationSchema, preservedVerificationSchema);
  rmSync(verificationSchema);
  symlinkSync(preservedVerificationSchema, verificationSchema);
  assert.throws(() => buildPortfolioRuntimeRegistrationProjection({ root: work }), /symlink/u);
  rmSync(verificationSchema);
  cpSync(preservedVerificationSchema, verificationSchema);
  rmSync(preservedVerificationSchema);

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
