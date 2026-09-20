import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_PATH = resolve(REPO_ROOT, "schemas/claim-evidence-status.schema.json");
const CONTRACT = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const METADATA = CONTRACT["x-ask-contract"];

function requireExactKeys(value, keys, label) {
  const actual = Object.keys(value ?? {}).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} fields must be exactly ${expected.join(", ")}`);
  }
}

function requireUniqueStrings(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || item.trim().length === 0) || new Set(value).size !== value.length) {
    throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array of unique non-empty strings`);
  }
}

function validateContract() {
  if (CONTRACT.type !== "string") throw new Error("claim evidence status schema must validate a string");
  requireUniqueStrings(CONTRACT.enum, "canonical claim evidence statuses", { allowEmpty: false });
  if (CONTRACT.enum.length !== 5) throw new Error("canonical claim evidence status contract must contain exactly five statuses");
  requireExactKeys(METADATA, ["id", "revision", "ref", "inline_default", "formal_ledger", "legacy"], "claim evidence contract metadata");
  if (METADATA.id !== "ask.claim-evidence-status" || METADATA.revision !== "1.0.0" || METADATA.ref !== `${METADATA.id}@${METADATA.revision}` || METADATA.inline_default !== true) {
    throw new Error("claim evidence contract identity or inline default is invalid");
  }
  requireExactKeys(METADATA.formal_ledger, ["contract", "direct_trigger_id", "trigger_ids", "trigger_descriptions"], "formal ledger metadata");
  requireUniqueStrings(METADATA.formal_ledger.trigger_ids, "formal evidence ledger trigger IDs", { allowEmpty: false });
  if (METADATA.formal_ledger.contract !== "evidence-ledger" || METADATA.formal_ledger.direct_trigger_id !== "formal_claim_audit_required") throw new Error("formal ledger contract routing is invalid");
  requireExactKeys(METADATA.formal_ledger.trigger_descriptions, METADATA.formal_ledger.trigger_ids, "formal ledger trigger descriptions");
  for (const description of Object.values(METADATA.formal_ledger.trigger_descriptions)) if (typeof description !== "string" || !description) throw new Error("formal ledger trigger descriptions must be non-empty strings");
  requireExactKeys(METADATA.legacy, ["lowercase_aliases", "weak", "fixed_mappings"], "legacy compatibility metadata");
  if (JSON.stringify(Object.values(METADATA.legacy.lowercase_aliases)) !== JSON.stringify(CONTRACT.enum)) throw new Error("lowercase aliases must map in canonical status order");
  if (JSON.stringify(CONTRACT.$defs?.lowercase_status?.enum) !== JSON.stringify(Object.keys(METADATA.legacy.lowercase_aliases))) throw new Error("lowercase compatibility schema must match aliases");
  if (!Array.isArray(METADATA.legacy.weak.qualifying_strengths) || METADATA.legacy.weak.qualifying_with_evidence_refs !== "Supported" || METADATA.legacy.weak.otherwise !== "Hypothesis" || METADATA.legacy.weak.maximum !== "Supported") throw new Error("legacy weak mapping must remain a deterministic non-upgrade");
  for (const mapping of Object.values(METADATA.legacy.fixed_mappings)) if (!CONTRACT.enum.includes(mapping.canonical_status)) throw new Error("legacy fixed mapping targets a non-canonical status");
}

validateContract();

export const CLAIM_EVIDENCE_CONTRACT_REF = METADATA.ref;
export const FORMAL_EVIDENCE_LEDGER_DIRECT_TRIGGER_ID = METADATA.formal_ledger.direct_trigger_id;
export const FORMAL_EVIDENCE_LEDGER_TRIGGER_IDS = Object.freeze([...METADATA.formal_ledger.trigger_ids]);

export function canonicalClaimEvidenceStatuses() {
  return [...CONTRACT.enum];
}

export function claimEvidenceContractMetadata() {
  return structuredClone(METADATA);
}

