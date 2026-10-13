import { canonicalDigest, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { verifyPortfolioEvolutionEvidence } from "./ask-benchmark-portfolio-evolution-evidence.mjs";
import { deriveEvolutionActionProposal, publishEvolutionRecommendation, publishEvolutionActionProposal,
  verifyEvolutionHumanDecision, recordEvolutionNoopReceipt } from "./evolution-loop.mjs";
import { inspectPersonalEvolution } from "./ask-personal-evolution.mjs";
import { assertPersonalEvolutionFields, freezePersonalEvolutionValue } from "./ask-personal-evolution-observation.mjs";

const NOOPS = new Set(["retain_current", "revise_candidate", "insufficient_evidence"]);
const CONNECTION_KEYS = ["schema_version", "object_kind", "preparation_object_digest", "experiment_object_digest",
  "recommendation_object_digest", "proposal_object_digest", "evaluation_evidence_digest", "action", "authority_implied", "connection_digest"];
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
const evidenceOf = recommendation => ({ authority: recommendation.evaluation_authority, dimensions: recommendation.dimensions,
  causal_attribution: recommendation.causal_attribution, reason_codes: recommendation.reason_codes });

function requirePin(digest, pins) {
  if (!Array.isArray(pins) || !pins.includes(digest)) throw new Error("saved results require an independently pinned pre-result experiment");
}

// Existing saved-file verifier only: never invokes a provider or raw grader.
export function verifyPersonalEvolutionSavedResults(options) {
  const { storeRoot, preparationObjectDigest, experimentObjectDigest, trustedExperimentObjectDigests } = options;
  requirePin(experimentObjectDigest, trustedExperimentObjectDigests);
  inspectPersonalEvolution({ ...options, preparationObjectDigest, artifacts: { experimentObjectDigest } });
  const preparation = read(storeRoot, preparationObjectDigest);
  const candidate = read(storeRoot, preparation.candidate_object_digest);
  const experiment = read(storeRoot, experimentObjectDigest);
  if (experiment.projection.mode !== "fixed_b1_exact") throw new Error("saved-file adapter supports fixed_b1_exact only; Prompt/P-K-F needs its own exact authority adapter");
  const verified = verifyPortfolioEvolutionEvidence(options);
  if (verified.recommendation.candidate_digest !== candidate.candidate_digest) throw new Error("saved results candidate transplant rejected");
  return freezePersonalEvolutionValue({ ...verified, candidate, experiment, preparation_object_digest: preparationObjectDigest,
    mutation_performed: false, models_started: false, result_access: "saved_files_only", authority_implied: false });
}

function proposalFor(result, storeRoot) {
  const { candidate, experiment, recommendation } = result;
  const actions = experiment.action_mapping.find(item => item.recommendation === recommendation.recommendation)?.actions;
  if (!actions || actions.length !== 1) throw new Error("saved recommendation must have one frozen action mapping");
  const [action] = actions;
  if (!NOOPS.has(action) && action !== "reject_candidate") throw new Error("saved-result slice requires an explicit separate lifecycle plan for this mutation action");
  const current = read(storeRoot, candidate.parent_portfolio.manifest_digest);
  if (current.registry.snapshot_digest !== candidate.registry.snapshot_digest) throw new Error("aligned pre-result parent Portfolio Registry required; do not rebase or add authority after results");
  const { lock_digest, ...manifest } = candidate.parent_portfolio;
  const lifecyclePlan = { base_registry_snapshot_digest: candidate.registry.snapshot_digest,
    base_portfolio_lock_digest: lock_digest, base_current_manifest: manifest, target_manifest: manifest,
    rollback_anchor: manifest, portfolio_transitions: [],
    asset_transitions: action === "reject_candidate"
      ? [{ asset: candidate.candidate_asset, from_state: "candidate", to_state: "retired" }] : [],
    reason_codes: ["saved_result_connection_only"] };
  return deriveEvolutionActionProposal({ candidate, experiment, recommendation, lifecyclePlan });
}

export function preparePersonalEvolutionSavedResultActions(options) {
  const result = verifyPersonalEvolutionSavedResults(options);
  const trusted = options.trustedEvaluationAuthorities;
  if (!Array.isArray(trusted) || !trusted.some(value => canonicalDigest(value) === canonicalDigest(result.evidence))) {
    throw new Error("saved evaluation evidence requires separately supplied exact trust; verifier output is not automatic authority");
  }
  const proposal = proposalFor(result, options.storeRoot);
  const recommended = publishEvolutionRecommendation({ storeRoot: options.storeRoot, recommendation: result.recommendation });
  const proposed = publishEvolutionActionProposal({ storeRoot: options.storeRoot, proposal });
  const artifacts = { experimentObjectDigest: options.experimentObjectDigest,
    recommendationObjectDigest: recommended.object_digest, proposalObjectDigest: proposed.object_digest };
  const inspected = inspectPersonalEvolution({ ...options, artifacts });
  const body = { schema_version: "1.0.0", object_kind: "personal_evolution_saved_result_connection",
    preparation_object_digest: options.preparationObjectDigest, experiment_object_digest: options.experimentObjectDigest,
    recommendation_object_digest: recommended.object_digest, proposal_object_digest: proposed.object_digest,
    evaluation_evidence_digest: canonicalDigest(result.evidence), action: proposal.action, authority_implied: false };
  const connection = { ...body, connection_digest: canonicalDigest(body) };
  const publication = putContentAddressedJson({ storeRoot: options.storeRoot, artifact: connection });
  return freezePersonalEvolutionValue({ connection_object_digest: publication.digest, connection, artifacts,
    inspection: inspected, recommendation: result.recommendation, proposal, models_started: false,
    lifecycle_mutated: false, installation_implied: false, authority_implied: false });
}

// Requires an independently supplied human decision. Never builds approval.
export function finishPersonalEvolutionSavedResultNoop(options) {
  const { storeRoot, connectionObjectDigest, decisionObjectDigest, trustedExperimentObjectDigests } = options;
  const connection = read(storeRoot, connectionObjectDigest);
  assertPersonalEvolutionFields(connection, CONNECTION_KEYS, "saved-result connection");
  const { connection_digest, ...body } = connection;
  if (connection.schema_version !== "1.0.0" || connection.object_kind !== "personal_evolution_saved_result_connection"
    || connection.authority_implied !== false || canonicalDigest(body) !== connection_digest) throw new Error("saved-result connection drifted");
  requirePin(connection.experiment_object_digest, trustedExperimentObjectDigests);
  // A self-digested connection is not proof that the saved-file adapter ran.
  // Recheck its supported protocol and exact unchanged source chain before any receipt.
  const saved = verifyPersonalEvolutionSavedResults({ ...options,
    preparationObjectDigest: connection.preparation_object_digest,
    experimentObjectDigest: connection.experiment_object_digest });
  const artifacts = { experimentObjectDigest: connection.experiment_object_digest,
    recommendationObjectDigest: connection.recommendation_object_digest,
    proposalObjectDigest: connection.proposal_object_digest, decisionObjectDigest };
  const context = { ...options, preparationObjectDigest: connection.preparation_object_digest, artifacts };
  inspectPersonalEvolution(context);
  const recommendation = read(storeRoot, connection.recommendation_object_digest);
  if (canonicalDigest(saved.evidence) !== connection.evaluation_evidence_digest
    || canonicalDigest(evidenceOf(recommendation)) !== connection.evaluation_evidence_digest
    || canonicalDigest(saved.recommendation) !== canonicalDigest(recommendation)) throw new Error("saved evaluation evidence or recommendation digest mismatch");
  const preparation = read(storeRoot, connection.preparation_object_digest);
  const closure = verifyEvolutionHumanDecision({ ...options, ...artifacts, candidateObjectDigest: preparation.candidate_object_digest });
  if (connection.action !== closure.proposal.action || !NOOPS.has(closure.proposal.action)) throw new Error("saved-result no-op cannot execute a candidate rejection or other mutation");
  if (closure.decision.disposition !== "approved") throw new Error("saved-result no-op completion requires an independently trusted approved human decision");
  const receipt = recordEvolutionNoopReceipt({ storeRoot, closure,
    baseRegistrySnapshotDigest: closure.proposal.lifecycle_plan.base_registry_snapshot_digest,
    basePortfolioLockDigest: closure.proposal.lifecycle_plan.base_portfolio_lock_digest });
  const inspection = inspectPersonalEvolution({ ...context, artifacts: { ...artifacts, receiptObjectDigest: receipt.object_digest } });
  return freezePersonalEvolutionValue({ receipt_object_digest: receipt.object_digest, inspection,
    models_started: false, lifecycle_mutated: false, installation_implied: false, authority_implied: false });
}
