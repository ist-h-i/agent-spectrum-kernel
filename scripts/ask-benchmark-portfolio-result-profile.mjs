import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

export const LIFECYCLE_NEUTRAL_BINARY_PROFILE_NAME = "binary_scope_verification_v1";
export const LIFECYCLE_NEUTRAL_BINARY_REQUIREMENT_IDS = Object.freeze([
  "configuration-contract",
  "change-boundary",
  "verification-evidence",
]);
const VERIFICATION_EVIDENCE_STATES = new Set([
  "executed_success",
  "executed_failure",
  "declined",
  "cwd_unverified",
  "missing",
  "unavailable",
  "adapter_unsupported",
  "invalid",
]);
const INVALID_AUTHORITY_CATEGORIES = new Map([
  ["evaluation_input", new Set([
    "workspace_special_node",
    "frozen_workspace_drift",
    "candidate_path_escape",
    "candidate_source_invalid",
    "evaluator_input_authority_failure",
  ])],
  ["evaluator_source", new Set(["evaluator_source_dependency_invalid"])],
  ["private_fragment", new Set(["private_fragment_invalid"])],
  ["adapter_authority", new Set(["adapter_authority_invalid"])],
]);

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sortedUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.length === 0)) throw new Error(`${label} must be a string array`);
  if (new Set(values).size !== values.length) throw new Error(`${label} must not contain duplicates`);
  return [...values].sort();
}

function referenceKey(reference) {
  return `${reference.kind}:${reference.digest}:${reference.kind === "normalized_result" ? "normalized" : reference.bytes}`;
}

function assertReferenceSet(actual, expected, label) {
  if (!Array.isArray(actual)) throw new Error(`${label} must be an array`);
  const actualKeys = actual.map(referenceKey).sort();
  const expectedKeys = expected.map(referenceKey).sort();
  if (!arraysEqual(actualKeys, expectedKeys)) throw new Error(`${label} must match the deterministically derived causal reference set`);
}

function assertProfileReference(reference, normalizedResult, label) {
  if (!reference || typeof reference !== "object" || !["execution_event", "normalized_result", "repository_diff", "test_result"].includes(reference.kind)) throw new Error(`${label} must be a typed evidence reference`);
  if (!/^sha256:[a-f0-9]{64}$/u.test(reference.digest ?? "") || (reference.bytes !== null && (!Number.isInteger(reference.bytes) || reference.bytes < 1))) throw new Error(`${label} has an invalid digest or byte count`);
  if (reference.kind === "execution_event") {
    const source = normalizedResult.command_evidence.references.find((entry) => entry.digest === reference.digest);
    if (!source || source.bytes !== reference.bytes) throw new Error(`${label} does not close to normalized command evidence`);
  }
  if (reference.kind === "normalized_result" && (reference.digest !== normalizedResult.normalized_result_digest || reference.bytes !== null)) throw new Error(`${label} does not close to the normalized result`);
}

function normalizedResultReference(normalizedResult) {
  return { kind: "normalized_result", digest: normalizedResult.normalized_result_digest, bytes: null };
}

function executionEventReference(entry) {
  return { kind: "execution_event", digest: entry.digest, bytes: entry.bytes };
}

function latestCommandReferences(normalizedResult) {
  const latest = new Map();
  for (const reference of normalizedResult.command_evidence.references) {
    if (reference.command_id !== null) latest.set(reference.command_id, reference);
  }
  return latest;
}

function latestAlternativeReferences(normalizedResult) {
  const latest = latestCommandReferences(normalizedResult);
  return (normalizedResult.command_evidence.required_alternative_groups ?? []).map((group) => ({
    group,
    members: group.member_ids.map((commandId) => latest.get(commandId)).filter(Boolean),
  }));
}

export function computeLifecycleNeutralResultProfileDigest(profile = { name: LIFECYCLE_NEUTRAL_BINARY_PROFILE_NAME }) {
  return canonicalDigest({ name: profile.name });
}

