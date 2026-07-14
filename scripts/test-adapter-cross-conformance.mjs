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
  assert.ok(scenario.results.every((result) => result.projection_sha256.startsWith("sha256:")));
  assert.ok(scenario.results.every((result) => result.schema_errors.length === 0));
}

const fixture = JSON.parse(readFileSync(conformanceFixture, "utf8"));
function runFixture(value, extraArgs = []) {
  return spawnSync(process.execPath, [conformanceScript, "--fixture", "-", "--json", ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    input: JSON.stringify(value),
  });
}

const weakened = structuredClone(fixture);
weakened.scenarios[0].required_contracts.push("missing-contract-fixture");
const negative = runFixture(weakened);
assert.notEqual(negative.status, 0, "missing adapter contract coverage must fail closed");
const negativeReport = JSON.parse(negative.stdout);
assert.equal(negativeReport.status, "fail");
assert.ok(negativeReport.scenarios[0].results.every((result) => result.missing_contracts.includes("missing-contract-fixture")));

for (const mutation of fixture.mutation_fixtures) {
  const mutated = runFixture(fixture, ["--mutation", mutation.mutation_id]);
  assert.notEqual(mutated.status, 0, `${mutation.mutation_id} must fail closed`);
  const mutationReport = JSON.parse(mutated.stdout);
  assert.equal(mutationReport.status, "fail", `${mutation.mutation_id} must produce a conformance failure`);
  const mutationScenario = mutationReport.scenarios.find((scenario) => scenario.scenario_id === mutation.scenario_id);
  assert.ok(mutationScenario, `${mutation.mutation_id} must retain scenario diagnostics`);
  const mutatedAdapter = mutationScenario.results.find((result) => result.adapter_id === mutation.adapter_id);
  assert.equal(mutatedAdapter.status, "fail", `${mutation.mutation_id} must fail the mutated adapter`);
  assert.ok(mutatedAdapter.semantic_mismatches.length > 0, `${mutation.mutation_id} must expose a semantic mismatch`);
}

for (const [label, mutate, expectedError] of [
  ["empty adapters", (value) => { value.adapters = []; }, "fixture adapters must be exactly"],
  ["scenario replacement", (value) => { value.scenarios[0].scenario_id = "replacement_scenario"; }, "exact #179 set"],
  ["missing expected value", (value) => { delete value.scenarios[0].expected.stop_status; }, "expected fields must be exactly"],
  ["schema ref change", (value) => { value.normalized_event_schema_ref = "schemas/metrics-event.schema.json"; }, "canonical adapter runtime event schema"],
  ["empty contract minimum", (value) => { value.scenarios[0].required_contracts = []; }, "missing required contract minimums"],
]) {
  const invalid = structuredClone(fixture);
  mutate(invalid);
  const result = runFixture(invalid);
  assert.notEqual(result.status, 0, `${label} must fail closed`);
  const invalidReport = JSON.parse(result.stdout);
  assert.equal(invalidReport.status, "fail");
  assert.match(invalidReport.error, new RegExp(expectedError));
}

console.log("Cross-adapter conformance tests passed");
