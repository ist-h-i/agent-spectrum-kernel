import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_PROMPT_CONTRACTS, parseCodexCompactProfileHeader } from "./ask-shared.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTROL_MAP_PATH = "schemas/compact-profile-control-map.json";
const ROUTE_BASELINE_PATH = "docs/fixtures/codex-compact-route-baseline.json";
const PRE_COMPACT_PROMPT_ROOT = "docs/fixtures/codex-pre-compact-prompts";
const CONTROL_PLACEHOLDER = "{{ASK_COMPACT_CONTROLS}}";
const DIRECT_TRIGGER_PLACEHOLDER = "{{ASK_COMPACT_DIRECT_TRIGGERS}}";
const SUPPORTED_CONTROL_IDS = ["scope", "verification", "risk_approval", "evidence", "missing_evidence", "output"];
const COMMON_CANONICAL_SOURCES = [
  "AGENTS.md",
  "docs/execution-envelope-contract.md",
  CONTROL_MAP_PATH,
  "skills/evidence-ledger/SKILL.md",
  "skills/risk-gate/SKILL.md",
  "skills/scope-control/SKILL.md",
  "skills/test-first-verification/SKILL.md",
];

export const CODEX_COMPACT_PROFILE_DEFINITIONS = Object.freeze({
  "skill-implement.md": Object.freeze({
    profileId: "codex-implementation-compact-v1",
    taskClass: "implementation",
    primarySkill: "controlled-implementation",
    requestedContracts: ["controlled-implementation", "test-first-verification", "evidence-ledger", "risk-gate"],
    canonicalSources: ["docs/lifecycle-artifact-contract.md", "skills/controlled-implementation/SKILL.md"],
  }),
  "skill-investigate.md": Object.freeze({
    profileId: "codex-investigation-compact-v1",
    taskClass: "investigation",
    primarySkill: "doubt-driven-development",
    requestedContracts: ["doubt-driven-development", "test-first-verification", "controlled-implementation", "evidence-ledger", "risk-gate"],
    canonicalSources: ["skills/doubt-driven-development/SKILL.md", "skills/controlled-implementation/SKILL.md"],
  }),
  "skill-review.md": Object.freeze({
    profileId: "codex-review-compact-v1",
    taskClass: "review",
    primarySkill: "review-router",
    requestedContracts: ["review-router", "review-final-merge-gate", "evidence-ledger", "risk-gate"],
    canonicalSources: ["docs/lifecycle-traceability-contract.md", "schemas/review-signal-gate-map.json", "skills/review-router/SKILL.md", "skills/review-final-merge-gate/SKILL.md"],
  }),
  "skill-verify.md": Object.freeze({
    profileId: "codex-verification-compact-v1",
    taskClass: "verification",
    primarySkill: "test-first-verification",
    requestedContracts: ["test-first-verification", "evidence-ledger", "risk-gate"],
    canonicalSources: ["docs/lifecycle-artifact-contract.md"],
  }),
  "skill-handoff.md": Object.freeze({
    profileId: "codex-handoff-compact-v1",
    taskClass: "handoff",
    primarySkill: "handoff-generation",
    requestedContracts: ["handoff-generation", "evidence-ledger", "risk-gate"],
    canonicalSources: ["docs/agent-session-state-contract.md", "skills/handoff-generation/SKILL.md"],
  }),
});

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalRevision() {
  const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, "manifest.json"), "utf8"));
  if (typeof manifest.version !== "string" || !manifest.version) throw new Error("manifest.json version is required for Codex compact profiles");
  return `ask-${manifest.version}`;
}

function readControlMap() {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, CONTROL_MAP_PATH), "utf8"));
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value ?? {}).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} fields changed without renderer support: expected ${expected.join(", ")}, received ${actual.join(", ")}`);
}

function assertArrayEquals(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} does not match the canonical compact control contract`);
}

