#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixturePath = resolve(root, "docs/fixtures/verification-proof-policy-cases.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

const compactShape = "Proof:\n- Behavior:\n- Focused check:\n- Result or missing evidence:\n- Broader check required when:\n";
const compactEligibilityFactIds = [
  "localized_scope",
  "reversible_change",
  "single_observable_behavior",
  "single_focused_check",
  "single_session_no_handoff",
  "no_cross_boundary_change",
  "consistent_local_upstream_proof",
  "localized_completion_claim_only",
];
const formalTriggerIds = [
  "bug_reproduction_or_regression",
  "public_api_schema_or_compatibility",
  "state_concurrency_persistence_lifecycle_or_cross_module",
  "security_auth_permission_privacy_financial_or_email",
  "infrastructure_migration_production_or_external_effect",
  "dependency_or_hard_to_reverse_boundary",
  "performance_or_reliability",
  "multi_session_multi_agent_or_handoff",
  "merge_release_or_stable_trace",
  "multiple_specialized_checks",
  "missing_or_conflicting_upstream_proof",
  "explicit_formal_request",
  "compact_eligibility_incomplete",
];
const protectedCompactClaimTypes = [
  "merge",
  "release",
  "performance",
  "security",
  "reliability",
  "production",
  "external_readiness",
  "no_regression",
  "broad_no_regression",
];

assert.equal(fixture.schema_version, "1.0.0");
assert.equal(fixture.policy_ref, "ask.verification-proof-policy@1.0.0");
assert.equal(fixture.compact_rendered_shape, compactShape);
assert.deepEqual(fixture.closed_sets.compact_eligibility_fact_ids, compactEligibilityFactIds);
assert.deepEqual(fixture.closed_sets.formal_trigger_ids, formalTriggerIds);
assert.deepEqual(fixture.closed_sets.protected_compact_claim_types, protectedCompactClaimTypes);

