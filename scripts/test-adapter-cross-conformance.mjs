#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const bundleScript = resolve(root, "scripts/adapter-runtime-bundle.mjs");
const conformanceScript = resolve(root, "scripts/adapter-cross-conformance.mjs");
const bundleFixture = resolve(root, "docs/fixtures/adapter-runtime-bundle.json");
const conformanceFixture = resolve(root, "docs/fixtures/adapter-cross-conformance.json");

for (const path of [bundleScript, conformanceScript, bundleFixture, conformanceFixture]) {
  assert.equal(existsSync(path), true, `required Phase 3-5 artifact is missing: ${path}`);
}

const bundleCheck = spawnSync(process.execPath, [bundleScript, "--check"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(bundleCheck.status, 0, bundleCheck.stderr || bundleCheck.stdout);

const conformance = spawnSync(process.execPath, [conformanceScript, "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.equal(conformance.status, 0, conformance.stderr || conformance.stdout);
const report = JSON.parse(conformance.stdout);
assert.equal(report.status, "pass_projected");
assert.equal(report.evidence_level, "projected");
assert.equal(report.scenarios.length, 9);
assert.deepEqual(new Set(report.adapters), new Set(["claude_code", "codex"]));
for (const scenario of report.scenarios) {
  assert.equal(scenario.results.length, 2);
  assert.ok(scenario.results.every((result) => result.status === "pass_projected"));
  assert.deepEqual(
    scenario.results[0].normalized_contract,
    scenario.results[1].normalized_contract,
    `${scenario.scenario_id} must preserve normalized meaning across adapters`,
  );
  assert.ok(scenario.results.every((result) => result.runtime_application_evidence === "unavailable"));
}

const fixture = JSON.parse(readFileSync(conformanceFixture, "utf8"));
const weakened = structuredClone(fixture);
weakened.scenarios[0].required_contracts.push("missing-contract-fixture");
const negative = spawnSync(process.execPath, [conformanceScript, "--fixture", "-", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
  input: JSON.stringify(weakened),
});
assert.notEqual(negative.status, 0, "missing adapter contract coverage must fail closed");
const negativeReport = JSON.parse(negative.stdout);
assert.equal(negativeReport.status, "fail");
assert.ok(negativeReport.scenarios[0].results.every((result) => result.missing_contracts.includes("missing-contract-fixture")));

console.log("Cross-adapter conformance tests passed");
