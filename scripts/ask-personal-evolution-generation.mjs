import { realpathSync } from "node:fs";
import { relative, isAbsolute, sep } from "node:path";
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { registerAsset } from "./asset-registry.mjs";
import { buildPersonalEvolutionCandidate, preparePersonalEvolutionCandidate, verifyPersonalEvolutionParent } from "./ask-personal-evolution.mjs";
import { assertPersonalEvolutionFields, buildPersonalEvolutionObservation, validatePersonalEvolutionObservation,
  freezePersonalEvolutionValue } from "./ask-personal-evolution-observation.mjs";

const POLICY_KEYS = ["candidate_id", "parent_asset", "parent_portfolio", "registry", "factors", "evaluation_scope",
  "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
const REQUEST_KEYS = ["schema_version", "object_kind", "request_id", "observation_object_digest", "observation_digest",
  "blueprint", "generation_actor", "holdout_task_ids", "requested_version", "authority_implied", "models_started",
  "generation_effectiveness", "request_digest"];
const RESULT_KEYS = ["request_digest", "observation_digest", "parent_asset", "candidate_descriptor", "privacy"];
const equal = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const exactAsset = (record, publication) => ({ asset_type: record.asset_type, stable_id: record.stable_id,
  version: record.version, record_digest: publication.record_digest, content_digest: publication.content_digest });
const inputOf = value => Object.fromEntries(["observation_id", "repository_id", "task_ids", "evidence_refs", "evidence_status",
  "correction", "intended_mechanism", "applicability", "non_applicability", "privacy"].map(key => [key, value[key]]));

function validatePolicy({ observation, blueprint, generationActor, holdoutTaskIds, requestedVersion, requestId }) {
  assertPersonalEvolutionFields(blueprint, POLICY_KEYS, "generation candidate policy");
  if (typeof requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u.test(requestId)) throw new Error("bounded generation request ID is required");
  if (typeof requestedVersion !== "string" || !requestedVersion.trim() || requestedVersion.length > 256
    || requestedVersion === blueprint.parent_asset.version) throw new Error("generation requires a distinct bounded requested version");
  if (!["skill", "prompt"].includes(blueprint.parent_asset.asset_type)) throw new Error("generation supports instruction Assets only; evaluator Assets are excluded");
  // Schema validation only. Never publish or register this unproduced reference.
  const candidate_asset = { ...blueprint.parent_asset, version: requestedVersion,
    record_digest: canonicalDigest({ requestId, unregistered: true }),
    content_digest: canonicalDigest({ requestId, unproduced: true }) };
  buildPersonalEvolutionCandidate({ observation, blueprint: { ...blueprint, candidate_asset }, generationActor, holdoutTaskIds });
}

export function preparePersonalEvolutionGenerationRequest({ storeRoot, observationInput, blueprint, generationActor,
  holdoutTaskIds, requestedVersion, requestId, trustedAssetAuthorityContexts = [],
  trustedPortfolioAuthorityContexts = [], trustedHighImpactApprovalGrants = [] }) {
  const observation = buildPersonalEvolutionObservation(observationInput);
  validatePolicy({ observation, blueprint, generationActor, holdoutTaskIds, requestedVersion, requestId });
  verifyPersonalEvolutionParent({ storeRoot, candidate: blueprint, trustedAssetAuthorityContexts,
    trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants });
  const observed = putContentAddressedJson({ storeRoot, artifact: observation });
  const body = { schema_version: "1.0.0", object_kind: "personal_evolution_generation_request", request_id: requestId,
    observation_object_digest: observed.digest, observation_digest: observation.observation_digest,
    blueprint: structuredClone(blueprint), generation_actor: structuredClone(generationActor),
    holdout_task_ids: [...holdoutTaskIds].sort(), requested_version: requestedVersion,
    authority_implied: false, models_started: false, generation_effectiveness: "Unknown" };
  const request = { ...body, request_digest: canonicalDigest(body) };
  const saved = putContentAddressedJson({ storeRoot, artifact: request });
  return freezePersonalEvolutionValue({ request_object_digest: saved.digest, request,
    generation_input: { requested_action: "produce_candidate_files_only", request_digest: request.request_digest,
      observation, parent_asset: structuredClone(blueprint.parent_asset), requested_version: requestedVersion },
    models_started: false, authority_implied: false, generation_effectiveness: "Unknown" });
}

function readRequest(storeRoot, digest, trust) {
  const request = readContentAddressedJson({ storeRoot, digest }).value;
  assertPersonalEvolutionFields(request, REQUEST_KEYS, "saved generation request");
  const { request_digest, ...body } = request;
  if (request.schema_version !== "1.0.0" || request.object_kind !== "personal_evolution_generation_request"
    || request.authority_implied !== false || request.models_started !== false || request.generation_effectiveness !== "Unknown"
    || canonicalDigest(body) !== request_digest) throw new Error("generation request drifted");
  const observation = readContentAddressedJson({ storeRoot, digest: request.observation_object_digest }).value;
  validatePersonalEvolutionObservation(observation);
  if (observation.observation_digest !== request.observation_digest) throw new Error("generation observation transplant rejected");
  validatePolicy({ observation, blueprint: request.blueprint, generationActor: request.generation_actor,
    holdoutTaskIds: request.holdout_task_ids, requestedVersion: request.requested_version, requestId: request.request_id });
  verifyPersonalEvolutionParent({ storeRoot, candidate: request.blueprint, ...trust });
  return { request, observation };
}

function contains(root, child) {
  const path = relative(root, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

// Accepts caller-supplied file artifacts. No generator callback or process call.
export function importPersonalEvolutionGenerationResult({ storeRoot, sourceRoot, requestObjectDigest, result,
  trustedAssetAuthorityContexts = [], trustedPortfolioAuthorityContexts = [], trustedHighImpactApprovalGrants = [] }) {
  const trust = { trustedAssetAuthorityContexts, trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants };
  const { request, observation } = readRequest(storeRoot, requestObjectDigest, trust);
  assertPersonalEvolutionFields(result, RESULT_KEYS, "generation result");
  result = structuredClone(result);
  const suppliedResultDigest = canonicalDigest(result);
  assertPersonalEvolutionFields(result.privacy, ["classification", "private_answers_included", "raw_task_history_included"], "generation result privacy");
  if (result.privacy.classification !== "caller_reviewed_asset_source" || result.privacy.private_answers_included !== false
    || result.privacy.raw_task_history_included !== false) throw new Error("generation source requires caller-reviewed asset-only input");
  if (result.request_digest !== request.request_digest || result.observation_digest !== request.observation_digest
    || !equal(result.parent_asset, request.blueprint.parent_asset)) throw new Error("generation result request/observation/parent transplant rejected");
  const descriptor = structuredClone(result.candidate_descriptor);
  if (descriptor.asset_type !== request.blueprint.parent_asset.asset_type || descriptor.stable_id !== request.blueprint.parent_asset.stable_id
    || descriptor.version !== request.requested_version || descriptor.source?.repository_id !== request.blueprint.registry.repository_id
    || descriptor.derivation?.kind !== "full_content_revision" || !equal(descriptor.derivation.parent, result.parent_asset)
    || !equal(descriptor.maintenance?.rollback?.target, result.parent_asset)) throw new Error("generation descriptor identity/lineage/rollback mismatch");
  if (descriptor.safety?.status !== "not_evaluated" || descriptor.mechanism_and_evidence?.status !== "not_evaluated"
    || descriptor.evaluation_history?.status !== "not_evaluated") throw new Error("generated candidate must not claim pre-result evaluation or effectiveness");
  const source = realpathSync(sourceRoot), store = realpathSync(storeRoot);
  if (contains(source, store) || contains(store, source)) throw new Error("generation source and CAS write roots must be separate");
  const publication = registerAsset({ storeRoot, sourceRoot, predecessorSnapshotDigest: request.blueprint.registry.snapshot_digest,
    descriptor, trustedAuthorityContexts: trustedAssetAuthorityContexts });
  const candidate_asset = exactAsset(descriptor, publication);
  const prepared = preparePersonalEvolutionCandidate({ storeRoot, observationInput: inputOf(observation),
    blueprint: { ...request.blueprint, candidate_asset, registry: { ...request.blueprint.registry,
      snapshot_digest: publication.snapshot_digest, snapshot_revision: publication.snapshot_revision } },
    generationActor: request.generation_actor, holdoutTaskIds: request.holdout_task_ids, ...trust });
  const body = { schema_version: "1.0.0", object_kind: "personal_evolution_generation_receipt",
    request_object_digest: requestObjectDigest, request_digest: request.request_digest, supplied_result_digest: suppliedResultDigest,
    candidate_asset, registry_snapshot_digest: publication.snapshot_digest,
    preparation_object_digest: prepared.preparation_object_digest, authority_implied: false,
    models_started: false, generation_effectiveness: "Unknown" };
  const receipt = { ...body, receipt_digest: canonicalDigest(body) };
  const saved = putContentAddressedJson({ storeRoot, artifact: receipt });
  return freezePersonalEvolutionValue({ receipt_object_digest: saved.digest, receipt, registration: publication, prepared,
    models_started: false, authority_implied: false, generation_effectiveness: "Unknown" });
}