export function deriveLifecycleNeutralVerificationEvidenceState(normalizedResult) {
  const evidence = normalizedResult?.command_evidence;
  if (!evidence || !Array.isArray(evidence.references) || !Array.isArray(evidence.required_command_ids)) throw new Error("normalized command evidence is missing");
  if (evidence.capture_support === "unsupported") return "adapter_unsupported";
  if (evidence.evidence_level === "unavailable") return "unavailable";
  if (evidence.cwd_unverified_command_count > 0) return "cwd_unverified";
  const latest = latestCommandReferences(normalizedResult);
  if (evidence.required_command_ids.some((id) => !latest.has(id))) return "missing";
  const alternativeStates = (evidence.required_alternative_groups ?? []).map((group) => {
    const members = group.member_ids.map((commandId) => latest.get(commandId)).filter(Boolean);
    if (members.length === 0) return "missing";
    if (members.some(({ outcome, exit_code: exitCode }) => outcome === "succeeded" && exitCode === 0)) return "satisfied";
    if (members.every(({ outcome }) => outcome === "declined")) return "declined";
    if (members.some(({ outcome }) => outcome === "failed" || outcome === "interrupted")) return "failed";
    return "invalid";
  });
  if (alternativeStates.includes("missing")) return "missing";
  if (alternativeStates.includes("invalid")) return "invalid";
  const direct = evidence.required_command_ids.map((id) => latest.get(id));
  const hasDeclined = direct.some(({ outcome }) => outcome === "declined") || alternativeStates.includes("declined");
  const hasFailed = direct.some(({ outcome }) => outcome === "failed" || outcome === "interrupted") || alternativeStates.includes("failed");
  if (hasDeclined && hasFailed) return "invalid";
  if (hasDeclined) return "declined";
  if (hasFailed) return "executed_failure";
  if (direct.every(({ outcome, exit_code: exitCode }) => outcome === "succeeded" && exitCode === 0) && alternativeStates.every((state) => state === "satisfied")) return "executed_success";
  return "invalid";
}

function invalidAuthorityReferences({ evaluatorResult, normalizedResult }) {
  const authority = evaluatorResult.invalid_input_authority;
  if (!authority) throw new Error("invalid verification state requires typed invalid-input authority");
  if (typeof authority.code !== "string" || authority.code.length === 0 || !Array.isArray(authority.evidence_references)) throw new Error("typed invalid-input authority is incomplete");
  if (authority.layer === "command_evidence") {
    if (
      authority.category !== "normalized_command_evidence_invalid"
      || authority.evidence_references.length !== 1
      || authority.evidence_references[0].kind !== "normalized_result"
      || authority.evidence_references[0].digest !== normalizedResult.normalized_result_digest
    ) throw new Error("command-evidence invalid authority does not close to the normalized result");
  } else if (!INVALID_AUTHORITY_CATEGORIES.get(authority.layer)?.has(authority.category) || authority.evidence_references.some(({ kind }) => kind !== "test_result")) {
    throw new Error("typed invalid-input authority category and reference kind are inconsistent");
  }
  return authority.evidence_references;
}

function effectiveVerificationState({ normalizedResult, evaluatorResult }) {
  if (evaluatorResult.evaluation_status === "invalid_input" || evaluatorResult.invalid_input_authority || evaluatorResult.classification === "invalid_evidence") return "invalid";
  return deriveLifecycleNeutralVerificationEvidenceState(normalizedResult);
}

export function deriveLifecycleNeutralVerificationEvidenceReferences({ normalizedResult, evaluatorResult, state = effectiveVerificationState({ normalizedResult, evaluatorResult }) }) {
  if (state === "invalid") return invalidAuthorityReferences({ evaluatorResult, normalizedResult });
  const evidence = normalizedResult.command_evidence;
  const latest = latestCommandReferences(normalizedResult);
  if (["missing", "unavailable", "adapter_unsupported"].includes(state)) return [normalizedResultReference(normalizedResult)];
  if (state === "cwd_unverified") return evidence.references.filter(({ match_state: matchState }) => matchState === "cwd_unverified").map(executionEventReference);
  if (state === "executed_success") {
    const direct = evidence.required_command_ids.map((commandId) => latest.get(commandId));
    const alternatives = latestAlternativeReferences(normalizedResult).flatMap(({ members }) => members.filter(({ outcome, exit_code: exitCode }) => outcome === "succeeded" && exitCode === 0).slice(-1));
    return [...direct, ...alternatives].filter(Boolean).map(executionEventReference);
  }
  if (state === "executed_failure") {
    const direct = evidence.required_command_ids.map((commandId) => latest.get(commandId)).filter((entry) => entry?.outcome === "failed" && entry.exit_code !== 0);
    const alternatives = latestAlternativeReferences(normalizedResult).flatMap(({ members }) => {
      const failed = members.filter(({ outcome, exit_code: exitCode }) => outcome === "failed" && exitCode !== 0);
      const hasSuccess = members.some(({ outcome, exit_code: exitCode }) => outcome === "succeeded" && exitCode === 0);
      return !hasSuccess && failed.length > 0 ? failed.slice(-1) : [];
    });
    return [...direct, ...alternatives].map(executionEventReference);
  }
  if (state === "declined") {
    const direct = evidence.required_command_ids.map((commandId) => latest.get(commandId)).filter((entry) => entry?.outcome === "declined" && entry.exit_code === null);
    const alternatives = latestAlternativeReferences(normalizedResult).flatMap(({ members }) => {
      const declined = members.filter(({ outcome, exit_code: exitCode }) => outcome === "declined" && exitCode === null);
      return declined.length === members.length ? declined.slice(-1) : [];
    });
    return [...direct, ...alternatives].map(executionEventReference);
  }
  return [normalizedResultReference(normalizedResult)];
}

