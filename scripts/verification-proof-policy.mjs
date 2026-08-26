import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = resolve(REPO_ROOT, "schemas/verification-proof-policy.schema.json");
const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const METADATA = SCHEMA["x-ask-contract"];

function exactKeys(value, expected, label) {
  const actual = Object.keys(value ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} fields must be exactly ${wanted.join(", ")}`);
}

function recordShapeIssue(value, required, optional, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return `${label} must be an object`;
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const unexpected = actual.filter((key) => !allowed.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    return `${label} fields are invalid: missing=${missing.join(", ") || "none"}; unexpected=${unexpected.join(", ") || "none"}`;
  }
  return null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || item.trim().length === 0) || new Set(value).size !== value.length) {
    throw new Error(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array of unique non-empty strings`);
  }
}

function observedIds(observations, idField, allowedIds, label) {
  if (!Array.isArray(observations)) throw new Error(`${label} must be an array`);
  const ids = [];
  for (const observation of observations) {
    exactKeys(observation, [idField, "evidence_refs"], `${label} observation`);
    const id = observation[idField];
    if (!allowedIds.includes(id)) throw new Error(`unknown ${label.slice(0, -1)}: ${id}`);
    uniqueStrings(observation.evidence_refs, `${label} ${id} evidence_refs`, { allowEmpty: false });
    ids.push(id);
  }
  uniqueStrings(ids, label);
  return ids;
}

function stableJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (value && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  throw new Error("upstream proof fact value must be JSON-compatible");
}

function inspectUpstreamProofFacts(facts = []) {
  if (!Array.isArray(facts) || facts.length > 128) throw new Error("upstream_proof_facts must be an array with at most 128 records");
  const valuesByField = new Map();
  for (const fact of facts) {
    const factShapeIssue = recordShapeIssue(fact, ["source_ref", "field", "value"], [], "upstream proof fact");
    if (factShapeIssue) throw new Error(factShapeIssue);
    if (!isNonEmptyString(fact.source_ref) || !isNonEmptyString(fact.field)) throw new Error("upstream proof fact requires source_ref and field");
    const values = valuesByField.get(fact.field) ?? new Set();
    values.add(stableJson(fact.value));
    valuesByField.set(fact.field, values);
  }
  return [...valuesByField.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([field]) => field)
    .sort();
}

function validateContractMetadata() {
  exactKeys(METADATA, ["id", "revision", "ref", "paths", "compact_eligibility_fact_ids", "formal_trigger_ids", "protected_compact_claim_types", "compact_rendered_shape", "formal_path_absorbing", "execution_evidence_owner_ref"], "verification proof policy metadata");
  if (METADATA.id !== "ask.verification-proof-policy" || METADATA.revision !== "1.0.0" || METADATA.ref !== `${METADATA.id}@${METADATA.revision}`) throw new Error("verification proof policy identity is invalid");
  if (JSON.stringify(METADATA.paths) !== JSON.stringify(["compact_proof", "formal_verification_contract"])) throw new Error("verification proof policy must define exactly compact and formal paths");
  for (const [label, values] of [
    ["compact eligibility fact IDs", METADATA.compact_eligibility_fact_ids],
    ["formal verification trigger IDs", METADATA.formal_trigger_ids],
    ["protected compact claim types", METADATA.protected_compact_claim_types],
  ]) uniqueStrings(values, label, { allowEmpty: false });
  if (METADATA.compact_rendered_shape !== "Proof:\n- Behavior:\n- Focused check:\n- Result or missing evidence:\n- Broader check required when:\n") throw new Error("verification proof policy Compact Proof shape is invalid");
  if (METADATA.formal_path_absorbing !== true || METADATA.execution_evidence_owner_ref !== "docs/verification-evidence-contract.md") throw new Error("verification proof policy weakens formal absorption or evidence ownership");
}

validateContractMetadata();

export const VERIFICATION_PROOF_POLICY_REF = METADATA.ref;
export const VERIFICATION_PROOF_PATHS = Object.freeze([...METADATA.paths]);
export const COMPACT_ELIGIBILITY_FACT_IDS = Object.freeze([...METADATA.compact_eligibility_fact_ids]);
export const FORMAL_VERIFICATION_TRIGGER_IDS = Object.freeze([...METADATA.formal_trigger_ids]);
export const PROTECTED_COMPACT_CLAIM_TYPES = Object.freeze([...METADATA.protected_compact_claim_types]);

