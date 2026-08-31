#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveReviewSignalGateRoute, readReviewSignalGateMap } from "./ask-shared.mjs";
import { validateJsonSchema } from "./execution-envelope.mjs";
import { BASELINE_GATE, FINAL_GATE, inspectReviewPolicyRegistry, inspectReviewRouteCase } from "./review-route-contract.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixture = JSON.parse(readFileSync(resolve(root, "docs/fixtures/review-route-cases.json"), "utf8"));
const registry = JSON.parse(readFileSync(resolve(root, fixture.registry_ref), "utf8"));
const expectedScenarioIds = [
  "localized_logic_defect",
  "cross_module_architecture",
  "domain_state_change",
  "user_facing_output_change",
  "severe_adversarial_path",
  "clean_low_risk",
  "automated_evidence",
  "decision_requested",
  "missing_applicable_evidence",
  "missing_target",
  "missing_baseline_under_processing",
  "untriggered_heavy_over_processing",
  "duplicate_baseline",
  "final_gate_overactivation",
  "final_gate_missing",
  "blocker_without_merge_consequence",
  "impact_ordered_findings",
  "missing_finding_field",
  "duplicate_finding_id",
  "invalid_finding_severity",
  "unknown_finding_field",
  "finding_impact_misorder",
  "ordinary_output_boilerplate_rejected",
];

const registryIssues = inspectReviewPolicyRegistry(registry);
if (registryIssues.length > 0) throw new Error(`review route registry invalid:\n${registryIssues.join("\n")}`);
if (fixture.schema_version !== "1.0.0" || fixture.baseline_gate !== BASELINE_GATE || fixture.final_gate !== FINAL_GATE) throw new Error("review route fixture metadata drifted");
if (JSON.stringify(fixture.required_finding_fields) !== JSON.stringify(registry.finding_contract.required_fields)) throw new Error("fixture finding fields differ from canonical registry");
if (JSON.stringify(fixture.severity_order) !== JSON.stringify(registry.finding_contract.severity_order)) throw new Error("fixture severity order differs from canonical registry");
if (JSON.stringify(fixture.scenarios.map((scenario) => scenario.id)) !== JSON.stringify(expectedScenarioIds)) throw new Error("review route scenario inventory drifted");

const findingSchemaPath = resolve(root, "schemas/review-finding.schema.json");
const findingBase = {
  finding_id: "F-SCHEMA-SEMANTIC",
  practical_impact: "The schema must preserve merge consequence semantics.",
  trigger_or_failure_trace: "A producer emits a Finding inventory.",
  evidence_location: "scripts/test-review-route.mjs",
  required_post_fix_condition: "The canonical semantic pair is validated.",
};
if (validateJsonSchema([{ ...findingBase, severity: "blocker", merge_blocker: false }], { schemaPath: findingSchemaPath }).length === 0) {
  throw new Error("review Finding schema must reject blocker severity without merge consequence");
}
for (const finding of [
  { ...findingBase, severity: "blocker", merge_blocker: true },
  { ...findingBase, severity: "major", merge_blocker: false },
  { ...findingBase, severity: "major", merge_blocker: true },
  { ...findingBase, severity: "minor", merge_blocker: false },
  { ...findingBase, severity: "nit", merge_blocker: false },
]) {
  const issues = validateJsonSchema([finding], { schemaPath: findingSchemaPath });
  if (issues.length > 0) throw new Error(`review Finding schema rejected a valid severity/consequence pair: ${issues.join("; ")}`);
}

for (const scenario of fixture.scenarios) {
  const actual = inspectReviewRouteCase(registry, scenario);
  for (const field of ["required_gates", "additional_required_gates", "baseline_status", "issues"]) {
    if (JSON.stringify(actual[field]) !== JSON.stringify(scenario.expected[field])) throw new Error(`${scenario.id}.${field}: expected ${JSON.stringify(scenario.expected[field])}, received ${JSON.stringify(actual[field])}`);
  }
  if (actual.over_processing.includes(BASELINE_GATE)) throw new Error(`${scenario.id}: baseline must never be classified as over-processing`);
}

const runtimeRegistry = readReviewSignalGateMap(root);
if (JSON.stringify(runtimeRegistry) !== JSON.stringify(registry)) throw new Error("runtime review registry reader diverges from the canonical fixture registry");
const runtimeRoute = deriveReviewSignalGateRoute(runtimeRegistry, ["untrusted_input", "docs_output_change", "notification_change"]);
if (
  JSON.stringify(runtimeRoute) !== JSON.stringify({
    observed_signals: ["docs_output_change", "notification_change", "untrusted_input"],
    additional_gates: ["review-domain-impact", "review-output-quality", "review-adversarial-risk"],
    signals_by_gate: {
      "review-domain-impact": ["notification_change"],
      "review-output-quality": ["docs_output_change", "notification_change"],
      "review-adversarial-risk": ["untrusted_input"],
    },
    issues: [],
  })
) throw new Error(`runtime review signal derivation is invalid: ${JSON.stringify(runtimeRoute)}`);
const localizedRoute = deriveReviewSignalGateRoute(runtimeRegistry, ["公開API変更", "出力変更"]);
if (JSON.stringify(localizedRoute.additional_gates) !== JSON.stringify(["review-architecture-impact", "review-output-quality"])) throw new Error("runtime review signal derivation must preserve controlled localized signal IDs");
if (!deriveReviewSignalGateRoute(runtimeRegistry, ["untrusted_input", "untrusted_input"]).issues.includes("observed_signals:duplicate")) throw new Error("runtime review signal derivation must reject duplicate signals");
if (!deriveReviewSignalGateRoute(runtimeRegistry, ["unknown_signal"]).issues.includes("observed_signal:unknown:unknown_signal")) throw new Error("runtime review signal derivation must reject unknown signals");

console.log("Review route contract tests passed");
