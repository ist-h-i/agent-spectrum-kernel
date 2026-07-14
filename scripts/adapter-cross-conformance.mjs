#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { validateAdapterRuntimeEvent } from "./adapter-runtime-event.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultFixture = resolve(root, "docs/fixtures/adapter-cross-conformance.json");
const ADAPTERS = ["claude_code", "codex"];
const SCENARIO_REQUIREMENTS = Object.freeze({
  localized_implementation: { taskClass: "implementation", contracts: ["controlled-implementation", "evidence-ledger"], gates: [] },
  new_behavior_with_verification: { taskClass: "implementation", contracts: ["controlled-implementation", "test-first-verification", "evidence-ledger"], gates: [] },
  unknown_root_cause_investigation: { taskClass: "investigation", contracts: ["doubt-driven-development", "test-first-verification", "evidence-ledger"], gates: [] },
  pr_review_selective_gates: { taskClass: "review", contracts: ["review-router", "review-final-merge-gate", "evidence-ledger"], gates: ["review-router", "review-final-merge-gate"] },
  destructive_external_action: { taskClass: "risk-gated", contracts: ["risk-gate", "evidence-ledger"], gates: ["risk-gate"] },
  missing_repository_diff_test_evidence: { taskClass: "review", contracts: ["review-router", "evidence-ledger"], gates: ["review-router"] },
  handoff_resume_state: { taskClass: "handoff", contracts: ["handoff-generation", "evidence-ledger"], gates: [] },
  explicit_knowledge_promotion: { taskClass: "knowledge", contracts: ["operating-mode-router", "domain-rule-ledger", "evidence-ledger"], gates: [] },
  lightweight_no_heavy_routing_or_agents: { taskClass: "implementation", contracts: ["controlled-implementation", "evidence-ledger"], gates: [] },
});
const STOP_STATUSES = new Set(["none", "risk_gate", "insufficient_evidence"]);

