#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { validateAdapterRuntimeEvent } from "./adapter-runtime-event.mjs";
import { parseCodexCompactProfileHeader } from "./ask-shared.mjs";
import { selectClaimEvidenceMode } from "./claim-evidence-status.mjs";
import {
  COMPACT_ELIGIBILITY_FACT_IDS,
  FORMAL_VERIFICATION_TRIGGER_IDS,
  VERIFICATION_PROOF_POLICY_REF,
  VERIFICATION_PROOF_PATHS,
  selectVerificationProofPath,
} from "./verification-proof-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultFixture = resolve(root, "docs/fixtures/adapter-cross-conformance.json");
const ADAPTERS = ["claude_code", "codex"];
const SCENARIO_REQUIREMENTS = Object.freeze({
  localized_implementation: { taskClass: "implementation", contracts: ["controlled-implementation", "test-first-verification"], gates: [] },
  new_behavior_with_verification: { taskClass: "implementation", contracts: ["controlled-implementation", "test-first-verification"], gates: [] },
  unknown_root_cause_investigation: { taskClass: "investigation", contracts: ["doubt-driven-development", "test-first-verification"], gates: [] },
  pr_review_selective_gates: { taskClass: "review", contracts: ["review-router", "review-final-merge-gate", "evidence-ledger"], gates: ["review-router", "review-final-merge-gate"] },
  destructive_external_action: { taskClass: "risk-gated", contracts: ["risk-gate", "evidence-ledger"], gates: ["risk-gate"] },
  missing_repository_diff_test_evidence: { taskClass: "review", contracts: ["review-router"], gates: ["review-router"] },
  handoff_resume_state: { taskClass: "handoff", contracts: ["handoff-generation"], gates: [] },
  explicit_knowledge_promotion: { taskClass: "knowledge", contracts: ["operating-mode-router", "domain-rule-ledger", "evidence-ledger"], gates: [] },
  lightweight_no_heavy_routing_or_agents: { taskClass: "implementation", contracts: ["controlled-implementation"], gates: [] },
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
  exactKeys(fixture, ["schema_version", "adapters", "normalized_event_schema_ref", "verification_proof_policy_ref", "scenarios", "mutation_fixtures"], "fixture");
  if (fixture.schema_version !== "1.1.0") throw new Error("fixture schema_version must be 1.1.0");
  if (JSON.stringify(fixture.adapters) !== JSON.stringify(ADAPTERS)) throw new Error("fixture adapters must be exactly claude_code, codex");
  if (fixture.normalized_event_schema_ref !== "schemas/adapter-runtime-event.schema.json") throw new Error("fixture normalized_event_schema_ref must reference the canonical adapter runtime event schema");
  if (fixture.verification_proof_policy_ref !== VERIFICATION_PROOF_POLICY_REF) throw new Error("fixture must reference the canonical verification proof policy");
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
    exactKeys(scenario.input, ["risk_action", "missing_evidence", "knowledge_promotion_requested", "agent_activity_required", "verification_required", "review_final_gate_required", "handoff_required", "formal_evidence_trigger_ids", "verification_proof"], `${scenario.scenario_id}.input`);
    for (const flag of ["risk_action", "knowledge_promotion_requested", "agent_activity_required", "verification_required", "review_final_gate_required", "handoff_required"]) if (typeof scenario.input[flag] !== "boolean") throw new Error(`${scenario.scenario_id}.${flag} must be boolean`);
    identifiers(scenario.input.missing_evidence, `${scenario.scenario_id}.input.missing_evidence`);
    identifiers(scenario.input.formal_evidence_trigger_ids, `${scenario.scenario_id}.input.formal_evidence_trigger_ids`);
    exactKeys(scenario.input.verification_proof, ["applies", "compact_eligibility_fact_ids", "formal_trigger_ids"], `${scenario.scenario_id}.input.verification_proof`);
    if (typeof scenario.input.verification_proof.applies !== "boolean") throw new Error(`${scenario.scenario_id}.input.verification_proof.applies must be boolean`);
    identifiers(scenario.input.verification_proof.compact_eligibility_fact_ids, `${scenario.scenario_id}.input.verification_proof.compact_eligibility_fact_ids`);
    identifiers(scenario.input.verification_proof.formal_trigger_ids, `${scenario.scenario_id}.input.verification_proof.formal_trigger_ids`);
    const eligibilityFacts = scenario.input.verification_proof.compact_eligibility_fact_ids.map((fact_id) => ({ fact_id, evidence_refs: [`fixture:${scenario.scenario_id}:${fact_id}`] }));
    const formalTriggers = scenario.input.verification_proof.formal_trigger_ids.map((trigger_id) => ({ trigger_id, evidence_refs: [`fixture:${scenario.scenario_id}:${trigger_id}`] }));
    const selectedProofPath = scenario.input.verification_proof.applies
      ? selectVerificationProofPath({ eligibility_facts: eligibilityFacts, formal_triggers: formalTriggers })
      : null;
    if (!scenario.input.verification_proof.applies && (eligibilityFacts.length > 0 || formalTriggers.length > 0)) throw new Error(`${scenario.scenario_id} non-applicable verification proof input must not carry facts or triggers`);
    exactKeys(scenario.expected, ["approval_required", "stop_status", "missing_evidence", "knowledge_promotion", "verification_obligation", "verification_proof_path", "review_final_gate", "handoff_executable", "claim_evidence_mode", "agent_activity"], `${scenario.scenario_id}.expected`);
    for (const flag of ["approval_required", "knowledge_promotion", "verification_obligation", "review_final_gate", "handoff_executable"]) if (typeof scenario.expected[flag] !== "boolean") throw new Error(`${scenario.scenario_id}.${flag} must be boolean`);
    if (!STOP_STATUSES.has(scenario.expected.stop_status)) throw new Error(`${scenario.scenario_id}.stop_status has an invalid enum`);
    if (scenario.expected.verification_proof_path !== selectedProofPath) throw new Error(`${scenario.scenario_id} verification proof path must match the canonical selection`);
    if (!["inline", "formal_ledger"].includes(scenario.expected.claim_evidence_mode)) throw new Error(`${scenario.scenario_id}.claim_evidence_mode has an invalid enum`);
    if (scenario.expected.claim_evidence_mode !== selectClaimEvidenceMode(scenario.input.formal_evidence_trigger_ids)) throw new Error(`${scenario.scenario_id} claim evidence mode must match its formal-audit trigger IDs`);
    identifiers(scenario.expected.missing_evidence, `${scenario.scenario_id}.expected.missing_evidence`);
    nonNegativeCounters(scenario.expected.agent_activity, `${scenario.scenario_id}.expected.agent_activity`);
    exactKeys(scenario.projections, ADAPTERS, `${scenario.scenario_id}.projections`);
    for (const adapterId of ADAPTERS) {
      const projection = scenario.projections[adapterId];
      exactKeys(projection, ["profile", "entry", "verification_proof_policy_ref", "verification_proof_paths"], `${scenario.scenario_id}.projections.${adapterId}`);
      if (typeof projection.profile !== "string" || !projection.profile || typeof projection.entry !== "string" || !projection.entry) throw new Error(`${scenario.scenario_id}.${adapterId} projection requires profile and entry`);
      if (projection.verification_proof_policy_ref !== null && projection.verification_proof_policy_ref !== VERIFICATION_PROOF_POLICY_REF) throw new Error(`${scenario.scenario_id}.${adapterId} projection has an invalid verification proof policy ref`);
      identifiers(projection.verification_proof_paths, `${scenario.scenario_id}.projections.${adapterId}.verification_proof_paths`);
      if (projection.verification_proof_policy_ref === null && projection.verification_proof_paths.length > 0) throw new Error(`${scenario.scenario_id}.${adapterId} projection paths require the canonical verification proof policy`);
      if (projection.verification_proof_policy_ref !== null && JSON.stringify(projection.verification_proof_paths) !== JSON.stringify(VERIFICATION_PROOF_PATHS)) throw new Error(`${scenario.scenario_id}.${adapterId} projection must expose both verification proof paths`);
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

function projectionSemantics(adapterId, content) {
  const lines = content.split(/\r?\n/);
  const header = adapterId === "codex" ? parseCodexCompactProfileHeader(content) : null;
  const canonicalReferences = adapterId === "codex"
    ? header?.requested_contracts ?? []
    : [...content.matchAll(/(?:^|[\s`])\/([a-z][a-z0-9-]*)/gmu)].map((match) => match[1]);
  const formalLedgerConditional = adapterId === "codex"
    ? /ask\.claim-evidence-status@1\.0\.0.*inline.*formal\[audit\|multi-claim\|high-stakes\|cross-revision\|stable-IDs\]=>evidence-ledger/iu.test(content)
    : /ask\.claim-evidence-status@1\.0\.0[\s\S]{0,240}\/evidence-ledger[\s\S]{0,160}(?:only when|stable_claim_ids)[\s\S]{0,120}formal_ledger|\/evidence-ledger[\s\S]{0,160}(?:only when|stable_claim_ids)[\s\S]{0,120}formal_ledger/iu.test(content);
  const formalLedgerReferenced = canonicalReferences.includes("evidence-ledger") || formalLedgerConditional;
  const formalLedgerUnconditional = canonicalReferences.includes("evidence-ledger") && !formalLedgerConditional;
  const contracts = [...new Set(canonicalReferences.filter((contract) => contract !== "evidence-ledger" || formalLedgerUnconditional))].sort();
  const controlIds = adapterId === "codex" ? header?.control_ids ?? [] : [];
  const verificationProofPolicyRef = content.includes(VERIFICATION_PROOF_POLICY_REF) ? VERIFICATION_PROOF_POLICY_REF : null;
  const verificationProofPaths = VERIFICATION_PROOF_PATHS.filter((path) => content.includes(path));
  return {
    contracts,
    formalLedgerConditional,
    formalLedgerReferenced,
    formalLedgerUnconditional,
    controlIds,
    approvalSpecificAction: /approval for (?:that|the) specific action|specific-action approval/iu.test(content),
    stopWithoutApproval: /stop without (?:that )?approval|stop without approval for that specific action/iu.test(content),
    missingEvidenceStop: lines.some((line) => /required evidence is missing.*insufficient_evidence.*stop/iu.test(line) || /\[missing_evidence\].*(?:stop if required|required => stop)/iu.test(line)),
    noImplicitAgentActivity: /do not start or delegate agents unless the request explicitly requires agent activity|\[agent_activity\] opt-in; S\/C\/F counts/iu.test(content),
    verificationProofPolicyRef,
    verificationProofPaths,
    verificationObligation: contracts.includes("test-first-verification")
      && verificationProofPolicyRef === VERIFICATION_PROOF_POLICY_REF
      && VERIFICATION_PROOF_PATHS.every((path) => verificationProofPaths.includes(path))
      && (adapterId === "claude_code" ? /Compact Proof|Verification Contract|verify the observable behavior/iu.test(content) : controlIds.includes("verification") && /\[verification\].*behavior change.*exact results/iu.test(content)),
    reviewFinalGate: contracts.includes("review-final-merge-gate") && /final.merge.gate|Decision:/iu.test(content),
    handoffExecutable: contracts.includes("handoff-generation") && /handoff must be executable|\[handoff\] executable state/iu.test(content),
    knowledgePromotion: contracts.includes("operating-mode-router") && contracts.includes("domain-rule-ledger") && /explicit knowledge.promotion|\[knowledge_promotion\]/iu.test(content),
  };
}

function semanticsForResult(content, adapterId, scenario) {
  const semantics = projectionSemantics(adapterId, content);
  const mismatches = [];
  if (!content.includes("ask.claim-evidence-status@1.0.0")) mismatches.push("claim_evidence_contract_revision");
  if (!semantics.formalLedgerConditional) mismatches.push("formal_ledger_conditional_route");
  if (semantics.formalLedgerUnconditional) mismatches.push("formal_ledger_overactivated");
  if (selectClaimEvidenceMode(scenario.input.formal_evidence_trigger_ids) === "formal_ledger" && !semantics.formalLedgerReferenced) mismatches.push("formal_ledger_required");
  const projection = scenario.projections[adapterId];
  if (projection.verification_proof_policy_ref !== null && semantics.verificationProofPolicyRef !== projection.verification_proof_policy_ref) mismatches.push("verification_proof_policy_ref");
  const missingProofPaths = projection.verification_proof_policy_ref === null
    ? []
    : projection.verification_proof_paths.filter((path) => !semantics.verificationProofPaths.includes(path));
  const canonicalPath = scenario.expected.verification_proof_path;
  if (missingProofPaths.length > 0) {
    if (canonicalPath === "compact_proof" && missingProofPaths.includes("compact_proof") && semantics.verificationProofPaths.includes("formal_verification_contract")) mismatches.push("verification_proof_path_overactivated");
    else mismatches.push("verification_proof_path_missing");
  }
  return mismatches;
}

function expectedContract(scenario) {
  return {
    selected_contracts: [...scenario.required_contracts].sort(),
    required_gates: [...scenario.required_gates].sort(),
    approval_required: scenario.expected.approval_required,
    stop_status: scenario.expected.stop_status,
    missing_evidence: [...scenario.expected.missing_evidence].sort(),
    knowledge_promotion: scenario.expected.knowledge_promotion,
    verification_obligation: scenario.expected.verification_obligation,
    verification_proof_path: scenario.expected.verification_proof_path,
    verification_proof_policy_ref: scenario.expected.verification_proof_path ? VERIFICATION_PROOF_POLICY_REF : null,
    review_final_gate: scenario.expected.review_final_gate,
    handoff_executable: scenario.expected.handoff_executable,
    claim_evidence_mode: scenario.expected.claim_evidence_mode,
    agent_activity: scenario.expected.agent_activity,
  };
}

function normalizedContract(event, scenario, semantics) {
  let verificationProofPath = null;
  let verificationProofPolicyRef = null;
  if (scenario.input.verification_proof.applies && semantics.verificationProofPolicyRef === VERIFICATION_PROOF_POLICY_REF) {
    const eligibilityFacts = scenario.input.verification_proof.compact_eligibility_fact_ids.map((fact_id) => ({ fact_id, evidence_refs: [`fixture:${scenario.scenario_id}:${fact_id}`] }));
    const formalTriggers = scenario.input.verification_proof.formal_trigger_ids.map((trigger_id) => ({ trigger_id, evidence_refs: [`fixture:${scenario.scenario_id}:${trigger_id}`] }));
    const selected = selectVerificationProofPath({ eligibility_facts: eligibilityFacts, formal_triggers: formalTriggers });
    if (semantics.verificationProofPaths.includes(selected)) verificationProofPath = selected;
    else if (selected === "compact_proof" && semantics.verificationProofPaths.includes("formal_verification_contract")) verificationProofPath = "formal_verification_contract";
    verificationProofPolicyRef = verificationProofPath ? VERIFICATION_PROOF_POLICY_REF : null;
  }
  return {
    selected_contracts: event.contracts.selected,
    required_gates: event.gates.required,
    approval_required: event.approval.required,
    stop_status: event.stop.status,
    missing_evidence: event.evidence.missing,
    knowledge_promotion: event.knowledge.promotion_requested,
    verification_obligation: event.verification.obligation_required,
    verification_proof_path: verificationProofPath,
    verification_proof_policy_ref: verificationProofPolicyRef,
    review_final_gate: event.review.final_gate_required,
    handoff_executable: event.handoff.executable_state_required,
    claim_evidence_mode: event.contracts.selected.includes("evidence-ledger") ? "formal_ledger" : "inline",
    agent_activity: event.agent_activity,
  };
}

function mismatchFields(actual, expected) {
  return Object.keys(expected).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));
}

function deriveProjectedEvent({ adapterId, scenario, content }) {
  const semantics = projectionSemantics(adapterId, content);
  const selectedContracts = scenario.required_contracts.filter((contract) => contract === "evidence-ledger"
    ? selectClaimEvidenceMode(scenario.input.formal_evidence_trigger_ids) === "formal_ledger" && semantics.formalLedgerReferenced
    : semantics.contracts.includes(contract)).sort();
  const requiredGates = scenario.required_gates.filter((gate) => semantics.contracts.includes(gate)).sort();
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
    && semantics.knowledgePromotion;
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
    verification: { obligation_required: scenario.input.verification_required && semantics.verificationObligation, attempted: 0, passed: 0, failed: 0, unavailable: 0 },
    review: { final_gate_required: scenario.input.review_final_gate_required && semantics.reviewFinalGate },
    handoff: { executable_state_required: scenario.input.handoff_required && semantics.handoffExecutable },
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
      const semantics = projectionSemantics(adapterId, content);
      const normalizedEvent = deriveProjectedEvent({ adapterId, scenario, content });
      const schemaErrors = validateAdapterRuntimeEvent(normalizedEvent);
      const contract = normalizedContract(normalizedEvent, scenario, semantics);
      const activationMismatches = semanticsForResult(content, adapterId, scenario);
      const semanticMismatches = [...new Set([...mismatchFields(contract, expected), ...activationMismatches])];
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
