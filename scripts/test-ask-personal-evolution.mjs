import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { canonicalDigest, listContentAddressedJson, putContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment, deriveEvolutionRecommendation, publishEvolutionRecommendation,
  deriveEvolutionActionProposal, publishEvolutionActionProposal, buildEvolutionHumanDecision, publishEvolutionHumanDecision,
  buildEvolutionApplicationReceipt, publishEvolutionApplicationReceipt } from "./evolution-loop.mjs";
import { buildPersonalEvolutionObservation } from "./ask-personal-evolution-observation.mjs";
import { buildPersonalEvolutionCandidate, inspectPersonalEvolution, preparePersonalEvolutionCandidate } from "./ask-personal-evolution.mjs";

// Public contract-test assets only. No evaluation CLI, worker, private evaluator, or model is invoked.
const fixture = resolve(import.meta.dirname, "../docs/fixtures/prompt-v2-preregistration");
const reference = JSON.parse(readFileSync(resolve(fixture, "reference.json"), "utf8"));
const adapter = reference.adapters.find(item => item.adapter_track === "codex");
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
const blueprintKeys = ["candidate_id", "parent_asset", "parent_portfolio", "candidate_asset", "registry", "factors",
  "evaluation_scope", "expected_upside", "risks", "retirement_condition", "rollback", "prohibited_effects", "authorities"];