const sectionSensorScenarioIds = [
  "plain-both-paths",
  "incidental-prose",
  "backtick-fenced-label",
  "tilde-fenced-label",
  "four-space-backtick",
  "mismatched-closer",
  "shorter-closer",
  "longer-compatible-closer",
  "invalid-backtick-info",
  "unclosed-tilde",
];
assert.deepEqual(
  fixture.section_sensor_scenarios.map(({ id }) => id),
  sectionSensorScenarioIds,
  "section sensor scenarios must retain the complete ordered fence oracle",
);
const sectionSensorMismatches = [];
for (const scenario of fixture.section_sensor_scenarios) {
  const result = spawnSync(
    process.execPath,
    ["scripts/ask-sensors.mjs", "--target", root, "--mode", "verification"],
    { cwd: root, input: scenario.input, encoding: "utf8" },
  );
  assert.equal(
    result.status,
    0,
    `${scenario.id} sensor process must remain report-only\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  const match = result.stdout.match(/^- completion_contract: (pass|warn|fail|hard_stop) - /mu);
  assert.ok(match, `${scenario.id} must emit one completion_contract sensor status\n${result.stdout}`);
  if (match[1] !== scenario.expected_completion_status) {
    sectionSensorMismatches.push({
      id: scenario.id,
      expected: scenario.expected_completion_status,
      actual: match[1],
    });
  }
}
assert.deepEqual(sectionSensorMismatches, [], "section sensor fence cases must match the complete oracle");

const scenarioIds = fixture.scenarios.map(({ id }) => id);
assert.equal(new Set(scenarioIds).size, scenarioIds.length, "verification proof scenario IDs must be unique");
for (const requiredId of [
  "positive-text-config-compact",
  "positive-localized-implementation-compact",
  "positive-bug-reproduction-formal",
  "positive-concurrency-formal",
  "positive-public-schema-formal",
  "positive-performance-formal",
  "positive-compact-to-formal-upgrade",
  "positive-legacy-formal-readable",
  "negative-formal-trigger-compact",
  "negative-missing-evidence",
  "negative-post-failure-downgrade",
  "negative-conflicting-upstream-proof",
  "negative-invented-result",
  "negative-protected-compact-claim",
]) {
  assert.ok(scenarioIds.includes(requiredId), `missing required verification proof scenario ${requiredId}`);
}

const invalidScenarios = fixture.scenarios.filter(({ expected }) => expected === "invalid");
assert.equal(invalidScenarios.length, 6, "five Issue negatives plus protected-claim must remain explicit");
for (const scenario of invalidScenarios) {
  assert.ok(Array.isArray(scenario.expected_errors) && scenario.expected_errors.length > 0, `${scenario.id} requires a non-empty ordered expected_errors oracle`);
  assert.ok(scenario.expected_errors.every((issue) => typeof issue === "string" && issue.length > 0), `${scenario.id} expected_errors must contain non-empty strings`);
}

const compactBytes = Buffer.from(fixture.compact_rendered_shape, "utf8");
assert.equal(compactBytes.byteLength, fixture.size_proxy.compact_expected_bytes);
assert.equal(compactBytes.byteLength, 97);
assert.equal(compactBytes.at(-1), 0x0a, "Compact Proof shape must end in LF");

const formalBaseline = readFileSync(resolve(root, fixture.size_proxy.formal_baseline_path));
assert.equal(formalBaseline.byteLength, fixture.size_proxy.formal_expected_bytes);
assert.equal(formalBaseline.byteLength, 287);
assert.equal(formalBaseline.at(-1), 0x0a, "formal baseline must end in LF");
assert.equal(digest(formalBaseline), fixture.size_proxy.formal_sha256);
assert.ok(
  compactBytes.byteLength <= formalBaseline.byteLength * fixture.size_proxy.maximum_compact_ratio,
  `Compact Proof must be at least 30% smaller: compact=${compactBytes.byteLength} formal=${formalBaseline.byteLength}`,
);

const promptProxy = fixture.size_proxy.generated_localized_prompt;
const promptBaseline = readFileSync(resolve(root, promptProxy.baseline_path));
assert.equal(promptBaseline.byteLength, promptProxy.baseline_expected_bytes);
assert.equal(digest(promptBaseline), promptProxy.baseline_sha256);
const { buildCodexProjectionPlan } = await import("./install-codex-adapter.mjs");
const codexPlan = buildCodexProjectionPlan({ profileName: "implementation" });
const promptArtifact = codexPlan.compactProfileArtifacts.find(({ metadata }) => (
  metadata.profile_id === promptProxy.candidate_profile_id
  && metadata.prompt_name === promptProxy.candidate_prompt_name
));
assert.ok(promptArtifact, "generated localized verification prompt must resolve from the Codex implementation projection");
const promptCandidate = Buffer.from(promptArtifact.content, "utf8");
assert.equal(promptCandidate.byteLength, promptProxy.candidate_expected_bytes);
assert.equal(digest(promptCandidate), promptProxy.candidate_sha256);
assert.ok(
  promptCandidate.byteLength <= promptBaseline.byteLength * promptProxy.maximum_candidate_ratio,
  `Generated localized verification prompt must be at least 10% smaller: candidate=${promptCandidate.byteLength} baseline=${promptBaseline.byteLength}`,
);
const runtimeProfiles = JSON.parse(readFileSync(resolve(root, "docs/fixtures/adapter-runtime-profiles.json"), "utf8"));
const codexProfile = runtimeProfiles.profiles.find(({ adapter_id }) => adapter_id === promptProxy.candidate_adapter_id);
const runtimePrompt = codexProfile?.rendering?.compact_profiles?.find(({ profile_id }) => profile_id === promptProxy.candidate_profile_id);
assert.equal(runtimePrompt?.rendered_bytes, promptCandidate.byteLength);
assert.equal(runtimePrompt?.rendered_sha256, `sha256:${digest(promptCandidate)}`);

for (const guard of fixture.legacy_fixture_guards) {
  const bytes = readFileSync(resolve(root, guard.path));
  assert.equal(digest(bytes), guard.sha256, `${guard.path} historical fixture bytes changed`);
}

const {
  COMPACT_ELIGIBILITY_FACT_IDS,
  FORMAL_VERIFICATION_TRIGGER_IDS,
  PROTECTED_COMPACT_CLAIM_TYPES,
  VERIFICATION_PROOF_POLICY_REF,
  readLegacyFormalVerificationArtifact,
  renderCompactProofShape,
  selectVerificationProofPath,
  transitionVerificationProofPath,
  validateCompactProof,
  validateVerificationProofSelection,
} = await import("./verification-proof-policy.mjs");

assert.equal(VERIFICATION_PROOF_POLICY_REF, fixture.policy_ref);
assert.deepEqual(COMPACT_ELIGIBILITY_FACT_IDS, compactEligibilityFactIds);
assert.deepEqual(FORMAL_VERIFICATION_TRIGGER_IDS, formalTriggerIds);
assert.deepEqual(PROTECTED_COMPACT_CLAIM_TYPES, protectedCompactClaimTypes);
assert.equal(renderCompactProofShape(), compactShape);

const schema = JSON.parse(readFileSync(resolve(root, "schemas/verification-proof-policy.schema.json"), "utf8"));
assert.equal(schema.$id, "https://github.com/ist-h-i/agent-spectrum-kernel/schemas/verification-proof-policy.schema.json");
assert.equal(schema["x-ask-contract"].ref, fixture.policy_ref);
assert.deepEqual(schema["x-ask-contract"].compact_eligibility_fact_ids, compactEligibilityFactIds);
assert.deepEqual(schema["x-ask-contract"].formal_trigger_ids, formalTriggerIds);
assert.deepEqual(schema["x-ask-contract"].protected_compact_claim_types, protectedCompactClaimTypes);
assert.equal(schema.$defs.transition.properties.from_path.const, "compact_proof");
assert.equal(schema.$defs.transition.properties.to_path.const, "formal_verification_contract");
assert.ok(schema.$defs.transition.required.includes("formal_verification_contract_ref"));

function resolveLocalSchemaRef(rootSchema, reference) {
  if (!reference.startsWith("#/")) throw new Error(`unsupported schema ref ${reference}`);
  return reference.slice(2).split("/").reduce(
    (value, segment) => value[segment.replaceAll("~1", "/").replaceAll("~0", "~")],
    rootSchema,
  );
}

function schemaIssues(rootSchema, schemaNode, value, path = "$") {
  if (schemaNode.$ref) return schemaIssues(rootSchema, resolveLocalSchemaRef(rootSchema, schemaNode.$ref), value, path);
  const issues = [];
  const typeMatches = (type) => (
    type === "array" ? Array.isArray(value)
      : type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
        : type === "integer" ? Number.isInteger(value)
          : type === "number" ? typeof value === "number" && Number.isFinite(value)
            : type === "null" ? value === null
              : typeof value === type
  );
  if (schemaNode.type && !typeMatches(schemaNode.type)) return [`${path} type`];
  if (Object.hasOwn(schemaNode, "const") && JSON.stringify(value) !== JSON.stringify(schemaNode.const)) issues.push(`${path} const`);
  if (Array.isArray(schemaNode.enum) && !schemaNode.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) issues.push(`${path} enum`);
  if (typeof value === "string" && typeof schemaNode.minLength === "number" && value.length < schemaNode.minLength) issues.push(`${path} minLength`);
  if (Array.isArray(value)) {
    if (typeof schemaNode.minItems === "number" && value.length < schemaNode.minItems) issues.push(`${path} minItems`);
    if (typeof schemaNode.maxItems === "number" && value.length > schemaNode.maxItems) issues.push(`${path} maxItems`);
    if (schemaNode.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) issues.push(`${path} uniqueItems`);
    if (schemaNode.items) value.forEach((entry, index) => issues.push(...schemaIssues(rootSchema, schemaNode.items, entry, `${path}[${index}]`)));
    if (schemaNode.contains) {
      const matchCount = value.filter((entry) => schemaIssues(rootSchema, schemaNode.contains, entry).length === 0).length;
      const minimum = schemaNode.minContains ?? 1;
      if (matchCount < minimum) issues.push(`${path} minContains`);
      if (typeof schemaNode.maxContains === "number" && matchCount > schemaNode.maxContains) issues.push(`${path} maxContains`);
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schemaNode.properties ?? {};
    for (const required of schemaNode.required ?? []) if (!Object.hasOwn(value, required)) issues.push(`${path}.${required} required`);
    if (schemaNode.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) issues.push(`${path}.${key} additional`);
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) issues.push(...schemaIssues(rootSchema, propertySchema, value[key], `${path}.${key}`));
    }
  }
  for (const child of schemaNode.allOf ?? []) issues.push(...schemaIssues(rootSchema, child, value, path));
  return issues;
}

const executionEvidence = new Map(fixture.execution_evidence.map((record) => [record.evidence_ref, record]));

for (const scenario of fixture.scenarios) {
  let issues = [];

  if (scenario.operation === "selection" || scenario.operation === "selection_and_compact_proof") {
    const selectedPath = selectVerificationProofPath({
      eligibility_facts: scenario.selection.eligibility_facts,
      formal_triggers: scenario.selection.formal_triggers,
      upstream_proof_facts: scenario.selection.upstream_proof_facts,
    });
    assert.equal(selectedPath, scenario.expected_path, `${scenario.id} selected path`);
    issues.push(...validateVerificationProofSelection(scenario.selection));
  }

  if (scenario.operation === "selection_and_compact_proof") {
    issues.push(...validateCompactProof({
      selection: scenario.selection,
      proof: scenario.proof,
      claim: scenario.claim,
      resolveExecutionEvidence: (evidenceRef) => executionEvidence.get(evidenceRef),
    }));
  }

  if (scenario.operation === "transition") {
    const transition = transitionVerificationProofPath(scenario.transition);
    assert.equal(transition.selected_path, scenario.expected_path, `${scenario.id} transition path`);
    issues.push(...transition.issues);
    if (scenario.expected_retained_evidence_refs) {
      assert.deepEqual(transition.retained_evidence_refs, scenario.expected_retained_evidence_refs, `${scenario.id} retained evidence`);
    }
  }

  if (scenario.operation === "legacy_formal") {
    const source = JSON.parse(readFileSync(resolve(root, scenario.source_fixture.path), "utf8"));
    const sourceScenario = source.scenarios.find(({ id }) => id === scenario.source_fixture.scenario_id);
    const artifact = sourceScenario?.artifacts.find(({ id }) => id === scenario.source_fixture.artifact_id);
    assert.ok(artifact, `${scenario.id} legacy formal artifact must resolve`);
    const before = JSON.stringify(artifact);
    const inspection = readLegacyFormalVerificationArtifact(artifact);
    assert.equal(inspection.selected_path, scenario.expected_path, `${scenario.id} legacy path`);
    assert.equal(inspection.artifact_ref, scenario.source_fixture.artifact_id, `${scenario.id} legacy artifact ref`);
    issues.push(...inspection.issues);
    assert.equal(JSON.stringify(artifact), before, `${scenario.id} legacy inspection must not rewrite input`);
  }

  assert.deepEqual(
    issues,
    scenario.expected === "invalid" ? scenario.expected_errors : [],
    `${scenario.id} must match the complete ordered issue oracle`,
  );
}

const compactPositive = fixture.scenarios.find(({ id }) => id === "positive-localized-implementation-compact");
const compactEligibilitySchema = schema.$defs.compactSelection.properties.eligibility_facts;
assert.deepEqual(schemaIssues(schema, compactEligibilitySchema, compactPositive.selection.eligibility_facts), [], "schema must accept the exhaustive compact eligibility set");
const duplicateEligibilityFacts = compactPositive.selection.eligibility_facts.map(() => structuredClone(compactPositive.selection.eligibility_facts[0]));
assert.notDeepEqual(schemaIssues(schema, compactEligibilitySchema, duplicateEligibilityFacts), [], "schema must reject eight repetitions of one compact eligibility fact");
const transitionTriggerSchema = schema.$defs.transition.properties.formal_triggers;
const upgradePositive = fixture.scenarios.find(({ id }) => id === "positive-compact-to-formal-upgrade");
assert.deepEqual(schemaIssues(schema, transitionTriggerSchema, upgradePositive.transition.formal_triggers), [], "schema must accept a triggered compact-to-formal transition");
assert.notDeepEqual(schemaIssues(schema, transitionTriggerSchema, []), [], "schema must reject a compact-to-formal transition without a formal trigger");
const compactProofIssues = (proof) => validateCompactProof({
  selection: compactPositive.selection,
  proof,
  resolveExecutionEvidence: (evidenceRef) => executionEvidence.get(evidenceRef),
});
assert.deepEqual(
  validateCompactProof({
    selection: compactPositive.selection,
    proof: compactPositive.proof,
    claim: { claim_type: "no_regression", behavior_ref: compactPositive.proof.behavior_ref },
    resolveExecutionEvidence: (evidenceRef) => executionEvidence.get(evidenceRef),
  }),
  ["compact_proof cannot support protected claim no_regression"],
  "Compact Proof must not authorize a no-regression claim",
);
assert.deepEqual(
  validateCompactProof({
    selection: compactPositive.selection,
    proof: compactPositive.proof,
    claim: { claim_type: "localized_completion", behavior_ref: compactPositive.proof.behavior_ref },
    resolveExecutionEvidence: (evidenceRef) => executionEvidence.get(evidenceRef),
  }),
  ["compact_proof cannot support non-localized claim localized_completion"],
  "Compact Proof must use the canonical lifecycle completion claim vocabulary",
);
const incompleteObservedProof = structuredClone(compactPositive.proof);
delete incompleteObservedProof.result.exit_code;
delete incompleteObservedProof.result.exact_result;
assert.deepEqual(
  compactProofIssues(incompleteObservedProof),
  ["compact observed result fields are invalid: missing=exit_code, exact_result; unexpected=none"],
  "runtime validation must fail closed when exact observed-result fields are absent",
);
const inconsistentExitProof = structuredClone(compactPositive.proof);
inconsistentExitProof.result.exit_code = 1;
assert.deepEqual(
  compactProofIssues(inconsistentExitProof),
  ["compact observed result exit_code does not match passed or failed status"],
  "runtime validation must bind passed status to exit 0",
);
const incompleteSelection = structuredClone(compactPositive.selection);
delete incompleteSelection.behavior_ref;
assert.deepEqual(
  validateVerificationProofSelection(incompleteSelection),
  ["verification proof selection fields are invalid: missing=behavior_ref; unexpected=none"],
  "runtime validation must reject structurally incomplete selection records",
);
const driftedUpgrade = structuredClone(upgradePositive.transition);
driftedUpgrade.policy_ref = "ask.verification-proof-policy@9.9.9";
assert.deepEqual(
  transitionVerificationProofPath(driftedUpgrade).issues,
  [`transition policy_ref must be ${fixture.policy_ref}`],
  "runtime validation must reject a transition from another policy revision",
);

console.log("Verification proof policy tests passed");
