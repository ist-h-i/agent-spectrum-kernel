import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRATION_SOURCE_BINDINGS, resolvePortfolioFixtureSource, assertSuccessorCalibrationConfig } from "./ask-benchmark-calibration-source.mjs";

const source = () => ({ fixture_root: "benchmarks/fixtures/checkpoint-b2", fixtures: CALIBRATION_SOURCE_BINDINGS.map(([id, source_fixture_id, task_class, repetitions]) => ({ id, source_fixture_id, task_class, repetitions, suite: "calibration", aggregate_eligible: false, input_manifest_path: "benchmarks/fixtures/checkpoint-b2/input-manifest.json", input_manifest_sha256: "a".repeat(64) })) });

test("ordinary fixtures keep their existing physical identity", () => {
  for (const id of ["original-fixture", "pr-session-refresh-medium-hard"]) assert.equal(resolvePortfolioFixtureSource({ id }), id);
});
for (const [id, physical, task, count] of CALIBRATION_SOURCE_BINDINGS) {
  test(`${id} explicitly resolves its unchanged source input`, () => {
    const fixture = { id, source_fixture_id: physical, task_class: task, repetitions: count, suite: "calibration", aggregate_eligible: false };
    const before = structuredClone(fixture);
    assert.equal(resolvePortfolioFixtureSource(fixture), physical);
    assert.deepEqual(fixture, before);
  });
}
for (const [field, value] of [
  ["id", "primary-unrelated"], ["source_fixture_id", "../outside"],
  ["source_fixture_id", "pr-export-lease-hard"], ["source_fixture_id", null],
  ["suite", "high_impact"], ["aggregate_eligible", true], ["task_class", "implementation"], ["repetitions", 5],
]) test(`source aliases reject ${field}=${value}`, () => {
  const f = source().fixtures[0]; f[field] = value;
  assert.throws(() => resolvePortfolioFixtureSource(f));
});
test("the complete canonical config preserves four sources and 3/3/3/5 repetitions", () => {
  const config = source(); const before = structuredClone(config);
  assert.equal(assertSuccessorCalibrationConfig(config, { inputManifestDigest: "a".repeat(64) }), config);
  assert.deepEqual(config, before);
});
for (const [label, edit] of [
  ["missing", c => c.fixtures.pop()], ["extra", c => c.fixtures.push(c.fixtures[0])],
  ["duplicate", c => c.fixtures[1] = c.fixtures[0]], ["reordered", c => c.fixtures.reverse()],
  ["manifest drift", c => c.fixtures[0].input_manifest_sha256 = "b".repeat(64)],
  ["source relocation", c => c.fixture_root = "other"],
  ["unregistered manifest", c => c.fixtures[0].input_manifest_path = "other.json"],
]) test(`pre-result inventory rejects ${label}`, () => {
  const config = source(); edit(config);
  assert.throws(() => assertSuccessorCalibrationConfig(config, { inputManifestDigest: "a".repeat(64) }));
});
test("mapping entries cannot be mutated through shared imports", () => {
  assert.ok(Object.isFrozen(CALIBRATION_SOURCE_BINDINGS));
  assert.ok(CALIBRATION_SOURCE_BINDINGS.every(Object.isFrozen));
});