function setup(t) {
  const root = mkdtempSync(resolve(tmpdir(), "ask-personal-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const storeRoot = resolve(root, "store"); cpSync(resolve(fixture, "store"), storeRoot, { recursive: true });
  const original = read(storeRoot, adapter.evolution.candidate_object_digest);
  const observationInput = {
    observation_id: "bounded-local-review", repository_id: reference.registry.repository_id,
    task_ids: ["observed-local-review"], evidence_refs: [{ artifact_id: "public-summary", digest: canonicalDigest("public fixture test") }],
    evidence_status: "Supported", correction: "Bind the exact optional requirement before declaring a blocker.",
    intended_mechanism: "Keep review blockers tied to the same target and explicit requirement.",
    applicability: "Explicit optional versus required review constraints.", non_applicability: ["Owner policy remains unresolved."],
    privacy: { classification: "public_summary", raw_content_retained: false, private_answers_retained: false },
  };
  return { storeRoot, observationInput, blueprint: Object.fromEntries(blueprintKeys.map(key => [key, original[key]])),
    generationActor: original.generation.actor, holdoutTaskIds: [original.evaluation_scope.fixture_ids[0]],
    trustedPortfolioAuthorityContexts: adapter.portfolio_authority_contexts };
}
const inspect = (input, result, extra = {}) => inspectPersonalEvolution({ ...input,
  preparationObjectDigest: result.preparation_object_digest, ...extra });
function experimentFor(input, prepared) {
  const draft = structuredClone(read(input.storeRoot, adapter.evolution.experiment_object_digest));
  draft.candidate_digest = prepared.candidate.candidate_digest;
  draft.candidate_object_digest = prepared.preparation.candidate_object_digest;
  draft.protocol.candidate_evaluation_scope_digest = canonicalDigest(prepared.candidate.evaluation_scope);
  draft.protocol.exclusions = prepared.candidate.evaluation_scope.exclusions;
  return publishEvolutionExperiment({ storeRoot: input.storeRoot, experiment: buildEvolutionExperiment(draft) }).object_digest;
}

test("public registered candidate prepares idempotently without changing old CAS objects", t => {
  const input = setup(t); const before = listContentAddressedJson({ storeRoot: input.storeRoot }).map(item => item.digest);
  const result = preparePersonalEvolutionCandidate(input);
  assert.equal(result.models_started, false); assert.equal(result.authority_implied, false);
  assert.equal(inspect(input, result).status, "candidate_ready");
  assert.equal(preparePersonalEvolutionCandidate(input).preparation_object_digest, result.preparation_object_digest);
  for (const digest of before) assert.deepEqual(read(input.storeRoot, digest), read(resolve(fixture, "store"), digest));
  assert.equal(listContentAddressedJson({ storeRoot: input.storeRoot }).length, before.length + 3);
});

test("sealed exact experiment is inspected only with separately supplied trust", t => {
  const input = setup(t); const result = preparePersonalEvolutionCandidate(input);
  const experimentObjectDigest = experimentFor(input, result);
  assert.throws(() => inspect(input, result, { artifacts: { experimentObjectDigest } }), /trusted|authority/);
  const closure = inspect(input, result, { artifacts: { experimentObjectDigest },
    trustedExperimentAuthorities: [adapter.evolution.experiment_authority] });
  assert.equal(closure.status, "experiment_sealed"); assert.equal(closure.mutation_performed, false);
  assert.equal(closure.recommendation, null); assert.equal(closure.execution_implied, false);
});

test("a valid experiment from another candidate is rejected as a transplant", t => {
  const input = setup(t); const result = preparePersonalEvolutionCandidate(input);
  assert.throws(() => inspect(input, result, { artifacts: { experimentObjectDigest: adapter.evolution.experiment_object_digest },
    trustedExperimentAuthorities: [adapter.evolution.experiment_authority] }), /transplant/);
});

for (const [label, mutate, match] of [
  ["Registry identity", x => { x.blueprint.registry.registry_id = "different"; }, /Registry identity/],
  ["Asset content", x => { x.blueprint.candidate_asset.content_digest = canonicalDigest("wrong"); }, /Asset/],
  ["observed holdout", x => { x.holdoutTaskIds = x.observationInput.task_ids; }, /overlap/],
  ["out-of-scope holdout", x => { x.holdoutTaskIds = ["foreign-task"]; }, /outside/],
  ["Unknown source", x => { x.observationInput.evidence_status = "Unknown"; }, /observation evidence/],
  ["Falsified source", x => { x.observationInput.evidence_status = "Falsified"; }, /observation evidence/],
  ["collapsed actors", x => { x.generationActor.actor_id = x.blueprint.authorities.experiment.authority_id; }, /distinct|separate|actor/],
  ["historical parent", x => { x.blueprint.parent_portfolio.lock_digest = adapter.challenger_portfolio.lock_digest;
    x.blueprint.rollback.parent_portfolio.lock_digest = adapter.challenger_portfolio.lock_digest; }, /current head/],
]) test(`preflight rejects ${label} before publishing`, t => {
  const input = setup(t); const before = listContentAddressedJson({ storeRoot: input.storeRoot }).map(item => item.digest);
  mutate(input); assert.throws(() => preparePersonalEvolutionCandidate(input), match);
  assert.deepEqual(listContentAddressedJson({ storeRoot: input.storeRoot }).map(item => item.digest), before);
});

test("closure cannot skip a predecessor or accept an unknown artifact field", t => {
  const input = setup(t); const result = preparePersonalEvolutionCandidate(input);
  assert.throws(() => inspect(input, result, { artifacts: { receiptObjectDigest: canonicalDigest("receipt") } }), /skip/);
  assert.throws(() => inspect(input, result, { artifacts: { apply: true } }), /unknown/);
});

test("a recomputed preparation cannot relabel a different observation", t => {
  const input = setup(t); const result = preparePersonalEvolutionCandidate(input);
  const different = buildPersonalEvolutionObservation({ ...input.observationInput, correction: "A different correction." });
  const obs = putContentAddressedJson({ storeRoot: input.storeRoot, artifact: different });
  const { preparation_digest: ignored, ...body } = result.preparation;
  body.observation_object_digest = obs.digest;
  const saved = putContentAddressedJson({ storeRoot: input.storeRoot,
    artifact: { ...body, preparation_digest: canonicalDigest(body) } });
  assert.throws(() => inspectPersonalEvolution({ ...input, preparationObjectDigest: saved.digest }), /binding mismatch/);
});

test("candidate generation is detached from mutable blueprint and observation inputs", t => {
  const input = setup(t); const observation = buildPersonalEvolutionObservation(input.observationInput);
  const candidate = buildPersonalEvolutionCandidate({ ...input, observation });
  input.blueprint.risks.push("later mutation");
  assert.equal(candidate.risks.includes("later mutation"), false);
  assert.ok(candidate.evaluation_scope.exclusions.includes(input.observationInput.non_applicability[0]));
});

for (const [label, mutate, match] of [
  ["recomputed Registry identity", x => { x.blueprint.registry.registry_id = "different"; }, /Registry identity/],
  ["recomputed historical parent", x => { x.blueprint.parent_portfolio.lock_digest = adapter.challenger_portfolio.lock_digest;
    x.blueprint.rollback.parent_portfolio.lock_digest = adapter.challenger_portfolio.lock_digest; }, /current head/],
]) test(`inspection rejects ${label} even when preparation digest is valid`, t => {
  const input = setup(t); mutate(input);
  const observation = buildPersonalEvolutionObservation(input.observationInput);
  const candidate = buildPersonalEvolutionCandidate({ ...input, observation });
  const observed = putContentAddressedJson({ storeRoot: input.storeRoot, artifact: observation });
  const published = putContentAddressedJson({ storeRoot: input.storeRoot, artifact: candidate });
  const body = { schema_version: "1.0.0", object_kind: "personal_evolution_preparation",
    observation_object_digest: observed.digest, candidate_object_digest: published.digest,
    holdout_task_ids: input.holdoutTaskIds, authority_implied: false };
  const saved = putContentAddressedJson({ storeRoot: input.storeRoot, artifact: { ...body, preparation_digest: canonicalDigest(body) } });
  assert.throws(() => inspectPersonalEvolution({ ...input, preparationObjectDigest: saved.digest }), match);
});

test("six-object synthetic insufficient-evidence closure never means installation or adoption", t => {
  const input = setup(t); const prepared = preparePersonalEvolutionCandidate(input);
  const experimentObjectDigest = experimentFor(input, prepared);
  const experiment = read(input.storeRoot, experimentObjectDigest);
  const syntheticReference = JSON.parse(readFileSync(resolve(import.meta.dirname, "../docs/fixtures/evolution-loop/reference.json"), "utf8"));
  const evidence = structuredClone(syntheticReference.trusted_contexts.evaluation[0]);
  evidence.authority.experiment_digest = experiment.experiment_digest;
  const recommendation = deriveEvolutionRecommendation({ experiment, evidence });
  assert.equal(recommendation.recommendation, "insufficient_evidence");
  const recommendationObjectDigest = publishEvolutionRecommendation({ storeRoot: input.storeRoot, recommendation }).object_digest;
  const { lock_digest, ...manifest } = prepared.candidate.parent_portfolio;
  const proposal = deriveEvolutionActionProposal({ candidate: prepared.candidate, experiment, recommendation,
    lifecyclePlan: { base_registry_snapshot_digest: prepared.candidate.registry.snapshot_digest,
      base_portfolio_lock_digest: lock_digest, base_current_manifest: manifest, target_manifest: manifest,
      rollback_anchor: manifest, portfolio_transitions: [], asset_transitions: [], reason_codes: ["synthetic_no_change"] } });
  const proposalObjectDigest = publishEvolutionActionProposal({ storeRoot: input.storeRoot, proposal }).object_digest;
  const decision = buildEvolutionHumanDecision({ proposal, disposition: "approved", reasonCodes: ["synthetic_no_change"],
    authority: prepared.candidate.authorities.decision });
  const decisionObjectDigest = publishEvolutionHumanDecision({ storeRoot: input.storeRoot, decision }).object_digest;
  const heads = { registry_snapshot_digest: prepared.candidate.registry.snapshot_digest, portfolio_lock_digest: lock_digest };
  const receipt = buildEvolutionApplicationReceipt({ schema_version: "1.0.0", object_kind: "evolution_application_receipt",
    candidate_digest: prepared.candidate.candidate_digest, experiment_digest: experiment.experiment_digest,
    recommendation_digest: recommendation.recommendation_digest, proposal_digest: proposal.proposal_digest,
    decision_digest: decision.decision_digest, action: proposal.action, state: "completed", base_heads: heads,
    result_heads: heads, rollback_anchor: manifest, steps: [], next_step: null, stop: null,
    predecessor_receipt_digest: null, history_preserved: true, authority_implied: false });
  const receiptObjectDigest = publishEvolutionApplicationReceipt({ storeRoot: input.storeRoot, receipt }).object_digest;
  const artifacts = { experimentObjectDigest, recommendationObjectDigest, proposalObjectDigest, decisionObjectDigest, receiptObjectDigest };
  const trust = { trustedExperimentAuthorities: [adapter.evolution.experiment_authority],
    trustedEvaluationAuthorities: [evidence], trustedHumanDecisionAuthorities: [decision] };
  assert.throws(() => inspect(input, prepared, { artifacts, ...trust, trustedEvaluationAuthorities: [] }), /authority/);
  assert.throws(() => inspect(input, prepared, { artifacts, ...trust, trustedHumanDecisionAuthorities: [] }), /authority/);
  const count = listContentAddressedJson({ storeRoot: input.storeRoot }).length;
  const result = inspect(input, prepared, { artifacts, ...trust });
  assert.equal(result.status, "receipt_verified"); assert.equal(result.receipt_state, "completed");
  assert.equal(result.action, "insufficient_evidence"); assert.equal(result.recommendation, "insufficient_evidence");
  assert.equal(result.installation_implied, false); assert.equal(result.authority_implied, false);
  assert.equal(listContentAddressedJson({ storeRoot: input.storeRoot }).length, count);
});
