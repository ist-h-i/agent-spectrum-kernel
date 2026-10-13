import { canonicalDigest, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { verifyAssetRegistry } from "./asset-registry.mjs";
import { verifyPortfolioLock } from "./portfolio-manager.mjs";
import { buildEvolutionCandidate, publishEvolutionCandidate, verifyEvolutionCandidate, verifyEvolutionExperiment,
  verifyEvolutionRecommendation, verifyEvolutionActionProposal, verifyEvolutionHumanDecision,
  verifyEvolutionApplicationReceipt } from "./evolution-loop.mjs";
import { assertPersonalEvolutionFields, buildPersonalEvolutionObservation, freezePersonalEvolutionValue,
  validatePersonalEvolutionObservation } from "./ask-personal-evolution-observation.mjs";

const BLUEPRINT_KEYS = ["candidate_id", "parent_asset", "parent_portfolio", "candidate_asset", "registry", "factors",
  "evaluation_scope", "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
const PREPARATION_KEYS = ["schema_version", "object_kind", "observation_object_digest", "candidate_object_digest",
  "holdout_task_ids", "authority_implied", "preparation_digest"];
const equal = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const sourceFor = observation => `bounded_task_observation:${observation.observation_digest}`;
const exactAsset = asset => Object.fromEntries(["asset_type", "stable_id", "version", "record_digest", "content_digest"].map(key => [key, asset[key]]));

function assertHoldout(observation, candidate, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 32 || ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) throw new Error("a bounded unique held-out task inventory is required");
  if (ids.some(id => observation.task_ids.includes(id))) throw new Error("observed and held-out task identities overlap");
  if (ids.some(id => !candidate.evaluation_scope.fixture_ids.includes(id))) throw new Error("held-out inventory is outside the candidate evaluation scope");
}

export function buildPersonalEvolutionCandidate({ observation, blueprint, generationActor, holdoutTaskIds }) {
  validatePersonalEvolutionObservation(observation);
  if (["Unknown", "Falsified"].includes(observation.evidence_status)) throw new Error("candidate derivation requires supported observation evidence; keep missing or falsified evidence separate");
  assertPersonalEvolutionFields(blueprint, BLUEPRINT_KEYS, "personal candidate blueprint");
  const draft = structuredClone(blueprint);
  draft.evaluation_scope.exclusions = [...new Set([...draft.evaluation_scope.exclusions, ...observation.non_applicability])];
  const candidate = buildEvolutionCandidate({ ...draft,
    generation: { source: sourceFor(observation), actor: structuredClone(generationActor) },
    delta: { kind: "full_content_revision", summary: observation.correction,
      delta_digest: canonicalDigest({ parent: draft.parent_asset, candidate: draft.candidate_asset, observation: observation.observation_digest }) },
    hypothesis: { intended_mechanism: observation.intended_mechanism, applicability: observation.applicability },
    assurance_lane: "challenger",
  });
  if (candidate.registry.repository_id !== observation.repository_id) throw new Error("observation repository transplant rejected");
  assertHoldout(observation, candidate, holdoutTaskIds);
  return candidate;
}

export function verifyPersonalEvolutionParent({ storeRoot, candidate, trustedAssetAuthorityContexts = [],
  trustedPortfolioAuthorityContexts = [], trustedHighImpactApprovalGrants = [] }) {
  const registry = verifyAssetRegistry({ storeRoot, snapshotDigest: candidate.registry.snapshot_digest, trustedAuthorityContexts: trustedAssetAuthorityContexts });
  for (const key of ["registry_id", "repository_id", "scope_id", "snapshot_revision"]) {
    if (registry[key] !== candidate.registry[key]) throw new Error("candidate Registry identity mismatch");
  }
  const resolveExact = ref => {
    const found = registry.assets.filter(asset => equal(exactAsset(asset), ref));
    if (found.length !== 1) throw new Error("candidate exact Asset is absent or transplanted");
    return found[0];
  };
  const parent = resolveExact(candidate.parent_asset);
  const portfolio = verifyPortfolioLock({ storeRoot, lockDigest: candidate.parent_portfolio.lock_digest,
    trustedAssetAuthorityContexts, trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants });
  if (portfolio.lock.current_manifest_digest !== candidate.parent_portfolio.manifest_digest) throw new Error("candidate parent Portfolio must be the exact current head");
  const current = portfolio.manifests.find(item => item.manifest_digest === candidate.parent_portfolio.manifest_digest)?.manifest;
  if (!current || current.entries.filter(entry => equal(entry.asset, candidate.parent_asset)).length !== 1) throw new Error("current parent Portfolio must bind the exact parent Asset once");
  if (portfolio.lock.portfolio_id !== candidate.parent_portfolio.portfolio_id || current.revision !== candidate.parent_portfolio.revision
    || current.asset_set_digest !== candidate.parent_portfolio.asset_set_digest) throw new Error("candidate parent Portfolio identity drifted");
  return freezePersonalEvolutionValue({ registry, parent });
}

function assertRegisteredCandidate(context) {
  const { registry } = verifyPersonalEvolutionParent(context);
  const { candidate } = context;
  const children = registry.assets.filter(asset => equal(exactAsset(asset), candidate.candidate_asset));
  if (children.length !== 1) throw new Error("candidate exact Asset is absent or transplanted");
  const child = children[0];
  if (child.state !== "candidate" || child.record.derivation.kind !== "full_content_revision"
    || !equal(child.record.derivation.parent, candidate.parent_asset)
    || !equal(child.record.maintenance.rollback.target, candidate.parent_asset)) throw new Error("candidate revision must retain the exact parent and rollback in candidate state");
}

// Authoring/publication only. No registry promotion, model, or installer call.
export function preparePersonalEvolutionCandidate({ storeRoot, observationInput, blueprint, generationActor,
  holdoutTaskIds, trustedAssetAuthorityContexts = [], trustedPortfolioAuthorityContexts = [], trustedHighImpactApprovalGrants = [] }) {
  const observation = buildPersonalEvolutionObservation(observationInput);
  const candidate = buildPersonalEvolutionCandidate({ observation, blueprint, generationActor, holdoutTaskIds });
  const trust = { trustedAssetAuthorityContexts, trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants };
  assertRegisteredCandidate({ storeRoot, candidate, ...trust });
  const observed = putContentAddressedJson({ storeRoot, artifact: observation });
  const published = publishEvolutionCandidate({ storeRoot, candidate });
  verifyEvolutionCandidate({ storeRoot, candidateObjectDigest: published.object_digest, ...trust });
  const body = { schema_version: "1.0.0", object_kind: "personal_evolution_preparation",
    observation_object_digest: observed.digest, candidate_object_digest: published.object_digest,
    holdout_task_ids: [...holdoutTaskIds].sort(), authority_implied: false };
  const preparation = { ...body, preparation_digest: canonicalDigest(body) };
  const saved = putContentAddressedJson({ storeRoot, artifact: preparation });
  return freezePersonalEvolutionValue({ preparation_object_digest: saved.digest, preparation,
    observation, candidate, status: "candidate_ready", models_started: false, authority_implied: false });
}

function readPreparation(storeRoot, digest) {
  const value = readContentAddressedJson({ storeRoot, digest }).value;
  assertPersonalEvolutionFields(value, PREPARATION_KEYS, "personal preparation");
  const { preparation_digest, ...body } = value;
  if (value.schema_version !== "1.0.0" || value.object_kind !== "personal_evolution_preparation"
    || value.authority_implied !== false || canonicalDigest(body) !== preparation_digest) throw new Error("personal preparation drifted");
  const observation = readContentAddressedJson({ storeRoot, digest: value.observation_object_digest }).value;
  validatePersonalEvolutionObservation(observation);
  return { preparation: value, observation };
}

// Caller supplies trusted contexts independently of the artifact inventory.
// This inspection never authorizes/apply/rolls back an installation or Portfolio.
export function inspectPersonalEvolution({ storeRoot, preparationObjectDigest, artifacts = {},
  trustedAssetAuthorityContexts = [], trustedPortfolioAuthorityContexts = [], trustedHighImpactApprovalGrants = [],
  trustedExperimentAuthorities = [], trustedEvaluationAuthorities = [], trustedHumanDecisionAuthorities = [] }) {
  const allowed = ["experimentObjectDigest", "recommendationObjectDigest", "proposalObjectDigest", "decisionObjectDigest", "receiptObjectDigest"];
  if (!artifacts || typeof artifacts !== "object" || Array.isArray(artifacts) || Object.keys(artifacts).some(key => !allowed.includes(key))) throw new Error("personal closure has unknown artifact fields");
  const { preparation, observation } = readPreparation(storeRoot, preparationObjectDigest);
  const context = { storeRoot, candidateObjectDigest: preparation.candidate_object_digest, ...structuredClone(artifacts),
    trustedAssetAuthorityContexts, trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants,
    trustedExperimentAuthorities, trustedEvaluationAuthorities, trustedHumanDecisionAuthorities };
  const verified = verifyEvolutionCandidate(context);
  const candidate = verified.candidate;
  const reconstructed = buildPersonalEvolutionCandidate({ observation,
    blueprint: Object.fromEntries(BLUEPRINT_KEYS.map(key => [key, candidate[key]])),
    generationActor: candidate.generation.actor, holdoutTaskIds: preparation.holdout_task_ids });
  if (!equal(candidate, reconstructed)) throw new Error("candidate observation binding mismatch");
  assertRegisteredCandidate({ storeRoot, candidate, trustedAssetAuthorityContexts,
    trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants });
  const stages = [["experimentObjectDigest", verifyEvolutionExperiment, "experiment_sealed"],
    ["recommendationObjectDigest", verifyEvolutionRecommendation, "recommendation_verified"],
    ["proposalObjectDigest", verifyEvolutionActionProposal, "proposal_verified"],
    ["decisionObjectDigest", verifyEvolutionHumanDecision, "decision_verified"],
    ["receiptObjectDigest", verifyEvolutionApplicationReceipt, "receipt_verified"]];
  let status = "candidate_ready", missing = false, closure = verified;
  for (const [field, verifier, next] of stages) {
    if (!context[field]) { missing = true; continue; }
    if (missing) throw new Error("personal closure cannot skip a predecessor artifact");
    closure = verifier(context); status = next;
    if (closure.candidate.candidate_digest !== candidate.candidate_digest) throw new Error("personal closure candidate transplant rejected");
  }
  return freezePersonalEvolutionValue({ status, preparation_digest: preparation.preparation_digest,
    candidate_digest: candidate.candidate_digest, observation_digest: observation.observation_digest,
    evidence_status: observation.evidence_status, authority_implied: false, mutation_performed: false,
    execution_implied: false, installation_implied: false,
    recommendation: closure.recommendation?.recommendation ?? null, action: closure.proposal?.action ?? null,
    receipt_state: closure.receipt?.state ?? null });
}