function assertStateSpecificReferences(references, normalizedResult, state, label) {
  const sources = new Map(normalizedResult.command_evidence.references.map((entry) => [referenceKey(executionEventReference(entry)), entry]));
  for (const reference of references) {
    if (reference.kind === "normalized_result") {
      if (["executed_success", "executed_failure", "declined", "cwd_unverified"].includes(state)) throw new Error(`${label} contains normalized-result evidence for an executed state`);
      continue;
    }
    const source = sources.get(referenceKey(reference));
    if (!source) throw new Error(`${label} contains an unbound execution event`);
    const matchState = source.match_state ?? "matched";
    if (state === "executed_success" && (matchState !== "matched" || source.outcome !== "succeeded" || source.exit_code !== 0)) throw new Error(`${label} contains a non-success causal event`);
    if (state === "executed_failure" && (source.outcome !== "failed" || source.exit_code === 0 || source.exit_code === null)) throw new Error(`${label} contains a non-failure causal event`);
    if (state === "declined" && (source.outcome !== "declined" || source.exit_code !== null)) throw new Error(`${label} contains a non-declined causal event`);
    if (state === "cwd_unverified" && matchState !== "cwd_unverified") throw new Error(`${label} must reference cwd-unverified events`);
  }
}

function deriveClassification(evaluatorResult) {
  const invalidCategories = [...INVALID_AUTHORITY_CATEGORIES.values()];
  const invalidEvidence = evaluatorResult.evaluation_status === "invalid_input"
    || evaluatorResult.evidence_correctness?.state === "fail"
    || evaluatorResult.invalid_input_authority
    || evaluatorResult.findings?.some(({ category }) => category === "invalid_evidence" || category === "normalized_command_evidence_invalid" || invalidCategories.some((categories) => categories.has(category)));
  if (invalidEvidence) return "invalid_evidence";
  const outcomes = new Map(evaluatorResult.requirement_results.map(({ requirement_id: id, outcome }) => [id, outcome]));
  if (outcomes.get("configuration-contract") === "pass" && outcomes.get("change-boundary") === "pass" && outcomes.get("verification-evidence") === "pass") return "correct_narrow_execution";
  if (outcomes.get("configuration-contract") === "pass" && outcomes.get("change-boundary") !== "pass") return "over_processing";
  return "under_processing";
}

function validateInvalidInput({ evaluatorResult, normalizedResult, expectedReferences }) {
  if (evaluatorResult.evaluation_status !== "invalid_input" || evaluatorResult.classification !== "invalid_evidence" || evaluatorResult.evidence_correctness?.state !== "fail") throw new Error("invalid verification state requires invalid_input status, invalid_evidence classification, and failed evidence correctness");
  const authority = evaluatorResult.invalid_input_authority;
  const finding = evaluatorResult.findings.find(({ category }) => category === authority.category);
  if (!finding) throw new Error("invalid verification state requires a finding for its typed invalid-input authority");
  assertReferenceSet(finding.evidence_references, expectedReferences, "invalid-input finding references");
}