export function validateCodexCompactControlMap(controlMap = readControlMap()) {
  if (controlMap?.registry_version !== 1) throw new Error("compact control map registry_version must be 1");
  assertArrayEquals(controlMap.required_control_ids, SUPPORTED_CONTROL_IDS, "required_control_ids");
  assertExactKeys(controlMap.controls, SUPPORTED_CONTROL_IDS, "controls");

  const scope = controlMap.controls.scope;
  assertExactKeys(scope, ["source_refs", "required_inputs", "missing_input_behavior", "change_boundary", "cleanup_boundary"], "scope control");
  if (!Array.isArray(scope.source_refs) || !Array.isArray(scope.required_inputs) || scope.required_inputs.length === 0) throw new Error("scope control requires source_refs and required_inputs");
  if (scope.missing_input_behavior !== "stop_or_insufficient_evidence" || scope.change_boundary !== "smallest_task_required" || scope.cleanup_boundary !== "separate") throw new Error("scope control weakens canonical stop or change-boundary semantics");

  const verification = controlMap.controls.verification;
  assertExactKeys(verification, ["source_refs", "verification_contract_before_behavior_change", "focused_check_first", "broader_checks_proportional_to_risk", "exact_results_required"], "verification control");
  for (const field of ["verification_contract_before_behavior_change", "focused_check_first", "broader_checks_proportional_to_risk", "exact_results_required"]) if (verification[field] !== true) throw new Error(`verification control requires ${field}`);

  const risk = controlMap.controls.risk_approval;
  const riskBooleanFields = ["exact_action_required", "risk_type_required", "potential_impact_required", "reversibility_required", "external_visibility_required", "safer_alternative_required", "preconditions_required", "stop_without_approval"];
  assertExactKeys(risk, ["source_refs", ...riskBooleanFields, "approval_scope", "execution_scope"], "risk_approval control");
  for (const field of riskBooleanFields) if (risk[field] !== true) throw new Error(`risk_approval control requires ${field}`);
  if (risk.approval_scope !== "specific_action" || risk.execution_scope !== "approved_action_only") throw new Error("risk_approval control requires specific-action approval and approved-action-only execution");

  const evidence = controlMap.controls.evidence;
  assertExactKeys(evidence, ["source_refs", "truth_statuses", "claims_require_evidence", "unsupported_claim_behavior"], "evidence control");
  assertArrayEquals(evidence.truth_statuses, ["Verified", "Supported", "Hypothesis", "Unknown", "Falsified"], "evidence truth_statuses");
  if (evidence.claims_require_evidence !== true || evidence.unsupported_claim_behavior !== "downgrade") throw new Error("evidence control must require evidence and downgrade unsupported claims");

  const missing = controlMap.controls.missing_evidence;
  assertExactKeys(missing, ["source_refs", "allowed_statuses", "inference", "stop_when_required"], "missing_evidence control");
  assertArrayEquals(missing.allowed_statuses, ["unavailable", "insufficient_evidence"], "missing_evidence statuses");
  if (missing.inference !== "prohibited" || missing.stop_when_required !== true) throw new Error("missing_evidence control must prohibit inference and stop when evidence is required");

  const output = controlMap.controls.output;
  assertExactKeys(output, ["source_refs", "required_sections_from_prompt_contract", "execution_envelope_count", "next_action_location"], "output control");
  if (output.required_sections_from_prompt_contract !== true || output.execution_envelope_count !== 1 || output.next_action_location !== "execution_envelope_only") throw new Error("output control must use prompt-contract sections and one Execution Envelope");

  const expectedClasses = ["implementation", "investigation", "review", "verification", "handoff"];
  assertExactKeys(controlMap.direct_triggers, expectedClasses, "direct_triggers");
  for (const [taskClass, triggers] of Object.entries(controlMap.direct_triggers)) {
    if (!Array.isArray(triggers)) throw new Error(`${taskClass} direct triggers must be an array`);
    const ids = new Set();
    for (const trigger of triggers) {
      assertExactKeys(trigger, ["id", "signal", "contract", "action", "missing_contract_behavior"], `${taskClass} direct trigger`);
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(trigger.id) || ids.has(trigger.id)) throw new Error(`${taskClass} direct trigger IDs must be unique controlled identifiers`);
      ids.add(trigger.id);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(trigger.contract) || !trigger.signal) throw new Error(`${taskClass} direct trigger requires a signal and canonical contract`);
      if (trigger.action !== "apply_before_primary" || trigger.missing_contract_behavior !== "capability_missing") throw new Error(`${taskClass} direct trigger must apply before primary and fail closed when unavailable`);
    }
  }
  return controlMap;
}

