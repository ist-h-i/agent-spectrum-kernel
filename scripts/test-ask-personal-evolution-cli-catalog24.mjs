// Full public CLI/registry/driver roundtrip; all generation, runners and graders are fake.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { personalCliRoundtrip } from "./test-helpers-personal-evolution-cli-roundtrip.mjs";
import { CANONICAL_PRIMARY_FIXTURE_IDS as ids } from "./ask-primary-fixture-recipe.mjs";
import { syntheticV7ScoringVersion } from "./test-helpers-primary-evaluation-v7.mjs";
import { validatePersonalEvolutionEvaluationSelection } from "./ask-personal-evolution-primary-pair.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";

test("catalog24 metadata requires explicit exact v7 selection and both fixed role resources", t => {
  const f = syntheticV7ScoringVersion(t, { fixtureIds: ids, fixtureSet: "catalog24" });
  const write = (path, value) => {
    writeFileSync(path, JSON.stringify(value)); return { path, digest: comparisonHash(readFileSync(path)) };
  };
  const configurations = Object.fromEntries(["baseline", "challenger"].map(role => [role, {
    kind: "ask_primary_grading_resources_v1", output_root: join(f.parent, `unused-${role}`),
    fixtures: Object.fromEntries((role === "baseline" ? [...ids].reverse() : ids).map(id => [id, { frozenSourceRoot: f.runtime, ...f.resource }])),
  }]));
  const evaluation = { fixtureSet: "catalog24", scoringVersion: f.selector,
    gradingResources: Object.fromEntries(Object.entries(configurations).map(([role, value]) => [role, write(join(f.parent, `${role}.json`), value)])) };
  assert.equal(validatePersonalEvolutionEvaluationSelection(evaluation, ids), "catalog24", "resource map key order is not task order");
  for (const fixtureSet of [null, "unknown", "legacy9"])
    assert.throws(() => validatePersonalEvolutionEvaluationSelection({ ...evaluation, fixtureSet }, ids));
  const omitted = structuredClone(evaluation); delete omitted.fixtureSet;
  assert.equal(validatePersonalEvolutionEvaluationSelection(omitted, ids), "catalog24");
  assert.equal(validatePersonalEvolutionEvaluationSelection(omitted, [ids[0], ids.at(-1)]), "catalog24");
  for (const selected of [[], [...ids].reverse(), [ids[0], ids[0]]])
    assert.throws(() => validatePersonalEvolutionEvaluationSelection(evaluation, selected));
  const old = JSON.parse(readFileSync(f.selector.path)); old.kind = "ask_primary_scoring_version_v6";
  assert.throws(() => validatePersonalEvolutionEvaluationSelection({ ...evaluation,
    scoringVersion: write(join(f.parent, "old-selector.json"), old) }, ids));
  const subset = structuredClone(configurations.challenger); delete subset.fixtures[ids[0]];
  assert.throws(() => validatePersonalEvolutionEvaluationSelection({ ...evaluation, gradingResources: { ...evaluation.gradingResources,
    challenger: write(join(f.parent, "subset.json"), subset) } }, ids));
  const substituted = Object.fromEntries(Object.entries(configurations).map(([role, value]) => {
    const changed = structuredClone(value); changed.fixtures[ids[0]].frozenSourceRoot = f.parent;
    return [role, write(join(f.parent, `substituted-${role}.json`), changed)];
  }));
  assert.throws(() => validatePersonalEvolutionEvaluationSelection({ ...evaluation, gradingResources: substituted }, ids));
});

personalCliRoundtrip("catalog24");

// New management input needs no set switch and may choose tasks across suites.
personalCliRoundtrip("catalog24", { fixtureIds: ["hi-authorization-exception", "mn-build-option-update"], implicitCatalog: true });
