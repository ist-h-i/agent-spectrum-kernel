// A once-start bridge to the existing runner/original graders. Importing and
// inspecting this module never starts a model, CLI, grader, or ownership probe.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalDigest, parseJsonRejectDuplicateKeys, readContentAddressedJson } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { createPrimaryEvaluationGradingAdapter } from "./ask-primary-evaluation-grading.mjs";
import { verifyPersonalEvolutionPromptPairResults, startPersonalEvolutionPromptPair } from "./ask-personal-evolution-primary-pair.mjs";
import { applyApprovedEvolutionPortfolioAction } from "./evolution-loop.mjs";
import { verifyPersonalEvolutionSavedResults } from "./ask-personal-evolution-saved-results.mjs";
import { importPersonalEvolutionGenerationResult } from "./ask-personal-evolution-generation.mjs";
import { planPersonalEvolutionBaselineAlignment, applyPersonalEvolutionBaselineAlignment } from "./ask-personal-evolution-alignment.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const contexts = new WeakMap();
const required = ["storeRoot", "preparationObjectDigest", "experimentObjectDigest", "pairRegistrationObjectDigest",
  "trustedExperimentObjectDigests", "trustedPairRegistrationObjectDigests", "trustedExperimentAuthorities",
  "trustedPortfolioAuthorityContexts", "evaluationAuthority"];
const optional = ["trustedAssetAuthorityContexts", "trustedHighImpactApprovalGrants"];
function ownJson(value, ancestors = new Set()) {
  // Parsing rejects duplicate keys. The API accepts only detached JSON artifacts,
  // not provider callbacks, model controls, approval factories or accessors.
  if (value === null || ["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number") { assert.ok(Number.isFinite(value)); return value; }
  assert.ok(value && typeof value === "object" && !ancestors.has(value), "driver cyclic/non-JSON input");
  ancestors = new Set([...ancestors, value]);
  assert.ok(Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  const fields = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(fields)) {
    if (Array.isArray(value) && key === "length") continue;
    assert.ok(typeof key === "string" && Object.hasOwn(fields[key], "value") && fields[key].enumerable, "driver accessor/symbol refused");
  }
  if (Array.isArray(value)) assert.equal(Reflect.ownKeys(fields).length, value.length + 1, "driver extra array field refused");
  return Array.isArray(value) ? Array.from({length: value.length}, (_, index) => {
    assert.ok(Object.hasOwn(fields, String(index)), "driver sparse array refused"); return ownJson(fields[index].value, ancestors);
  }) : Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, ownJson(field.value, ancestors)]));
}
function inputs(value) {
  const owned = ownJson(value);
  assert.ok(owned && !Array.isArray(owned));
  assert.ok(Object.keys(owned).every(key => [...required, ...optional].includes(key)), "unknown driver option");
  assert.ok(required.every(key => Object.hasOwn(owned, key)), "missing driver option");
  return owned;
}
export function inspectPreparedPersonalEvolutionLoop(value) {
  const owned = inputs(value);
  const checked = verifyPersonalEvolutionPromptPairResults(owned);
  assert.equal(checked.status, "NOT_RUN", "driver preparation accepts only a fresh unstarted pair");
  const registration = readContentAddressedJson({storeRoot: owned.storeRoot, digest: owned.pairRegistrationObjectDigest}).value;
  assert.equal(existsSync(registration.output_root + "/invocation"), false, "pair invocation already consumed; no retry/resume");
  const graders = {};
  const preflights = {};
  for (const role of ["baseline", "challenger"]) {
    const bindings = registration.description.bindings[role];
    const resource = bindings[0].grading_resources;
    assert.ok(resource, "genuine fixed role grading resources required");
    graders[role] = createPrimaryEvaluationGradingAdapter({root: ROOT, resourcesPath: resource.path, resourcesDigest: resource.digest});
    preflights[role] = bindings.map(binding => graders[role].preflight(binding.block));
    assert.ok(preflights[role].every(item => item.status === "ready" && item.blockers.length === 0), "original grading preflight blocked");
  }
  const handle = Object.freeze({kind: "prepared_personal_evolution_loop"});
  contexts.set(handle, {inputs: owned, graders: Object.freeze(graders)});
  return Object.freeze({handle, status: "NOT_RUN", preflights, pair_object_digest: owned.pairRegistrationObjectDigest,
    input_digest: canonicalDigest(owned), models_started: false, authority_implied: false,
    adoption_status: "requires_separate_saved_evaluation_and_human_authority"});
}
export function inspectPreparedPersonalEvolutionLoopFile(path, digest) {
  const bytes = readFileSync(path);
  assert.equal(comparisonHash(bytes), digest, "driver input file drift");
  return inspectPreparedPersonalEvolutionLoop(parseJsonRejectDuplicateKeys(bytes.toString("utf8")));
}
// Future direct-human-only call. Existing pair owns the durable atomic start
// token, all conditions, original grading, deadline, no-retry and saved report.
export async function startPreparedPersonalEvolutionLoop(handle, confirmedPairObjectDigest) {
  const owned = contexts.get(handle); assert.ok(owned, "opaque prepared driver handle required");
  assert.equal(confirmedPairObjectDigest, owned.inputs.pairRegistrationObjectDigest, "human must confirm fixed pair digest");
  contexts.delete(handle); // attempted start cannot reuse an in-process capability
  return await startPersonalEvolutionPromptPair({...owned.inputs, confirmedPairObjectDigest, gradingAdapters: owned.graders});
}
// Generation output is an artifact produced by the supervising Codex agent from
// the existing public generation request. This connector never creates a model
// transport, source review, approved decision or Portfolio trust.
export function importPersonalEvolutionLoopCandidate(value) {
  const input = ownJson(value);
  assert.deepEqual(Object.keys(input).sort(), ["alignmentPolicy", "generationImport"]);
  assert.equal(input.alignmentPolicy.storeRoot, input.generationImport.storeRoot);
  assert.equal(Object.hasOwn(input.alignmentPolicy, "preparationObjectDigest"), false, "imported preparation is controller-owned");
  const imported = importPersonalEvolutionGenerationResult(input.generationImport);
  const planned = planPersonalEvolutionBaselineAlignment({...input.alignmentPolicy,
    preparationObjectDigest: imported.prepared.preparation_object_digest});
  return Object.freeze({imported, planned, next_action: "independently_review_and_pin_alignment_before_apply",
    models_started: false, authority_implied: false});
}
export function applyPersonalEvolutionLoopAlignment(value) {
  return applyPersonalEvolutionBaselineAlignment(ownJson(value));
}