export function verificationProofPolicyMetadata() {
  return structuredClone(METADATA);
}

export function renderCompactProofShape() {
  return METADATA.compact_rendered_shape;
}

export function selectVerificationProofPath({ eligibility_facts = [], formal_triggers = [], upstream_proof_facts = [] } = {}) {
  const eligibilityIds = observedIds(eligibility_facts, "fact_id", COMPACT_ELIGIBILITY_FACT_IDS, "compact eligibility facts");
  const triggerIds = observedIds(formal_triggers, "trigger_id", FORMAL_VERIFICATION_TRIGGER_IDS, "formal triggers");
  const conflictingUpstreamFields = inspectUpstreamProofFacts(upstream_proof_facts);
  const completeEligibility = COMPACT_ELIGIBILITY_FACT_IDS.every((id) => eligibilityIds.includes(id)) && eligibilityIds.length === COMPACT_ELIGIBILITY_FACT_IDS.length;
  return triggerIds.length === 0 && conflictingUpstreamFields.length === 0 && completeEligibility ? "compact_proof" : "formal_verification_contract";
}

export function validateVerificationProofSelection(selection) {
  const issues = [];
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) return ["verification proof selection must be an object"];
  if (selection.policy_ref !== VERIFICATION_PROOF_POLICY_REF) issues.push(`selection policy_ref must be ${VERIFICATION_PROOF_POLICY_REF}`);

  if (!VERIFICATION_PROOF_PATHS.includes(selection.selected_path)) {
    issues.push(`selected_path must be one of ${VERIFICATION_PROOF_PATHS.join(", ")}`);
    return issues;
  }
  const selectionShapeIssue = recordShapeIssue(
    selection,
    selection.selected_path === "compact_proof"
      ? ["selection_id", "policy_ref", "selected_path", "behavior_ref", "eligibility_facts", "formal_triggers"]
      : ["selection_id", "policy_ref", "selected_path", "behavior_ref", "eligibility_facts", "formal_triggers", "formal_verification_contract_ref"],
    ["upstream_proof_facts"],
    "verification proof selection",
  );
  if (selectionShapeIssue) {
    issues.push(selectionShapeIssue);
    return issues;
  }
  if (!isNonEmptyString(selection.selection_id)) issues.push("verification proof selection_id must be non-empty");
  if (!isNonEmptyString(selection.behavior_ref)) issues.push("verification proof behavior_ref must be non-empty");
  let eligibilityIds = [];
  let triggerIds = [];
  let conflictingUpstreamFields = [];
  try {
    eligibilityIds = observedIds(selection.eligibility_facts, "fact_id", COMPACT_ELIGIBILITY_FACT_IDS, "compact eligibility facts");
    triggerIds = observedIds(selection.formal_triggers, "trigger_id", FORMAL_VERIFICATION_TRIGGER_IDS, "formal triggers");
    conflictingUpstreamFields = inspectUpstreamProofFacts(selection.upstream_proof_facts);
  } catch (error) {
    issues.push(error.message);
    return issues;
  }

  if (conflictingUpstreamFields.length > 0 && !triggerIds.includes("missing_or_conflicting_upstream_proof")) {
    issues.push(`conflicting upstream proof facts require formal trigger missing_or_conflicting_upstream_proof: ${conflictingUpstreamFields.join(", ")}`);
    return issues;
  }

  if (selection.selected_path === "compact_proof" && triggerIds.length > 0) {
    issues.push(`selected_path compact_proof conflicts with formal trigger ${triggerIds[0]}`);
    return issues;
  }
  if (selection.selected_path === "compact_proof" && (eligibilityIds.length !== COMPACT_ELIGIBILITY_FACT_IDS.length || !COMPACT_ELIGIBILITY_FACT_IDS.every((id) => eligibilityIds.includes(id)))) {
    issues.push("selected_path compact_proof requires every compact eligibility fact");
    return issues;
  }
  if (selection.selected_path === "formal_verification_contract" && triggerIds.length === 0) {
    issues.push("formal_verification_contract requires at least one formal trigger");
  }
  if (selection.selected_path === "formal_verification_contract" && !isNonEmptyString(selection.formal_verification_contract_ref)) {
    issues.push("formal_verification_contract requires formal_verification_contract_ref");
  }
  return issues;
}

