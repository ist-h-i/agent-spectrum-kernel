import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAIM_EVIDENCE_CONTRACT_REF,
  FORMAL_EVIDENCE_LEDGER_DIRECT_TRIGGER_ID,
  FORMAL_EVIDENCE_LEDGER_TRIGGER_IDS,
  canonicalClaimEvidenceStatuses,
} from "./claim-evidence-status.mjs";
import { resolveAsset, verifyAssetRegistry } from "./asset-registry.mjs";
import { VERIFICATION_PROOF_PATHS, VERIFICATION_PROOF_POLICY_REF } from "./verification-proof-policy.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const FIXED_ENTRY_REGISTRY_PATH = "schemas/fixed-entry-profile-registry.json";
export const FIXED_ENTRY_CONTROL_MAP_PATH = "schemas/compact-profile-control-map.json";
export const FIXED_ENTRY_ASSET_REFERENCE_PATH = "docs/fixtures/asset-registry/reference.json";
export const FIXED_ENTRY_NAMES = Object.freeze(["skill-implement.md", "skill-investigate.md", "skill-review.md", "skill-verify.md", "skill-handoff.md"]);
export const FIXED_ENTRY_CONTROL_IDS = Object.freeze(["scope", "verification", "risk_approval", "evidence", "missing_evidence", "output"]);
export const FIXED_ENTRY_CONTROL_PLACEHOLDER = "{{ASK_COMPACT_CONTROLS}}";
export const FIXED_ENTRY_TRIGGER_PLACEHOLDER = "{{ASK_COMPACT_DIRECT_TRIGGERS}}";
export const FIXED_ENTRY_ASSET_STABLE_IDS = Object.freeze([
  "ask.prompt-policy.compact-controls",
  "ask.prompt-template.fixed-entry-semantics",
]);

const COMMON_CANONICAL_SOURCES = Object.freeze([
  "AGENTS.md",
  "docs/claim-evidence-status-contract.md",
  "docs/execution-envelope-contract.md",
  "docs/verification-proof-policy-contract.md",
  "schemas/claim-evidence-status.schema.json",
  "schemas/verification-proof-policy.schema.json",
  FIXED_ENTRY_CONTROL_MAP_PATH,
  FIXED_ENTRY_REGISTRY_PATH,
  "skills/risk-gate/SKILL.md",
  "skills/scope-control/SKILL.md",
  "skills/test-first-verification/SKILL.md",
]);

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function exactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value ?? {}).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} fields changed without shared renderer support: expected ${expected.join(", ")}, received ${actual.join(", ")}`);
}

function arrayEquals(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} does not match the canonical fixed-entry contract`);
}

function identifier(value, label) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]*$/u.test(value)) throw new Error(`${label} must be a canonical contract identifier`);
}

