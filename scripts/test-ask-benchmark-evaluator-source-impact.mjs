#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  computeEvaluatorSourceImpact,
  discoverAffectedAdmittedEvaluatorSources,
} from "./ask-benchmark-evaluator-source-impact.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function changedPaths(base, candidate) {
  return execFileSync("git", ["-C", ROOT, "diff", "--name-only", "-z", base, candidate, "--"], { encoding: "utf8" }).split("\0").filter(Boolean).sort();
}

test("impact discovery derives admitted evaluator intersections from the actual candidate diff", () => {
  const first = discoverAffectedAdmittedEvaluatorSources({ root: ROOT, baseRevision: "origin/main", repositoryRevision: "HEAD" });
  const second = discoverAffectedAdmittedEvaluatorSources({ root: ROOT, baseRevision: first.base_revision, repositoryRevision: first.candidate_revision });
  assert.deepEqual(first, second, "impact discovery must be deterministic");
  assert.deepEqual(first.changed_repository_paths, changedPaths(first.base_revision, first.candidate_revision));
  assert.ok(first.fixtures.length > 0, "canonical authority must expose admitted fixtures");
  const union = new Set();
  for (const fixture of first.fixtures) {
    const decision = JSON.parse(execFileSync("git", ["-C", ROOT, "show", `${first.candidate_revision}:${fixture.decision_path}`], { encoding: "utf8" }));
    const reference = JSON.parse(execFileSync("git", ["-C", ROOT, "show", `${decision.reviewed_head_revision}:benchmarks/fixtures/checkpoint-b2/${fixture.fixture_id}/evaluator-reference.json`], { encoding: "utf8" }));
    const inventory = new Set(reference.evaluator_source_identity.source_files.map(({ path }) => path));
    const expected = first.changed_repository_paths.filter((path) => inventory.has(path));
    assert.deepEqual(fixture.intersecting_changed_paths, expected, `${fixture.fixture_id} intersection must come from frozen source inventory`);
    assert.equal(fixture.affected, expected.length > 0);
    assert.equal(fixture.evaluator_revision, reference.evaluator_revision);
    assert.equal(fixture.reviewed_head_revision, decision.reviewed_head_revision);
    for (const path of expected) union.add(path);
  }
  assert.deepEqual(first.changed_evaluator_source_paths, [...union].sort());
  assert.ok(first.changed_evaluator_source_paths.length > 0, "the #253 candidate must expose its actual shared evaluator source delta");
});

test("impact computation has no fixture allowlist and preserves unaffected authorities", () => {
  const result = computeEvaluatorSourceImpact({
    changedRepositoryPaths: ["scripts/shared.mjs", "docs/note.md"],
    authorities: [
      { fixture_id: "fixture-z", source_paths: ["scripts/other.mjs"], decision_id: "decision-z" },
      { fixture_id: "fixture-a", source_paths: ["scripts/shared.mjs"], decision_id: "decision-a" },
    ],
  });
  assert.deepEqual(result.changed_evaluator_source_paths, ["scripts/shared.mjs"]);
  assert.deepEqual(result.fixtures.map(({ fixture_id: id, affected }) => [id, affected]), [["fixture-a", true], ["fixture-z", false]]);
});

test("impact computation rejects ambiguous admitted authority inventories", () => {
  assert.throws(() => computeEvaluatorSourceImpact({
    changedRepositoryPaths: ["scripts/shared.mjs"],
    authorities: [
      { fixture_id: "fixture-a", source_paths: ["scripts/shared.mjs"] },
      { fixture_id: "fixture-a", source_paths: ["scripts/other.mjs"] },
    ],
  }), /ambiguous/u);
  assert.throws(() => computeEvaluatorSourceImpact({
    changedRepositoryPaths: ["scripts/shared.mjs"],
    authorities: [{ fixture_id: "fixture-a", source_paths: ["scripts/shared.mjs", "scripts/shared.mjs"] }],
  }), /ambiguous/u);
});