function evidenceMatchesResult(evidence, result) {
  return evidence
    && evidence.check_id === result.check_id
    && evidence.command === result.command
    && evidence.status === result.status
    && evidence.exit_code === result.exit_code
    && evidence.exact_result === result.exact_result;
}

export function validateCompactProof({ selection, proof, claim = null, resolveExecutionEvidence = () => undefined } = {}) {
  const issues = [];
  const selectionIssues = validateVerificationProofSelection(selection);
  if (selectionIssues.length > 0) return selectionIssues;
  if (selection.selected_path !== "compact_proof") return ["compact proof requires a compact_proof selection"];
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) return ["compact proof must be an object"];
  const proofShapeIssue = recordShapeIssue(
    proof,
    ["artifact_id", "artifact_type", "policy_ref", "selection_ref", "behavior_ref", "behavior", "focused_check", "result", "broader_check_required_when"],
    [],
    "compact proof",
  );
  if (proofShapeIssue) return [proofShapeIssue];
  if (!isNonEmptyString(proof.artifact_id)) issues.push("compact proof artifact_id must be non-empty");
  if (proof.artifact_type !== "compact_proof") issues.push("compact proof artifact_type must be compact_proof");
  if (proof.policy_ref !== VERIFICATION_PROOF_POLICY_REF) issues.push(`compact proof policy_ref must be ${VERIFICATION_PROOF_POLICY_REF}`);
  if (proof.selection_ref !== selection?.selection_id) issues.push("compact proof selection_ref does not match selection_id");
  if (proof.behavior_ref !== selection?.behavior_ref) issues.push("compact proof behavior_ref does not match selection behavior_ref");
  if (typeof proof.behavior !== "string" || !proof.behavior.trim()) issues.push("compact proof behavior must be non-empty");

  const check = proof.focused_check;
  const result = proof.result;
  const checkShapeIssue = recordShapeIssue(check, ["check_id", "command"], [], "compact focused check");
  if (checkShapeIssue || !isNonEmptyString(check?.check_id) || !isNonEmptyString(check?.command)) {
    issues.push("compact proof requires one focused check with exact command");
    return issues;
  }
  if (!result || result.check_id !== check.check_id || result.command !== check.command) {
    issues.push("compact result must bind the focused check ID and exact command");
    return issues;
  }
  if (typeof proof.broader_check_required_when !== "string" || !proof.broader_check_required_when) issues.push("compact proof requires broader_check_required_when");
  if (claim && claim.behavior_ref !== proof.behavior_ref) issues.push("compact claim behavior_ref does not match proof behavior_ref");
  if (claim && PROTECTED_COMPACT_CLAIM_TYPES.includes(claim.claim_type)) {
    issues.push(`compact_proof cannot support protected claim ${claim.claim_type}`);
    return issues;
  }
  if (claim && claim.claim_type !== "completion") {
    issues.push(`compact_proof cannot support non-localized claim ${String(claim.claim_type)}`);
    return issues;
  }
  if (claim?.claim_type === "completion" && result.status !== "passed") {
    issues.push(`compact result ${result.status} cannot support completion`);
    return issues;
  }
  if (["passed", "failed"].includes(result.status)) {
    const resultShapeIssue = recordShapeIssue(result, ["status", "check_id", "command", "exit_code", "exact_result", "execution_evidence_refs"], [], "compact observed result");
    if (resultShapeIssue) {
      issues.push(resultShapeIssue);
      return issues;
    }
    if (!Number.isInteger(result.exit_code) || result.exit_code < 0 || result.exit_code > 255 || (result.status === "passed" && result.exit_code !== 0) || (result.status === "failed" && result.exit_code === 0)) {
      issues.push("compact observed result exit_code does not match passed or failed status");
      return issues;
    }
    if (!isNonEmptyString(result.exact_result)) {
      issues.push("compact observed result requires exact_result");
      return issues;
    }
    try {
      uniqueStrings(result.execution_evidence_refs, "compact observed result execution_evidence_refs", { allowEmpty: false });
    } catch {
      issues.push("compact observed result requires execution evidence refs");
      return issues;
    }
    for (const evidenceRef of result.execution_evidence_refs) {
      if (!evidenceMatchesResult(resolveExecutionEvidence(evidenceRef), result)) {
        issues.push(`compact result does not match execution evidence ${evidenceRef}`);
        return issues;
      }
    }
  } else if (result.status === "missing") {
    const missingShapeIssue = recordShapeIssue(result, ["status", "check_id", "command", "missing_evidence", "next_check"], [], "compact missing result");
    if (missingShapeIssue || !isNonEmptyString(result.missing_evidence) || !isNonEmptyString(result.next_check)) {
      issues.push(missingShapeIssue ?? "compact missing result requires missing_evidence and next_check");
    }
  } else {
    issues.push("compact result status must be passed, failed, or missing");
  }
  return issues;
}