export function validateFixedEntryControlMap(controlMap = readJson(FIXED_ENTRY_CONTROL_MAP_PATH)) {
  if (controlMap?.registry_version !== 1) throw new Error("compact control map registry_version must be 1");
  arrayEquals(controlMap.required_control_ids, FIXED_ENTRY_CONTROL_IDS, "required_control_ids");
  exactKeys(controlMap.controls, FIXED_ENTRY_CONTROL_IDS, "controls");

  const scope = controlMap.controls.scope;
  exactKeys(scope, ["source_refs", "required_inputs", "missing_input_behavior", "change_boundary", "cleanup_boundary"], "scope control");
  if (!Array.isArray(scope.source_refs) || !Array.isArray(scope.required_inputs) || scope.required_inputs.length === 0) throw new Error("scope control requires source_refs and required_inputs");
  if (scope.missing_input_behavior !== "stop_or_insufficient_evidence" || scope.change_boundary !== "smallest_task_required" || scope.cleanup_boundary !== "separate") throw new Error("scope control weakens canonical stop or change-boundary semantics");

  const verification = controlMap.controls.verification;
  exactKeys(verification, ["source_refs", "proof_policy_ref", "proof_policy_schema_ref", "proof_path_selected_before_implementation_claim", "focused_check_first", "broader_checks_proportional_to_risk", "exact_results_required", "compact_to_formal_upgrade_required"], "verification control");
  for (const field of ["proof_path_selected_before_implementation_claim", "focused_check_first", "broader_checks_proportional_to_risk", "exact_results_required", "compact_to_formal_upgrade_required"]) if (verification[field] !== true) throw new Error(`verification control requires ${field}`);
  if (verification.proof_policy_ref !== VERIFICATION_PROOF_POLICY_REF || verification.proof_policy_schema_ref !== "schemas/verification-proof-policy.schema.json") throw new Error("verification control must reference the canonical verification proof policy");

  const risk = controlMap.controls.risk_approval;
  const riskBooleans = ["exact_action_required", "risk_type_required", "potential_impact_required", "reversibility_required", "external_visibility_required", "safer_alternative_required", "preconditions_required", "stop_without_approval"];
  exactKeys(risk, ["source_refs", ...riskBooleans, "approval_scope", "execution_scope"], "risk_approval control");
  for (const field of riskBooleans) if (risk[field] !== true) throw new Error(`risk_approval control requires ${field}`);
  if (risk.approval_scope !== "specific_action" || risk.execution_scope !== "approved_action_only") throw new Error("risk_approval control requires specific-action approval and approved-action-only execution");

  const evidence = controlMap.controls.evidence;
  exactKeys(evidence, ["source_refs", "contract_ref", "schema_ref", "inline_default", "formal_ledger_trigger_ids", "claims_require_evidence", "unsupported_claim_behavior"], "evidence control");
  if (evidence.contract_ref !== CLAIM_EVIDENCE_CONTRACT_REF || evidence.schema_ref !== "schemas/claim-evidence-status.schema.json") throw new Error("evidence control must reference the canonical claim evidence status revision");
  arrayEquals(evidence.formal_ledger_trigger_ids, FORMAL_EVIDENCE_LEDGER_TRIGGER_IDS, "formal Evidence Ledger trigger IDs");
  if (evidence.inline_default !== true || evidence.claims_require_evidence !== true || evidence.unsupported_claim_behavior !== "downgrade") throw new Error("evidence control must keep inline discipline, require evidence, and downgrade unsupported claims");

  const missing = controlMap.controls.missing_evidence;
  exactKeys(missing, ["source_refs", "allowed_statuses", "inference", "stop_when_required"], "missing_evidence control");
  arrayEquals(missing.allowed_statuses, ["unavailable", "insufficient_evidence"], "missing_evidence statuses");
  if (missing.inference !== "prohibited" || missing.stop_when_required !== true) throw new Error("missing_evidence control must prohibit inference and stop when evidence is required");

  const output = controlMap.controls.output;
  exactKeys(output, ["source_refs", "required_sections_from_prompt_contract", "managed_runner_ordinary", "managed_runner_protected", "managed_runner_diagnostic", "unmanaged_compatibility", "next_action_location"], "output control");
  if (output.required_sections_from_prompt_contract !== true || output.managed_runner_ordinary !== "sidecar" || output.managed_runner_protected !== "inline_required" || output.managed_runner_diagnostic !== "explicit_only" || output.unmanaged_compatibility !== "inline_required" || output.next_action_location !== "execution_envelope_only") throw new Error("output control must preserve managed and unmanaged output semantics");

  const expectedClasses = ["implementation", "investigation", "review", "verification", "handoff"];
  exactKeys(controlMap.direct_triggers, expectedClasses, "direct_triggers");
  for (const [taskClass, triggers] of Object.entries(controlMap.direct_triggers)) {
    if (!Array.isArray(triggers)) throw new Error(`${taskClass} direct triggers must be an array`);
    const ids = new Set();
    for (const trigger of triggers) {
      exactKeys(trigger, ["id", "signal", "contract", "action", "missing_contract_behavior"], `${taskClass} direct trigger`);
      if (!/^[a-z0-9][a-z0-9_-]*$/u.test(trigger.id) || ids.has(trigger.id)) throw new Error(`${taskClass} direct trigger IDs must be unique controlled identifiers`);
      ids.add(trigger.id);
      identifier(trigger.contract, `${taskClass} direct trigger contract`);
      if (!trigger.signal || trigger.action !== "apply_before_primary" || trigger.missing_contract_behavior !== "capability_missing") throw new Error(`${taskClass} direct trigger must apply before primary and fail closed when unavailable`);
      if (trigger.id === FORMAL_EVIDENCE_LEDGER_DIRECT_TRIGGER_ID) throw new Error(`${taskClass} formal ledger trigger must derive from the claim evidence contract`);
    }
  }
  return controlMap;
}