function renderControl(controlId, control) {
  if (controlId === "scope") return "[scope] Read workspace/code/tests/docs/public contract; missing required input => stop/insufficient_evidence; smallest diff; cleanup separate.";
  if (controlId === "verification") return "[verification] Contract before behavior change; focused first; broader by risk; exact results.";
  if (controlId === "risk_approval") return "[risk_approval] Name exact action/risk type/impact/reversibility/external visibility, safer alternative, and preconditions. Stop without approval for that specific action; execute only it.";
  if (controlId === "evidence") return `[evidence] ${control.truth_statuses.join("/")}; claims need evidence; otherwise downgrade.`;
  if (controlId === "missing_evidence") return "[missing_evidence] unavailable/insufficient_evidence; no inference; stop if required.";
  if (controlId === "output") return "[output] Required sections + one Execution Envelope; next_action only there.";
  throw new Error(`compact control has no renderer: ${controlId}`);
}

function renderControls(controlMap) {
  return [
    "Generated critical controls (apply if Skill load is unavailable):",
    "",
    ...controlMap.required_control_ids.map((controlId) => `- ${renderControl(controlId, controlMap.controls[controlId])}`),
  ].join("\n");
}

export function validateRenderedCodexCompactControls(content, controlMap = readControlMap()) {
  const validatedControlMap = validateCodexCompactControlMap(controlMap);
  for (const controlId of validatedControlMap.required_control_ids) {
    const expected = `- ${renderControl(controlId, validatedControlMap.controls[controlId])}`;
    if (!content.includes(expected)) throw new Error(`rendered compact profile does not preserve canonical ${controlId} semantics`);
  }
}

function renderDirectTriggers(triggers) {
  if (triggers.length === 0) return "Direct conditional contracts: none beyond the fixed primary contract for this entry.";
  return [
    "Generated direct conditional contracts:",
    "",
    ...triggers.map((trigger) => `- \`${trigger.id}\` => \`${trigger.contract}\` before primary when ${trigger.signal}; missing => \`capability_missing\`.`),
  ].join("\n");
}

function validatePromptTemplate(promptName, body, definition) {
  const contract = CODEX_PROMPT_CONTRACTS[promptName];
  if (!contract) throw new Error(`Codex compact profile has no prompt contract: ${promptName}`);
  if (!body.includes(`Primary contract: \`${definition.primarySkill}\``)) throw new Error(`${promptName} must name its primary canonical contract`);
  if (body.includes("operating-mode-router") || body.includes("skill-router")) throw new Error(`${promptName} must not route through upper routers after entry mode is fixed`);
  if ((body.match(new RegExp(CONTROL_PLACEHOLDER, "g")) ?? []).length !== 1) throw new Error(`${promptName} must contain one generated-control placeholder`);
  if ((body.match(new RegExp(DIRECT_TRIGGER_PLACEHOLDER, "g")) ?? []).length !== 1) throw new Error(`${promptName} must contain one direct-trigger placeholder`);
  if (/\[(?:scope|verification|risk_approval|evidence|missing_evidence|output)\]/u.test(body)) throw new Error(`${promptName} must not hand-maintain canonical fallback controls`);
  for (const section of contract.requiredSections) if (!body.includes(section)) throw new Error(`${promptName} is missing required output evidence section: ${section}`);
  if (!body.includes("$ARGUMENTS")) throw new Error(`${promptName} must retain the Codex argument placeholder`);
}

export function codexDirectTriggersForPrompt(promptName, controlMap = readControlMap()) {
  const definition = CODEX_COMPACT_PROFILE_DEFINITIONS[promptName];
  if (!definition) return [];
  const validated = validateCodexCompactControlMap(controlMap);
  return validated.direct_triggers[definition.taskClass].map((trigger) => ({ ...trigger }));
}

export function codexCompactProfileCanonicalPaths(promptName, controlMap = readControlMap()) {
  const definition = CODEX_COMPACT_PROFILE_DEFINITIONS[promptName];
  if (!definition) return [];
  const triggers = codexDirectTriggersForPrompt(promptName, controlMap);
  return [...new Set([...COMMON_CANONICAL_SOURCES, ...definition.canonicalSources, ...triggers.map((trigger) => `skills/${trigger.contract}/SKILL.md`)])].sort();
}