export function transitionVerificationProofPath(transition = {}) {
  const issues = [];
  const transitionShapeIssue = recordShapeIssue(
    transition,
    ["policy_ref", "selection_id", "from_path", "to_path", "formal_triggers", "executed_compact_evidence_refs", "retained_evidence_refs"],
    ["formal_verification_contract_ref", "prior_result_status", "resumed"],
    "verification proof transition",
  );
  if (transitionShapeIssue) return { selected_path: transition?.from_path, retained_evidence_refs: [], issues: [transitionShapeIssue] };
  const fromPath = transition.from_path;
  const toPath = transition.to_path;
  const retained = Array.isArray(transition.retained_evidence_refs) ? [...transition.retained_evidence_refs] : [];

  if (transition.policy_ref !== VERIFICATION_PROOF_POLICY_REF) issues.push(`transition policy_ref must be ${VERIFICATION_PROOF_POLICY_REF}`);
  if (!isNonEmptyString(transition.selection_id)) issues.push("verification proof transition selection_id must be non-empty");
  try {
    uniqueStrings(transition.executed_compact_evidence_refs, "executed compact evidence refs");
    uniqueStrings(transition.retained_evidence_refs, "retained evidence refs");
  } catch (error) {
    issues.push(error.message);
  }

  if (fromPath === "formal_verification_contract" && toPath !== "formal_verification_contract") {
    issues.push("formal_verification_contract is absorbing; transition to compact_proof is invalid");
    return { selected_path: "formal_verification_contract", retained_evidence_refs: retained, issues };
  }
  if (fromPath !== "compact_proof" || toPath !== "formal_verification_contract") {
    issues.push("verification proof transition must be compact_proof to formal_verification_contract");
    return { selected_path: fromPath, retained_evidence_refs: retained, issues };
  }

  let triggerIds = [];
  try {
    triggerIds = observedIds(transition.formal_triggers, "trigger_id", FORMAL_VERIFICATION_TRIGGER_IDS, "formal triggers");
  } catch (error) {
    issues.push(error.message);
  }
  if (triggerIds.length === 0) issues.push("compact to formal upgrade requires a formal trigger");
  const executed = Array.isArray(transition.executed_compact_evidence_refs) ? transition.executed_compact_evidence_refs : [];
  const missingRetained = executed.filter((reference) => !retained.includes(reference));
  if (missingRetained.length > 0) issues.push(`compact to formal upgrade must retain executed evidence refs: ${missingRetained.join(", ")}`);
  if (!isNonEmptyString(transition.formal_verification_contract_ref)) issues.push("compact to formal upgrade requires formal_verification_contract_ref");
  return { selected_path: "formal_verification_contract", retained_evidence_refs: retained, issues };
}

export function readLegacyFormalVerificationArtifact(artifact) {
  const issues = [];
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact) || artifact.type !== "verification") issues.push("legacy formal artifact must retain type verification");
  if (typeof artifact?.id !== "string" || !artifact.id) issues.push("legacy formal artifact must retain its artifact ID");
  return {
    selected_path: "formal_verification_contract",
    artifact_ref: artifact?.id ?? null,
    issues,
  };
}
