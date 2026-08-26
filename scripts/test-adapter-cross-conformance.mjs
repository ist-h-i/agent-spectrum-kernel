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
const VERIFICATION_PROOF_POLICY_REF = "ask.verification-proof-policy@1.0.0";
const COMPACT_ELIGIBILITY_FACT_IDS = [
  "localized_scope",
  "reversible_change",
  "single_observable_behavior",
  "single_focused_check",
  "single_session_no_handoff",
  "no_cross_boundary_change",
  "consistent_local_upstream_proof",
  "localized_completion_claim_only",
];
const proofPathByScenario = new Map([
  ["localized_implementation", "compact_proof"],
  ["new_behavior_with_verification", "formal_verification_contract"],
  ["unknown_root_cause_investigation", "formal_verification_contract"],
]);

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
const formalScenarioIds = new Set(["pr_review_selective_gates", "destructive_external_action", "explicit_knowledge_promotion"]);
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
  const expectedMode = formalScenarioIds.has(scenario.scenario_id) ? "formal_ledger" : "inline";
  assert.ok(scenario.results.every((result) => result.normalized_contract.claim_evidence_mode === expectedMode));
  assert.ok(scenario.results.every((result) => result.normalized_contract.selected_contracts.includes("evidence-ledger") === (expectedMode === "formal_ledger")));
  const expectedProofPath = proofPathByScenario.get(scenario.scenario_id) ?? null;
  assert.ok(scenario.results.every((result) => result.normalized_contract.verification_proof_path === expectedProofPath));
  assert.ok(scenario.results.every((result) => result.normalized_contract.verification_proof_policy_ref === (expectedProofPath ? VERIFICATION_PROOF_POLICY_REF : null)));
  if (expectedProofPath) assert.ok(scenario.results.every((result) => result.normalized_contract.selected_contracts.includes("test-first-verification")));
  if (expectedProofPath === "formal_verification_contract") assert.ok(scenario.results.every((result) => result.normalized_contract.verification_proof_path !== "compact_proof"));
}

const localizedScenario = report.scenarios.find((scenario) => scenario.scenario_id === "localized_implementation");
assert.ok(localizedScenario, "localized implementation diagnostics must be present");
assert.ok(localizedScenario.results.every((result) => result.normalized_contract.verification_proof_path === "compact_proof"));
assert.ok(localizedScenario.results.every((result) => !result.semantic_mismatches.includes("verification_proof_path_overactivated")));

const fixture = JSON.parse(readFileSync(conformanceFixture, "utf8"));
assert.equal(fixture.schema_version, "1.1.0");
assert.equal(fixture.verification_proof_policy_ref, VERIFICATION_PROOF_POLICY_REF);
const localizedFixture = fixture.scenarios.find((scenario) => scenario.scenario_id === "localized_implementation");
assert.deepEqual(localizedFixture.input.verification_proof.compact_eligibility_fact_ids, COMPACT_ELIGIBILITY_FACT_IDS);
assert.deepEqual(localizedFixture.input.verification_proof.formal_trigger_ids, []);
assert.equal(localizedFixture.expected.verification_proof_path, "compact_proof");
for (const scenario of fixture.scenarios) {
  assert.equal(scenario.expected.verification_proof_path, proofPathByScenario.get(scenario.scenario_id) ?? null);
}
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

const proofMutationMismatch = new Map([
  ["codex_remove_verification_proof_policy_ref", "verification_proof_policy_ref"],
  ["claude_remove_compact_proof_path", "verification_proof_path_overactivated"],
  ["codex_remove_formal_verification_path", "verification_proof_path_missing"],
]);
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
  if (proofMutationMismatch.has(mutation.mutation_id)) {
    assert.ok(
      mutatedAdapter.semantic_mismatches.includes(proofMutationMismatch.get(mutation.mutation_id)),
      `${mutation.mutation_id} must expose its proof-policy mismatch`,
    );
  }
}

for (const [label, mutate, expectedError] of [
  ["empty adapters", (value) => { value.adapters = []; }, "fixture adapters must be exactly"],
  ["scenario replacement", (value) => { value.scenarios[0].scenario_id = "replacement_scenario"; }, "exact #179 set"],
  ["missing expected value", (value) => { delete value.scenarios[0].expected.stop_status; }, "expected fields must be exactly"],
  ["claim mode mismatch", (value) => { value.scenarios[0].expected.claim_evidence_mode = "formal_ledger"; }, "claim evidence mode must match"],
  ["unknown formal trigger", (value) => { value.scenarios[0].input.formal_evidence_trigger_ids = ["generic_correctness_claim"]; }, "unknown formal evidence ledger trigger"],
  ["schema ref change", (value) => { value.normalized_event_schema_ref = "schemas/metrics-event.schema.json"; }, "canonical adapter runtime event schema"],
  ["proof policy ref change", (value) => { value.verification_proof_policy_ref = "ask.verification-proof-policy@9.9.9"; }, "canonical verification proof policy"],
  ["unknown compact eligibility fact", (value) => { value.scenarios[0].input.verification_proof.compact_eligibility_fact_ids.push("generic_local_change"); }, "unknown compact eligibility fact"],
  ["formal trigger projected compact", (value) => { value.scenarios[1].expected.verification_proof_path = "compact_proof"; }, "verification proof path must match"],
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
