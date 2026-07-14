#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultFixture = resolve(root, "docs/fixtures/adapter-cross-conformance.json");

function parseArgs(argv) {
  const args = { fixture: defaultFixture, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") args.fixture = argv[++index];
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/adapter-cross-conformance.mjs [--fixture <path|->] [--json]");
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

function normalizeContract(scenario) {
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

function validateFixture(fixture) {
  if (fixture?.schema_version !== "1.0.0") throw new Error("fixture schema_version must be 1.0.0");
  if (!Array.isArray(fixture.scenarios) || fixture.scenarios.length !== 9) throw new Error("fixture must contain the nine required #179 scenarios");
  const ids = fixture.scenarios.map((scenario) => scenario.scenario_id);
  if (new Set(ids).size !== ids.length) throw new Error("scenario_id values must be unique");
  for (const scenario of fixture.scenarios) {
    if (!Array.isArray(scenario.required_contracts) || !Array.isArray(scenario.required_gates)) throw new Error(`${scenario.scenario_id} contract lists are invalid`);
    if (!scenario.expected || !Array.isArray(scenario.expected.missing_evidence)) throw new Error(`${scenario.scenario_id} normalized expectation is invalid`);
    for (const adapterId of fixture.adapters) if (!scenario.projections?.[adapterId]) throw new Error(`${scenario.scenario_id} is missing ${adapterId} projection input`);
  }
}

export function evaluateAdapterCrossConformance(fixture) {
  validateFixture(fixture);
  const scenarios = fixture.scenarios.map((scenario) => {
    const normalizedContract = normalizeContract(scenario);
    const results = fixture.adapters.map((adapterId) => {
      const projection = scenario.projections[adapterId];
      const plan = planFor(adapterId, projection.profile);
      const availableContracts = new Set(adapterId === "claude_code" ? plan.selectedSkills : plan.skills);
      const missingContracts = [...new Set([...scenario.required_contracts, ...scenario.required_gates])]
        .filter((contract) => !availableContracts.has(contract))
        .sort();
      const entries = selectedEntries(adapterId, plan);
      const missingEntry = projection.entry && !entries.includes(projection.entry) ? projection.entry : null;
      return {
        adapter_id: adapterId,
        renderer_profile: projection.profile,
        entry: projection.entry,
        status: missingContracts.length === 0 && !missingEntry ? "pass_projected" : "fail",
        evidence_level: "projected",
        missing_contracts: missingContracts,
        missing_entry: missingEntry,
        normalized_contract: normalizedContract,
        runtime_application_evidence: "unavailable",
        boundary: "Projection conformance does not prove external runtime loading, contract application, business correctness, or no regression.",
      };
    });
    return { scenario_id: scenario.scenario_id, task_class: scenario.task_class, results };
  });
  const failed = scenarios.some((scenario) => scenario.results.some((result) => result.status === "fail"));
  return {
    schema_version: "1.0.0",
    status: failed ? "fail" : "pass_projected",
    evidence_level: "projected",
    adapters: fixture.adapters,
    scenarios,
    comparison_rule: "Equivalent normalized contract satisfaction is required; identical internal traces are not required.",
    behavioral_conformance: "unavailable",
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = evaluateAdapterCrossConformance(readFixture(args.fixture));
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`ASK cross-adapter conformance: ${report.status}`);
    console.log(`Evidence level: ${report.evidence_level}`);
    for (const scenario of report.scenarios) {
      console.log(`- ${scenario.scenario_id}: ${scenario.results.map((result) => `${result.adapter_id}=${result.status}`).join(", ")}`);
    }
    console.log("Boundary: behavioral runtime conformance remains unavailable until bounded external runtime runs are captured.");
  }
  process.exitCode = report.status === "fail" ? 1 : 0;
} catch (error) {
  const report = { schema_version: "1.0.0", status: "fail", evidence_level: "none", error: error.message, scenarios: [] };
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else console.error(`adapter-cross-conformance failed: ${error.message}`);
  process.exitCode = 1;
}