export function validateFixedEntryRegistry(registry = readJson(FIXED_ENTRY_REGISTRY_PATH)) {
  exactKeys(registry, ["$schema", "$id", "title", "registry_version", "control_map_ref", "entries"], "fixed-entry registry");
  if (registry.registry_version !== 1 || registry.control_map_ref !== FIXED_ENTRY_CONTROL_MAP_PATH) throw new Error("fixed-entry registry must bind the canonical compact control map revision");
  exactKeys(registry.entries, FIXED_ENTRY_NAMES, "fixed-entry registry entries");
  const seenClasses = new Set();
  for (const entryName of FIXED_ENTRY_NAMES) {
    const entry = registry.entries[entryName];
    exactKeys(entry, ["mode", "task_class", "primary_contract", "requested_contracts", "canonical_sources"], `${entryName} fixed entry`);
    if (entry.mode !== entry.task_class || seenClasses.has(entry.task_class)) throw new Error(`${entryName} must define one unique fixed mode and task class`);
    seenClasses.add(entry.task_class);
    identifier(entry.primary_contract, `${entryName} primary_contract`);
    if (!Array.isArray(entry.requested_contracts) || entry.requested_contracts.length === 0 || entry.requested_contracts[0] !== entry.primary_contract || new Set(entry.requested_contracts).size !== entry.requested_contracts.length) throw new Error(`${entryName} requested_contracts must start with the primary contract and remain unique`);
    for (const contract of entry.requested_contracts) identifier(contract, `${entryName} requested contract`);
    if (!Array.isArray(entry.canonical_sources) || entry.canonical_sources.length === 0 || new Set(entry.canonical_sources).size !== entry.canonical_sources.length) throw new Error(`${entryName} canonical_sources must be a non-empty unique list`);
  }
  validateFixedEntryControlMap();
  return registry;
}

export function fixedEntryDefinitions(registry = validateFixedEntryRegistry()) {
  return Object.fromEntries(FIXED_ENTRY_NAMES.map((name) => [name, structuredClone(registry.entries[name])]));
}

export function fixedEntryDefinition(entryName, registry = validateFixedEntryRegistry()) {
  const definition = registry.entries[entryName];
  if (!definition) throw new Error(`Unknown fixed entry: ${entryName}`);
  return structuredClone(definition);
}

export function fixedEntryDirectTriggers(entryName, controlMap = validateFixedEntryControlMap(), registry = validateFixedEntryRegistry()) {
  const definition = fixedEntryDefinition(entryName, registry);
  return [
    ...controlMap.direct_triggers[definition.task_class].map((trigger) => ({ ...trigger })),
    {
      id: FORMAL_EVIDENCE_LEDGER_DIRECT_TRIGGER_ID,
      signal: `${CLAIM_EVIDENCE_CONTRACT_REF} selects formal_ledger`,
      contract: "evidence-ledger",
      action: "apply_before_primary",
      missing_contract_behavior: "capability_missing",
    },
  ];
}

export function fixedEntryCanonicalPaths(entryName, controlMap = validateFixedEntryControlMap(), registry = validateFixedEntryRegistry()) {
  const definition = fixedEntryDefinition(entryName, registry);
  const triggers = fixedEntryDirectTriggers(entryName, controlMap, registry);
  return [...new Set([...COMMON_CANONICAL_SOURCES, ...definition.canonical_sources, ...triggers.map((trigger) => `skills/${trigger.contract}/SKILL.md`)])].sort();
}

function renderControl(controlId, control) {
  if (controlId === "scope") return "[scope] repo/code/tests/docs/API; missing=>stop|insufficient; minimal diff; cleanup separate";
  if (controlId === "verification") return `[verification] ${control.proof_policy_ref}: ${VERIFICATION_PROOF_PATHS.join("|")} before claim; focused->risk-based; exact; trigger=>formal.`;
  if (controlId === "risk_approval") return "[risk_approval] exact action/risk/impact/reversibility/visibility/alternative/preconditions; unapproved=>stop; approved-only.";
  if (controlId === "evidence") return `[evidence] ${canonicalClaimEvidenceStatuses().join("|")}@${control.contract_ref}; inline; closed formal=>evidence-ledger; unsupported=>downgrade.`;
  if (controlId === "missing_evidence") return "[missing_evidence] unavailable|insufficient; no inference; required=>stop";
  if (controlId === "output") return "[output] managed: ordinary=>sidecar, stop/handoff=>inline, diagnostic explicit; unmanaged=>one inline; next_action only.";
  throw new Error(`fixed-entry control has no renderer: ${controlId}`);
}

export function renderFixedEntryControls(controlMap = validateFixedEntryControlMap()) {
  return controlMap.required_control_ids.map((controlId) => `- ${renderControl(controlId, controlMap.controls[controlId])}`).join("\n");
}

