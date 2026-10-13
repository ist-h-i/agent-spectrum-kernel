import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { canonicalDigest, listContentAddressedJson, readContentAddressedJson, putContentAddressedJson } from "./content-addressed-store.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, deriveEvolutionRecommendation, publishEvolutionRecommendation,
  deriveEvolutionActionProposal, publishEvolutionActionProposal, buildEvolutionHumanDecision, publishEvolutionHumanDecision } from "./evolution-loop.mjs";
import { preparePersonalEvolutionCandidate } from "./ask-personal-evolution.mjs";
import { verifyPersonalEvolutionSavedResults, finishPersonalEvolutionSavedResultNoop } from "./ask-personal-evolution-saved-results.mjs";

test("exact Prompt-v2 is refused before saved-file access, never reinterpreted as B1", t => {
  const fixture = resolve(import.meta.dirname, "../docs/fixtures/prompt-v2-preregistration");
  const reference = JSON.parse(readFileSync(resolve(fixture, "reference.json"), "utf8"));
  const adapter = reference.adapters[0];
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-saved-mode-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const storeRoot = resolve(root, "store"); cpSync(resolve(fixture, "store"), storeRoot, { recursive: true });
  const read = digest => readContentAddressedJson({ storeRoot, digest }).value;
  const candidate = read(adapter.evolution.candidate_object_digest);
  const keys = ["candidate_id", "parent_asset", "parent_portfolio", "candidate_asset", "registry", "factors", "evaluation_scope",
    "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
  const prepared = preparePersonalEvolutionCandidate({ storeRoot,
    trustedPortfolioAuthorityContexts: adapter.portfolio_authority_contexts,
    blueprint: Object.fromEntries(keys.map(key => [key, candidate[key]])), generationActor: candidate.generation.actor,
    holdoutTaskIds: [candidate.evaluation_scope.fixture_ids[0]],
    observationInput: { observation_id: "mode-test", repository_id: reference.registry.repository_id,
      task_ids: ["observed-task"], evidence_refs: [{ artifact_id: "public-summary", digest: canonicalDigest("synthetic") }],
      evidence_status: "Supported", correction: "Keep exact comparison roles separate.", intended_mechanism: "Preserve explicit projection.",
      applicability: "Exact protocol-specific comparisons.", non_applicability: ["No B1 inference from Prompt roles."],
      privacy: { classification: "public_summary", raw_content_retained: false, private_answers_retained: false } } });
  const draft = structuredClone(read(adapter.evolution.experiment_object_digest));
  draft.candidate_digest = prepared.candidate.candidate_digest;
  draft.candidate_object_digest = prepared.preparation.candidate_object_digest;
  draft.protocol.candidate_evaluation_scope_digest = canonicalDigest(prepared.candidate.evaluation_scope);
  draft.protocol.exclusions = prepared.candidate.evaluation_scope.exclusions;
  const experiment = publishEvolutionExperiment({ storeRoot, experiment: buildEvolutionExperiment(draft) });
  const before = listContentAddressedJson({ storeRoot }).map(item => item.digest);
  assert.throws(() => verifyPersonalEvolutionSavedResults({ storeRoot, preparationObjectDigest: prepared.preparation_object_digest,
    experimentObjectDigest: experiment.object_digest, trustedExperimentObjectDigests: [experiment.object_digest],
    trustedPortfolioAuthorityContexts: adapter.portfolio_authority_contexts,
    trustedExperimentAuthorities: [adapter.evolution.experiment_authority],
    aggregateOptions: { get normalizedResultsPath() { throw new Error("unexpected saved-file access"); } } }), /fixed_b1_exact only/);
  assert.deepEqual(listContentAddressedJson({ storeRoot }).map(item => item.digest), before);
  // Recomputed publisher metadata cannot confer B1 provenance on a valid
  // generic Prompt closure. These are public synthetic authorities only.
  const exactExperiment = read(experiment.object_digest);
  const syntheticReference = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../docs/fixtures/evolution-loop/reference.json"), "utf8"));
  const evidence = structuredClone(syntheticReference.trusted_contexts.evaluation[0]);
  evidence.authority.experiment_digest = exactExperiment.experiment_digest;
  const recommendation = deriveEvolutionRecommendation({ experiment: exactExperiment, evidence });
  assert.equal(recommendation.recommendation, "insufficient_evidence");
  const recommended = publishEvolutionRecommendation({ storeRoot, recommendation });
  const { lock_digest, ...manifest } = prepared.candidate.parent_portfolio;
  const proposal = deriveEvolutionActionProposal({ candidate: prepared.candidate, experiment: exactExperiment, recommendation,
    lifecyclePlan: { base_registry_snapshot_digest: prepared.candidate.registry.snapshot_digest,
      base_portfolio_lock_digest: lock_digest, base_current_manifest: manifest, target_manifest: manifest,
      rollback_anchor: manifest, portfolio_transitions: [], asset_transitions: [], reason_codes: ["synthetic_no_change"] } });
  const proposed = publishEvolutionActionProposal({ storeRoot, proposal });
  const decision = buildEvolutionHumanDecision({ proposal, disposition: "approved", reasonCodes: ["synthetic_no_change"],
    authority: prepared.candidate.authorities.decision });
  const decided = publishEvolutionHumanDecision({ storeRoot, decision });
  const body = { schema_version: "1.0.0", object_kind: "personal_evolution_saved_result_connection",
    preparation_object_digest: prepared.preparation_object_digest, experiment_object_digest: experiment.object_digest,
    recommendation_object_digest: recommended.object_digest, proposal_object_digest: proposed.object_digest,
    evaluation_evidence_digest: canonicalDigest(evidence), action: proposal.action, authority_implied: false };
  const forged = putContentAddressedJson({ storeRoot, artifact: { ...body, connection_digest: canonicalDigest(body) } });
  const beforeFinish = listContentAddressedJson({ storeRoot }).map(item => item.digest);
  assert.throws(() => finishPersonalEvolutionSavedResultNoop({ storeRoot, connectionObjectDigest: forged.digest,
    decisionObjectDigest: decided.object_digest, trustedPortfolioAuthorityContexts: adapter.portfolio_authority_contexts,
    trustedExperimentObjectDigests: [experiment.object_digest], trustedExperimentAuthorities: [adapter.evolution.experiment_authority],
    trustedEvaluationAuthorities: [evidence], trustedHumanDecisionAuthorities: [decision],
    aggregateOptions: { get normalizedResultsPath() { throw new Error("unexpected saved-file access"); } } }), /fixed_b1_exact only/);
  assert.deepEqual(listContentAddressedJson({ storeRoot }).map(item => item.digest), beforeFinish);
});