function parseArgs(argv) {
  const args = { fixture: defaultFixture, mutation: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") args.fixture = argv[++index];
    else if (arg === "--mutation") args.mutation = argv[++index];
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/adapter-cross-conformance.mjs [--fixture <path|->] [--mutation <id>] [--json]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function readFixture(path) {
  return JSON.parse(path === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(path), "utf8"));
}

function planFor(adapterId, profile) {
  if (adapterId === "claude_code") return buildClaudeProjectionPlan({ profileName: profile });
  if (adapterId === "codex") return buildCodexProjectionPlan({ profileName: profile });
  throw new Error(`Unsupported adapter: ${adapterId}`);
}

function selectedEntries(adapterId, plan) {
  return adapterId === "claude_code" ? plan.selectedCommands : plan.prompts;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} fields must be exactly ${wanted.join(", ")}`);
}

function identifiers(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item) || new Set(value).size !== value.length) throw new Error(`${label} must be unique non-empty identifiers`);
}

function nonNegativeCounters(value, label) {
  exactKeys(value, ["started", "completed", "failed"], label);
  for (const key of ["started", "completed", "failed"]) if (!Number.isInteger(value[key]) || value[key] < 0) throw new Error(`${label}.${key} must be a non-negative integer`);
}

function includesAll(actual, required) {
  const values = new Set(actual);
  return required.every((value) => values.has(value));
}

function validateFixture(fixture) {
  exactKeys(fixture, ["schema_version", "adapters", "normalized_event_schema_ref", "scenarios", "mutation_fixtures"], "fixture");
  if (fixture.schema_version !== "1.0.0") throw new Error("fixture schema_version must be 1.0.0");
  if (JSON.stringify(fixture.adapters) !== JSON.stringify(ADAPTERS)) throw new Error("fixture adapters must be exactly claude_code, codex");
  if (fixture.normalized_event_schema_ref !== "schemas/adapter-runtime-event.schema.json") throw new Error("fixture normalized_event_schema_ref must reference the canonical adapter runtime event schema");
  if (!Array.isArray(fixture.scenarios) || fixture.scenarios.length !== Object.keys(SCENARIO_REQUIREMENTS).length) throw new Error("fixture must contain the nine required #179 scenarios");
  const ids = fixture.scenarios.map((scenario) => scenario?.scenario_id);
  if (new Set(ids).size !== ids.length || !includesAll(ids, Object.keys(SCENARIO_REQUIREMENTS))) throw new Error("fixture scenario IDs must be the exact #179 set");
  for (const scenario of fixture.scenarios) {
    const requirement = SCENARIO_REQUIREMENTS[scenario.scenario_id];
    if (!requirement) throw new Error(`unsupported scenario_id: ${scenario.scenario_id}`);
    exactKeys(scenario, ["scenario_id", "task_class", "required_contracts", "required_gates", "input", "expected", "projections"], scenario.scenario_id);
    if (scenario.task_class !== requirement.taskClass) throw new Error(`${scenario.scenario_id} task_class must be ${requirement.taskClass}`);
    identifiers(scenario.required_contracts, `${scenario.scenario_id}.required_contracts`);
    identifiers(scenario.required_gates, `${scenario.scenario_id}.required_gates`);
    if (!includesAll(scenario.required_contracts, requirement.contracts)) throw new Error(`${scenario.scenario_id} is missing required contract minimums`);
    if (!includesAll(scenario.required_gates, requirement.gates)) throw new Error(`${scenario.scenario_id} is missing required gate minimums`);
    exactKeys(scenario.input, ["risk_action", "missing_evidence", "knowledge_promotion_requested", "agent_activity_required"], `${scenario.scenario_id}.input`);
    if (typeof scenario.input.risk_action !== "boolean" || typeof scenario.input.knowledge_promotion_requested !== "boolean" || typeof scenario.input.agent_activity_required !== "boolean") throw new Error(`${scenario.scenario_id} input flags must be booleans`);
    identifiers(scenario.input.missing_evidence, `${scenario.scenario_id}.input.missing_evidence`);
    exactKeys(scenario.expected, ["approval_required", "stop_status", "missing_evidence", "knowledge_promotion", "agent_activity"], `${scenario.scenario_id}.expected`);
    if (typeof scenario.expected.approval_required !== "boolean" || typeof scenario.expected.knowledge_promotion !== "boolean" || !STOP_STATUSES.has(scenario.expected.stop_status)) throw new Error(`${scenario.scenario_id} expected values have invalid types or enums`);
    identifiers(scenario.expected.missing_evidence, `${scenario.scenario_id}.expected.missing_evidence`);
    nonNegativeCounters(scenario.expected.agent_activity, `${scenario.scenario_id}.expected.agent_activity`);
    exactKeys(scenario.projections, ADAPTERS, `${scenario.scenario_id}.projections`);
    for (const adapterId of ADAPTERS) {
      const projection = scenario.projections[adapterId];
      exactKeys(projection, ["profile", "entry"], `${scenario.scenario_id}.projections.${adapterId}`);
      if (typeof projection.profile !== "string" || !projection.profile || typeof projection.entry !== "string" || !projection.entry) throw new Error(`${scenario.scenario_id}.${adapterId} projection requires profile and entry`);
    }
  }
  if (!Array.isArray(fixture.mutation_fixtures) || fixture.mutation_fixtures.length === 0) throw new Error("fixture requires at least one fail-closed mutation fixture");
  const mutationIds = new Set();
  for (const mutation of fixture.mutation_fixtures) {
    exactKeys(mutation, ["mutation_id", "scenario_id", "adapter_id", "remove", "expected_status"], "mutation fixture");
    if (typeof mutation.mutation_id !== "string" || !mutation.mutation_id || mutationIds.has(mutation.mutation_id)) throw new Error("mutation fixture IDs must be unique");
    mutationIds.add(mutation.mutation_id);
    if (!SCENARIO_REQUIREMENTS[mutation.scenario_id] || !ADAPTERS.includes(mutation.adapter_id)) throw new Error(`${mutation.mutation_id} targets an unknown scenario or adapter`);
    identifiers(mutation.remove, `${mutation.mutation_id}.remove`);
    if (mutation.remove.length === 0 || mutation.expected_status !== "fail") throw new Error(`${mutation.mutation_id} must remove bytes and expect fail`);
  }
}

function projectionBytes(adapterId, plan, entry) {
  if (adapterId === "claude_code") return readFileSync(resolve(root, "adapters/claude-code/project/.claude/commands", entry), "utf8");
  const artifact = plan.compactProfileArtifacts.find((item) => item.metadata.prompt_name === entry);
  if (!artifact) throw new Error(`Codex generated prompt bytes are missing for ${entry}`);
  return artifact.content;
}

function mutateBytes(content, mutation, adapterId, scenarioId) {
  if (!mutation || mutation.adapter_id !== adapterId || mutation.scenario_id !== scenarioId) return content;
  let mutated = content;
  for (const removed of mutation.remove) {
    if (!mutated.includes(removed)) throw new Error(`${mutation.mutation_id} removal bytes are absent from generated projection`);
    mutated = mutated.replaceAll(removed, "");
  }
  return mutated;
}

function projectionSemantics(content) {
  const lines = content.split(/\r?\n/);
  return {
    approvalSpecificAction: /approval for (?:that|the) specific action|specific-action approval/iu.test(content),
    stopWithoutApproval: /stop without (?:that )?approval|stop without approval for that specific action/iu.test(content),
    missingEvidenceStop: lines.some((line) => /required evidence is missing.*insufficient_evidence.*stop/iu.test(line) || /\[missing_evidence\].*stop if required/iu.test(line)),
    noImplicitAgentActivity: /do not start or delegate agents unless the request explicitly requires agent activity|\[agent_activity\] opt-in; S\/C\/F counts/iu.test(content),
  };
}

function expectedContract(scenario) {
  return {
    selected_contracts: [...scenario.required_contracts].sort(),
    required_gates: [...scenario.required_gates].sort(),
    approval_required: scenario.expected.approval_required,
    stop_status: scenario.expected.stop_status,
    missing_evidence: [...scenario.expected.missing_evidence].sort(),
    knowledge_promotion: scenario.expected.knowledge_promotion,
    agent_activity: scenario.expected.agent_activity,
  };
}

function normalizedContract(event) {
  return {
    selected_contracts: event.contracts.selected,
    required_gates: event.gates.required,
    approval_required: event.approval.required,
    stop_status: event.stop.status,
    missing_evidence: event.evidence.missing,
    knowledge_promotion: event.knowledge.promotion_requested,
    agent_activity: event.agent_activity,
  };
}

function mismatchFields(actual, expected) {
  return Object.keys(expected).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));
}

function deriveProjectedEvent({ adapterId, scenario, availableContracts, content }) {
  const semantics = projectionSemantics(content);
  const selectedContracts = scenario.required_contracts.filter((contract) => availableContracts.has(contract)).sort();
  const requiredGates = scenario.required_gates.filter((gate) => availableContracts.has(gate)).sort();
  const approvalRequired = scenario.input.risk_action && semantics.approvalSpecificAction && semantics.stopWithoutApproval;
  const missingEvidence = scenario.input.risk_action
    ? approvalRequired ? [...scenario.input.missing_evidence].sort() : []
    : scenario.input.missing_evidence.length > 0 && semantics.missingEvidenceStop
      ? [...scenario.input.missing_evidence].sort()
      : [];
  const stopStatus = scenario.input.risk_action
    ? approvalRequired ? "risk_gate" : "none"
    : missingEvidence.length > 0 ? "insufficient_evidence" : "none";
  const knowledgePromotion = scenario.input.knowledge_promotion_requested
    && availableContracts.has("operating-mode-router")
    && availableContracts.has("domain-rule-ledger");
  const agentActivity = scenario.input.agent_activity_required
    ? { started: 1, completed: 1, failed: 0 }
    : semantics.noImplicitAgentActivity
      ? { started: 0, completed: 0, failed: 0 }
      : { started: 1, completed: 0, failed: 0 };
  const digest = createHash("sha256").update(content).digest("hex");
  return {
    schema_version: "1.0.0",
    event_id: `projection:${adapterId}:${scenario.scenario_id}`,
    task_id: `fixture:${scenario.scenario_id}`,
    adapter_id: adapterId,
    event_type: approvalRequired ? "approval_required" : missingEvidence.length > 0 ? "evidence_status" : "workflow_selection",
    occurred_at: "2000-01-01T00:00:00Z",
    contracts: { selected: selectedContracts, applied: [], application_evidence_level: "projected", missing_evidence: missingEvidence },
    gates: { required: requiredGates, executed: [] },
    approval: { required: approvalRequired, status: approvalRequired ? "missing" : "not_required", action_categories: approvalRequired ? ["risk_gated_action"] : [] },
    evidence: { checked: [`projection_bytes:sha256:${digest}`], missing: missingEvidence },
    agent_activity: agentActivity,
    verification: { attempted: 0, passed: 0, failed: 0, unavailable: 0 },
    stop: { status: stopStatus },
    knowledge: { promotion_requested: knowledgePromotion },
    outcome: { classification: stopStatus === "none" ? "in_progress" : stopStatus, claim_effect: stopStatus === "none" ? "none" : stopStatus === "insufficient_evidence" ? "downgrade" : "block" },
    capability_downgrades: [],
    privacy: { raw_prompts_stored: false, sensitive_payloads_stored: false, external_publication: false },
  };
}

export function evaluateAdapterCrossConformance(fixture, { mutation = null } = {}) {
  validateFixture(fixture);
  const scenarios = fixture.scenarios.map((scenario) => {
    const expected = expectedContract(scenario);
    const results = ADAPTERS.map((adapterId) => {
      const projection = scenario.projections[adapterId];
      const plan = planFor(adapterId, projection.profile);
      const availableContracts = new Set(adapterId === "claude_code" ? plan.selectedSkills : plan.skills);
      const missingContracts = [...new Set([...scenario.required_contracts, ...scenario.required_gates])].filter((contract) => !availableContracts.has(contract)).sort();
      const entries = selectedEntries(adapterId, plan);
      const missingEntry = !entries.includes(projection.entry) ? projection.entry : null;
      const content = mutateBytes(projectionBytes(adapterId, plan, projection.entry), mutation, adapterId, scenario.scenario_id);
      const normalizedEvent = deriveProjectedEvent({ adapterId, scenario, availableContracts, content });
      const schemaErrors = validateAdapterRuntimeEvent(normalizedEvent);
      const contract = normalizedContract(normalizedEvent);
      const semanticMismatches = mismatchFields(contract, expected);
      const status = missingContracts.length === 0 && !missingEntry && schemaErrors.length === 0 && semanticMismatches.length === 0 ? "pass_projected" : "fail";
      return {
        adapter_id: adapterId,
        renderer_profile: projection.profile,
        entry: projection.entry,
        status,
        evidence_level: "projected",
        projection_sha256: normalizedEvent.evidence.checked[0].replace("projection_bytes:", ""),
        missing_contracts: missingContracts,
        missing_entry: missingEntry,
        schema_errors: schemaErrors,
        semantic_mismatches: semanticMismatches,
        normalized_contract: contract,
        normalized_event: normalizedEvent,
        runtime_application_evidence: "unavailable",
        boundary: "Projection-byte conformance does not prove external runtime loading, contract application, business correctness, or no regression.",
      };
    });
    if (JSON.stringify(results[0].normalized_contract) !== JSON.stringify(results[1].normalized_contract)) {
      for (const result of results) {
        result.status = "fail";
        result.semantic_mismatches = [...new Set([...result.semantic_mismatches, "cross_adapter_normalized_contract"])];
      }
    }
    return { scenario_id: scenario.scenario_id, task_class: scenario.task_class, results };
  });
  const failed = scenarios.some((scenario) => scenario.results.some((result) => result.status === "fail"));
  return {
    schema_version: "1.0.0",
    status: failed ? "fail" : "pass_projected",
    evidence_level: "projected",
    adapters: ADAPTERS,
    mutation_id: mutation?.mutation_id ?? null,
    scenarios,
    comparison_rule: "Each adapter derives normalized meaning from its own generated projection bytes before the results are compared.",
    behavioral_conformance: "unavailable",
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const fixture = readFixture(args.fixture);
  const mutation = args.mutation ? fixture.mutation_fixtures?.find((item) => item.mutation_id === args.mutation) : null;
  if (args.mutation && !mutation) throw new Error(`Unknown mutation fixture: ${args.mutation}`);
  const report = evaluateAdapterCrossConformance(fixture, { mutation });
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`ASK cross-adapter conformance: ${report.status}`);
    console.log(`Evidence level: ${report.evidence_level}`);
    for (const scenario of report.scenarios) console.log(`- ${scenario.scenario_id}: ${scenario.results.map((result) => `${result.adapter_id}=${result.status}`).join(", ")}`);
    console.log("Boundary: behavioral runtime conformance remains unavailable until bounded external runtime runs are captured.");
  }
  process.exitCode = report.status === "fail" ? 1 : 0;
} catch (error) {
  const report = { schema_version: "1.0.0", status: "fail", evidence_level: "none", error: error.message, scenarios: [] };
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else console.error(`adapter-cross-conformance failed: ${error.message}`);
  process.exitCode = 1;
}