// Positive application remains distinct from model evaluation and source facts.
// Revalidate the entire saved recommendation before the existing independently
// approved lifecycle action. A pre-result external plan pin is mandatory.
export function applyPersonalEvolutionLoopPortfolioAction(value) {
  const input = ownJson(value);
  assert.deepEqual(Object.keys(input).sort(), ["application", "lifecyclePlanObjectDigest", "saved",
    "trustedLifecyclePlanObjectDigests"]);
  assert.ok(input.trustedLifecyclePlanObjectDigests.includes(input.lifecyclePlanObjectDigest), "separate pre-result lifecycle plan pin required");
  const registration = readContentAddressedJson({storeRoot: input.saved.storeRoot,
    digest: input.saved.pairRegistrationObjectDigest}).value;
  assert.equal(registration.kind, "personal_pre_result_prompt_pair_v2", "positive driver requires pre-result plan-bearing pair registration");
  assert.ok(registration.lifecycle_plan_object_digests.includes(input.lifecyclePlanObjectDigest), "lifecycle plan not fixed in the invoked pair");
  const result = verifyPersonalEvolutionSavedResults(input.saved);
  assert.equal(result.status, "saved_pair_verified", "positive application needs complete saved pair");
  const action = input.application;
  assert.ok(Array.isArray(action.trustedEvaluationAuthorities) && action.trustedEvaluationAuthorities.some(
    evidence => canonicalDigest(evidence) === canonicalDigest(result.evidence)), "separately trusted whole saved evaluation evidence required");
  assert.equal(action.storeRoot, input.saved.storeRoot);
  assert.equal(action.experimentObjectDigest, input.saved.experimentObjectDigest);
  const read = digest => readContentAddressedJson({storeRoot: action.storeRoot, digest}).value;
  const prep = read(input.saved.preparationObjectDigest);
  assert.equal(action.candidateObjectDigest, prep.candidate_object_digest);
  const recommendation = read(action.recommendationObjectDigest);
  assert.equal(canonicalDigest(recommendation), canonicalDigest(result.recommendation), "saved recommendation drift");
  const proposal = read(action.proposalObjectDigest);
  assert.equal(proposal.recommendation_digest, recommendation.recommendation_digest);
  assert.equal(canonicalDigest(proposal.lifecycle_plan), canonicalDigest(read(input.lifecyclePlanObjectDigest)), "pre-result lifecycle plan drift");
  assert.equal(proposal.action, "adopt_candidate", "positive driver cannot execute other mutations");
  return applyApprovedEvolutionPortfolioAction(action);
}
