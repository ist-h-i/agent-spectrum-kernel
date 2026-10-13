import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { canonicalDigest, listContentAddressedJson, readContentAddressedJson } from "./content-addressed-store.mjs";
import { buildEvolutionExperiment, publishEvolutionExperiment } from "./evolution-loop.mjs";
import { preparePersonalEvolutionCandidate } from "./ask-personal-evolution.mjs";
import { verifyPersonalEvolutionSavedResults } from "./ask-personal-evolution-saved-results.mjs";

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
});
