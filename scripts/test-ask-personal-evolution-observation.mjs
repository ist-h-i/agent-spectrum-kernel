import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonalEvolutionObservation, validatePersonalEvolutionObservation } from "./ask-personal-evolution-observation.mjs";

const D = `sha256:${"1".repeat(64)}`;
export const observationInput = () => ({
  observation_id: "local-review-correction-1", repository_id: "github.com/example/project",
  task_ids: ["observed-task-1"], evidence_refs: [{ artifact_id: "bounded-review", digest: D }],
  evidence_status: "Supported", correction: "An optional target was treated as a blocking requirement.",
  intended_mechanism: "Require evidence tying the blocking predicate to the same target.",
  applicability: "Bounded review of explicit optional versus mandatory requirements.",
  non_applicability: ["Unspecified product policy needs an owner decision."],
  privacy: { classification: "public_summary", raw_content_retained: false, private_answers_retained: false },
});

test("bounded observation preserves evidence strength and never grants authority", () => {
  const result = buildPersonalEvolutionObservation(observationInput());
  assert.equal(result.evidence_status, "Supported");
  assert.equal(result.authority_implied, false);
  assert.equal(result.effectiveness_status, "Unknown");
  assert.ok(Object.isFrozen(result.evidence_refs[0]));
  assert.equal(validatePersonalEvolutionObservation(result), result);
});

for (const [label, mutate] of [
  ["raw prompt", x => { x.raw_prompt = "secret"; }],
  ["private answers", x => { x.privacy.private_answers_retained = true; }],
  ["unknown privacy", x => { x.privacy.classification = "unknown"; }],
  ["duplicate task", x => { x.task_ids.push(x.task_ids[0]); }],
  ["empty evidence", x => { x.evidence_refs = []; }],
  ["invalid digest", x => { x.evidence_refs[0].digest = "latest"; }],
  ["unbounded text", x => { x.correction = "x".repeat(2049); }],
  ["credential assignment", x => { x.correction = "token=canary"; }],
  ["unrecognized evidence", x => { x.evidence_status = "effective"; }],
]) test("unsafe or unclosed observation: " + label, () => {
  const input = observationInput(); mutate(input);
  assert.throws(() => buildPersonalEvolutionObservation(input));
});

test("unknown source remains unknown and cannot turn into effectiveness", () => {
  const input = observationInput(); input.evidence_status = "Unknown";
  assert.equal(buildPersonalEvolutionObservation(input).evidence_status, "Unknown");
});

test("mutable caller inputs and tampered digest cannot change saved observation", () => {
  const input = observationInput(); const result = buildPersonalEvolutionObservation(input);
  input.correction = "different";
  assert.notEqual(result.correction, input.correction);
  assert.throws(() => validatePersonalEvolutionObservation({ ...result, correction: "tampered" }));
});