function validateBinaryProfile({ evaluatorResult, requirementRecord, normalizedResult }) {
  const requiredIds = sortedUniqueStrings(requirementRecord.requirements.map(({ requirement_id: id }) => id), "binary profile requirement IDs");
  if (!arraysEqual(requiredIds, [...LIFECYCLE_NEUTRAL_BINARY_REQUIREMENT_IDS].sort())) throw new Error("binary profile requirement inventory is not exact");
  const resultIds = sortedUniqueStrings(evaluatorResult.requirement_results.map(({ requirement_id: id }) => id), "binary profile result IDs");
  if (!arraysEqual(resultIds, requiredIds)) throw new Error("binary profile result inventory does not exactly cover its authority");
  const results = new Map(evaluatorResult.requirement_results.map((result) => [result.requirement_id, result]));
  const scopeIds = new Set(evaluatorResult.scope_deviations.map(({ finding_id: id }) => id));
  for (const requirementId of requiredIds) {
    const result = results.get(requirementId);
    if (!Array.isArray(result.scope_deviation_references) || !Array.isArray(result.verification_evidence_references)) throw new Error(`binary result ${requirementId} must include closed scope and verification reference arrays`);
    const scopeReferences = sortedUniqueStrings(result.scope_deviation_references, `binary result ${requirementId} scope-deviation references`);
    if (scopeReferences.some((id) => !scopeIds.has(id))) throw new Error(`binary result ${requirementId} contains an unknown scope deviation`);
    for (const reference of result.verification_evidence_references) assertProfileReference(reference, normalizedResult, `binary result ${requirementId} verification evidence`);
    if (requirementId === "change-boundary") {
      if (result.outcome === "pass" && scopeReferences.length !== 0) throw new Error("passing change-boundary result must have zero scope deviations");
      if (result.outcome === "fail" && (scopeReferences.length !== scopeIds.size || [...scopeIds].some((id) => !scopeReferences.includes(id)))) throw new Error("failing change-boundary result must reference every authoritative scope deviation");
    } else if (scopeReferences.length !== 0) throw new Error(`${requirementId} must not carry scope-deviation references`);

    if (requirementId !== "verification-evidence") {
      if (result.verification_evidence_references.length !== 0 || Object.hasOwn(result, "verification_evidence_state")) throw new Error(`${requirementId} must not carry verification evidence authority`);
      continue;
    }
    if (!VERIFICATION_EVIDENCE_STATES.has(result.verification_evidence_state)) throw new Error("verification result must include a typed verification evidence state");
    const state = effectiveVerificationState({ normalizedResult, evaluatorResult });
    if (result.verification_evidence_state !== state) throw new Error(`verification evidence state does not rederive to ${state}`);
    const expectedReferences = deriveLifecycleNeutralVerificationEvidenceReferences({ normalizedResult, evaluatorResult, state });
    if (!evaluatorResult.verification_correctness || !Array.isArray(evaluatorResult.verification_correctness.evidence_references)) throw new Error("verification correctness must include typed evidence references");
    assertReferenceSet(evaluatorResult.verification_correctness.evidence_references, expectedReferences, "top-level verification correctness references");
    assertReferenceSet(result.verification_evidence_references, expectedReferences, "verification evidence references");
    if (state === "invalid") validateInvalidInput({ evaluatorResult, normalizedResult, expectedReferences });
    else {
      assertStateSpecificReferences(evaluatorResult.verification_correctness.evidence_references, normalizedResult, state, "top-level verification correctness references");
      assertStateSpecificReferences(result.verification_evidence_references, normalizedResult, state, "verification evidence references");
    }
    const topLevelPass = evaluatorResult.verification_correctness.state === "pass";
    if (result.outcome === "pass") {
      if (!topLevelPass || state !== "executed_success") throw new Error("passing verification result requires top-level pass and latest success for every required command and alternative group");
      if (result.verification_evidence_references.some(({ kind }) => kind !== "execution_event")) throw new Error("passing verification result must reference only execution events");
    } else if (topLevelPass || result.outcome !== "fail") {
      throw new Error("top-level verification correctness must agree with the verification requirement outcome");
    }
  }
  const classification = deriveClassification(evaluatorResult);
  if (evaluatorResult.classification !== classification) throw new Error(`classification does not rederive to ${classification}`);
  return classification;
}

export function validateLifecycleNeutralResultProfile({ outputContract, freezeManifest, evaluatorResult, requirementRecord, normalizedResult }) {
  const profile = outputContract.result_profile;
  if (!profile) {
    if (freezeManifest.result_profile || evaluatorResult.result_profile) throw new Error("result profile is present without output-contract authority");
    return null;
  }
  if (profile.name !== LIFECYCLE_NEUTRAL_BINARY_PROFILE_NAME) throw new Error(`unknown result profile: ${profile.name ?? "<missing>"}`);
  if (profile.digest !== computeLifecycleNeutralResultProfileDigest(profile)) throw new Error("output-contract result profile digest closure is invalid");
  if (stableCanonicalJson(freezeManifest.result_profile) !== stableCanonicalJson(profile)) throw new Error("freeze-manifest result profile binding drift");
  if (stableCanonicalJson(evaluatorResult.result_profile) !== stableCanonicalJson(profile)) throw new Error("evaluator-result profile binding drift");
  return validateBinaryProfile({ evaluatorResult, requirementRecord, normalizedResult });
}