export function normalizeClaimEvidenceStatus({ status, evidence_strength = null, evidence_refs = [] } = {}) {
  if (typeof status !== "string" || status.length === 0) throw new Error("claim evidence status must be a non-empty string");
  requireUniqueStrings(evidence_refs, "evidence_refs");
  if (evidence_strength !== null && !CONTRACT.$defs.evidence_strength.enum.includes(evidence_strength)) throw new Error("evidence_strength is not recognized by the claim evidence status contract");

  let canonicalStatus;
  let migrationBasis;
  let authorityStatus = null;
  let recordState = "active";

  if (CONTRACT.enum.includes(status)) {
    canonicalStatus = status;
    migrationBasis = "canonical";
  } else if (Object.hasOwn(METADATA.legacy.lowercase_aliases, status)) {
    canonicalStatus = METADATA.legacy.lowercase_aliases[status];
    migrationBasis = "lowercase_alias";
  } else if (status === "weak") {
    const qualifying = METADATA.legacy.weak.qualifying_strengths.includes(evidence_strength) && evidence_refs.length > 0;
    canonicalStatus = qualifying ? METADATA.legacy.weak.qualifying_with_evidence_refs : METADATA.legacy.weak.otherwise;
    migrationBasis = qualifying ? "legacy_weak_with_qualifying_evidence" : "legacy_weak_without_qualifying_evidence";
  } else if (Object.hasOwn(METADATA.legacy.fixed_mappings, status)) {
    const mapping = METADATA.legacy.fixed_mappings[status];
    canonicalStatus = mapping.canonical_status;
    authorityStatus = mapping.authority_status;
    recordState = mapping.record_state;
    migrationBasis = `legacy_${status.toLowerCase().replaceAll("-", "_")}`;
  } else {
    throw new Error(`claim evidence status is not recognized: ${status}`);
  }

  if (status === "weak" && canonicalStatus === "Verified") throw new Error("legacy weak evidence cannot be upgraded to Verified");
  return Object.freeze({
    contract_ref: CLAIM_EVIDENCE_CONTRACT_REF,
    original_status: status,
    canonical_status: canonicalStatus,
    migration_basis: migrationBasis,
    authority_status: authorityStatus,
    record_state: recordState,
  });
}

export function selectClaimEvidenceMode(triggerIds = []) {
  requireUniqueStrings(triggerIds, "formal evidence ledger trigger IDs");
  const allowed = new Set(FORMAL_EVIDENCE_LEDGER_TRIGGER_IDS);
  for (const triggerId of triggerIds) if (!allowed.has(triggerId)) throw new Error(`unknown formal evidence ledger trigger: ${triggerId}`);
  return triggerIds.length === 0 ? "inline" : "formal_ledger";
}

export function validateFormalEvidenceLedger({ trigger_ids = [], ledger_present = false } = {}) {
  if (typeof ledger_present !== "boolean") throw new Error("ledger_present must be boolean");
  const mode = selectClaimEvidenceMode(trigger_ids);
  if (mode === "formal_ledger" && !ledger_present) throw new Error("formal Evidence Ledger is required by the selected claim-audit trigger");
  if (mode === "inline" && ledger_present) throw new Error("formal Evidence Ledger is not activated for an ordinary inline claim");
  return mode;
}

const PROTECTED_USES = new Set([
  "correctness",
  "completion",
  "merge",
  "release",
  "production",
  "permission",
  "activation",
  "readiness",
  "security",
  "safety",
  "reliability",
  "performance",
  "ux",
  "cost",
  "roi",
  "external_readiness",
  "maintainability",
  "no_regression",
  "pass",
  "zero",
  "absence",
]);
const VALID_USES = new Set(["informational", "investigation", ...PROTECTED_USES]);

export function validateClaimEvidenceUse({
  status,
  evidence_refs = [],
  missing_evidence = [],
  use = "informational",
  contradicted = false,
  corrected = false,
} = {}) {
  if (!CONTRACT.enum.includes(status)) throw new Error("claim evidence status must use the canonical five-status writer vocabulary");
  requireUniqueStrings(evidence_refs, "evidence_refs");
  requireUniqueStrings(missing_evidence, "missing_evidence");
  if (!VALID_USES.has(use)) throw new Error(`unknown claim evidence use: ${use}`);
  if (typeof contradicted !== "boolean" || typeof corrected !== "boolean") throw new Error("contradicted and corrected must be boolean");
  if ((status === "Verified" || status === "Supported") && evidence_refs.length === 0) throw new Error(`${status} requires at least one evidence reference`);
  if (status === "Hypothesis" && missing_evidence.length === 0) throw new Error("Hypothesis requires an explicit missing-evidence or next-check reference");
  if (contradicted && status !== "Falsified") throw new Error("contradictory claim evidence must use Falsified and correct the claim");
  if (status === "Falsified" && (evidence_refs.length === 0 || !corrected)) throw new Error("a Falsified claim must be corrected and retain contradictory evidence references");
  if (status === "Unknown" && PROTECTED_USES.has(use)) throw new Error(`Unknown cannot support ${use}`);
  if (status === "Hypothesis" && PROTECTED_USES.has(use)) throw new Error(`Hypothesis cannot support ${use}`);
  if (status === "Supported" && PROTECTED_USES.has(use)) throw new Error(`Supported cannot support ${use} without direct verification`);
  if (status === "Falsified" && PROTECTED_USES.has(use)) throw new Error(`Falsified cannot support ${use}`);
  if (missing_evidence.length > 0 && PROTECTED_USES.has(use)) throw new Error(`missing evidence cannot support ${use}`);
  return true;
}