export function renderCodexCompactProfile(promptName, {
  sourceBody = null,
  canonicalContract,
  profileFingerprint,
  controlMap = readControlMap(),
} = {}) {
  const definition = CODEX_COMPACT_PROFILE_DEFINITIONS[promptName];
  if (!definition) throw new Error(`Unknown Codex compact profile prompt: ${promptName}`);
  if (!canonicalContract?.revision || !canonicalContract?.source_digest || !Array.isArray(canonicalContract?.source_paths) || !profileFingerprint) throw new Error("Codex compact profile requires the shared adapter profile canonical contract and profile fingerprint");
  const validatedControlMap = validateCodexCompactControlMap(controlMap);
  const body = sourceBody ?? readFileSync(resolve(REPO_ROOT, "adapters", "codex", "prompts", promptName), "utf8");
  validatePromptTemplate(promptName, body, definition);
  const triggers = validatedControlMap.direct_triggers[definition.taskClass];
  const renderedBody = body
    .replace(CONTROL_PLACEHOLDER, renderControls(validatedControlMap))
    .replace(DIRECT_TRIGGER_PLACEHOLDER, renderDirectTriggers(triggers));
  validateRenderedCodexCompactControls(renderedBody, validatedControlMap);
  const metadata = {
    schema_version: "1.1.0",
    profile_id: definition.profileId,
    prompt_name: promptName,
    mode: CODEX_PROMPT_CONTRACTS[promptName].mode,
    task_class: definition.taskClass,
    primary_contract: definition.primarySkill,
    requested_contracts: definition.requestedContracts,
    control_ids: validatedControlMap.required_control_ids,
    direct_trigger_ids: triggers.map((trigger) => trigger.id),
    canonical_revision: canonicalContract.revision,
    canonical_source_digest: canonicalContract.source_digest,
    profile_fingerprint: profileFingerprint,
  };
  const header = `<!-- ASK_CODEX_COMPACT_PROFILE ${JSON.stringify({
    v: metadata.schema_version,
    id: metadata.profile_id,
    revision: metadata.canonical_revision,
    source_digest: metadata.canonical_source_digest,
    profile_fingerprint: metadata.profile_fingerprint,
  })} -->`;
  const content = `${header}\n${renderedBody.trim()}\n`;
  return {
    content,
    metadata: {
      ...metadata,
      rendered_sha256: sha256(content),
      rendered_bytes: Buffer.byteLength(content),
    },
  };
}

export function measureCodexCompactProfiles(profiles) {
  const routeFixture = JSON.parse(readFileSync(resolve(REPO_ROOT, ROUTE_BASELINE_PATH), "utf8"));
  const routeByPrompt = new Map(routeFixture.profiles.map((profile) => [profile.prompt_name, profile]));
  const measured = profiles.map((profile) => {
    const route = routeByPrompt.get(profile.prompt_name);
    if (!route) throw new Error(`Codex route baseline is missing ${profile.prompt_name}`);
    const baselinePath = resolve(REPO_ROOT, PRE_COMPACT_PROMPT_ROOT, profile.prompt_name);
    const baselineBytes = readFileSync(baselinePath);
    if (sha256(baselineBytes) !== route.pre_compact_sha256) throw new Error(`immutable pre-compact prompt fixture drifted: ${profile.prompt_name}`);
    return {
      ...profile,
      baseline_fixture: `${PRE_COMPACT_PROMPT_ROOT}/${profile.prompt_name}`,
      baseline_bytes: baselineBytes.length,
      baseline_route_depth: route.pre_compact_stages.length,
      route_depth: route.compact_stages.length,
      route_fixture: ROUTE_BASELINE_PATH,
    };
  });
  return {
    profiles: measured,
    baseline_bytes: measured.reduce((total, profile) => total + profile.baseline_bytes, 0),
    rendered_bytes: measured.reduce((total, profile) => total + profile.rendered_bytes, 0),
    baseline_route_depth: measured.reduce((total, profile) => total + profile.baseline_route_depth, 0),
    route_depth: measured.reduce((total, profile) => total + profile.route_depth, 0),
  };
}

export function codexCompactCanonicalContractForPaths(paths) {
  return { revision: canonicalRevision(), source_paths: [...new Set(paths)].sort() };
}

export { parseCodexCompactProfileHeader };