export function renderFixedEntryDirectTriggers(triggers) {
  if (triggers.length === 0) return "";
  return `Conditional (each missing=>\`capability_missing\`): ${triggers.map((trigger) => `\`${trigger.id}\`=>\`${trigger.contract}\``).join("; ")}.`;
}

export function validateFixedEntryTemplate(entryName, body, { validateAdapterTemplate = null } = {}) {
  const definition = fixedEntryDefinition(entryName);
  if (!body.includes(`Primary contract: \`${definition.primary_contract}\``)) throw new Error(`${entryName} must name its primary canonical contract`);
  if (body.includes("operating-mode-router") || body.includes("skill-router")) throw new Error(`${entryName} must not route through upper routers after entry mode is fixed`);
  if ((body.match(new RegExp(FIXED_ENTRY_CONTROL_PLACEHOLDER, "g")) ?? []).length !== 1) throw new Error(`${entryName} must contain one generated-control placeholder`);
  if ((body.match(new RegExp(FIXED_ENTRY_TRIGGER_PLACEHOLDER, "g")) ?? []).length !== 1) throw new Error(`${entryName} must contain one direct-trigger placeholder`);
  if (/\[(?:scope|verification|risk_approval|evidence|missing_evidence|output)\]/u.test(body)) throw new Error(`${entryName} must not hand-maintain canonical fallback controls`);
  if (!body.includes("$ARGUMENTS")) throw new Error(`${entryName} must retain the adapter argument placeholder`);
  validateAdapterTemplate?.(body, definition);
  return definition;
}

export function renderFixedEntryTemplate(entryName, sourceBody, { controlMap = validateFixedEntryControlMap(), validateAdapterTemplate = null } = {}) {
  validateFixedEntryRegistry();
  const definition = validateFixedEntryTemplate(entryName, sourceBody, { validateAdapterTemplate });
  const triggers = fixedEntryDirectTriggers(entryName, controlMap);
  const content = sourceBody
    .replace(FIXED_ENTRY_CONTROL_PLACEHOLDER, renderFixedEntryControls(controlMap))
    .replace(FIXED_ENTRY_TRIGGER_PLACEHOLDER, renderFixedEntryDirectTriggers(triggers));
  validateRenderedFixedEntryControls(content, controlMap);
  return { content, definition, triggers };
}

export function validateRenderedFixedEntryControls(content, controlMap = validateFixedEntryControlMap()) {
  for (const controlId of controlMap.required_control_ids) {
    const expected = `- ${renderControl(controlId, controlMap.controls[controlId])}`;
    if (!content.includes(expected)) throw new Error(`rendered fixed entry does not preserve canonical ${controlId} semantics`);
  }
}

export function fixedEntryAssetReferences(reference = readJson(FIXED_ENTRY_ASSET_REFERENCE_PATH)) {
  const storeRoot = resolve(ROOT, "docs/fixtures/asset-registry/store");
  const verified = verifyAssetRegistry({ storeRoot, snapshotDigest: reference.snapshot_digest });
  if (verified.registry_id !== reference.registry_id || verified.repository_id !== reference.repository_id || verified.scope_id !== reference.scope_id) {
    throw new Error("fixed-entry Asset reference does not identify the verified shared registry");
  }
  const byId = new Map((reference.assets ?? []).map((asset) => [asset.stable_id, asset]));
  return FIXED_ENTRY_ASSET_STABLE_IDS.map((stableId) => {
    const asset = byId.get(stableId);
    if (!asset || asset.asset_type !== "prompt" || asset.state !== "candidate") throw new Error(`registered fixed-entry Asset is missing or not candidate: ${stableId}`);
    const exact = Object.fromEntries(["asset_type", "stable_id", "version", "record_digest", "content_digest"].map((field) => [field, asset[field]]));
    if (Object.values(exact).some((value) => typeof value !== "string" || !value)) throw new Error(`registered fixed-entry Asset reference is incomplete: ${stableId}`);
    const resolved = resolveAsset({
      storeRoot,
      snapshotDigest: reference.snapshot_digest,
      stableId,
      version: asset.version,
      state: "candidate",
    });
    const verifiedExact = Object.fromEntries(Object.keys(exact).map((field) => [field, resolved[field]]));
    if (JSON.stringify(verifiedExact) !== JSON.stringify(exact)) throw new Error(`registered fixed-entry Asset bytes do not match the exported exact reference: ${stableId}`);
    return exact;
  });
}

export function fixedEntrySha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
