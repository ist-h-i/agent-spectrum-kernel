import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MN_FRONTEND_DEFAULT_FIXTURE_ID, MN_FRONTEND_DEFAULT_FIXTURE_ROOT, validateMnFrontendDefaultInputClosure } from "./ask-benchmark-mn-frontend-default-source.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(root, MN_FRONTEND_DEFAULT_FIXTURE_ROOT);

test("source input and existing verification-command contract close exactly", () => {
  const result = validateMnFrontendDefaultInputClosure({ root });
  assert.equal(result.fixtureId, MN_FRONTEND_DEFAULT_FIXTURE_ID);
  assert.match(result.inputDigest, /^sha256:[a-f0-9]{64}$/u);
  const manifest = JSON.parse(readFileSync(resolve(fixture, "input-manifest.json"), "utf8"));
  assert.equal(manifest.fixtures[MN_FRONTEND_DEFAULT_FIXTURE_ID].files.length, 6);
});

test("source preserves the frozen catalog role and ordinary task intent", () => {
  const catalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"), "utf8"));
  const item = catalog.fixtures.find(({ fixture_id }) => fixture_id === MN_FRONTEND_DEFAULT_FIXTURE_ID);
  assert.equal(item.fixture_role, "primary");
  assert.equal(item.suite, "mechanism_negative");
  assert.equal(item.task_class, "local_bug_fix");
  assert.equal(item.domain, "frontend");
  assert.equal(item.difficulty, "medium");
  assert.equal(item.lineage_required, false);
  assert.equal(item.public_intent, "Implement and verify a focused local default-state correction.");
});

test("seed reproduces the documented defects while ordinary update/reset checks pass", () => {
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "test/display-preferences.test.mjs"], { cwd: resolve(fixture, "workspace"), encoding: "utf8", env: childEnvironment });
  assert.equal(run.error, undefined);
  assert.equal(run.signal, null);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /not ok 2 - first load preserves/u);
  assert.match(run.stdout, /not ok 3 - non-boolean storage/u);
  assert.match(run.stdout, /ok 5 - updates preserve/u);
  assert.match(run.stdout, /ok 6 - reset returns/u);
  assert.match(run.stdout, /# pass 4/u);
  assert.match(run.stdout, /# fail 2/u);
});

test("input inventory drift is rejected", () => {
  const scratch = mkdtempSync(resolve(tmpdir(), "mn-frontend-public-source-"));
  try {
    const copied = resolve(scratch, MN_FRONTEND_DEFAULT_FIXTURE_ROOT);
    cpSync(fixture, copied, { recursive: true });
    writeFileSync(resolve(copied, "workspace/src/display-preferences.mjs"), "export const changed = true;\n");
    assert.throws(() => validateMnFrontendDefaultInputClosure({ root: scratch }), /inventory/u);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("source preparation does not pretend to carry evaluator or admission authority", () => {
  for (const name of ["metadata.json", "evaluator-reference.json", "evaluator-authority-manifest.json", "final-admission-record.json", "admission-review.json", "output-contract.json", "requirement-record.json", "source-freeze-candidate.json", "scoring-input-freeze-manifest.json", "evidence-map.json"]) {
    assert.deepEqual(JSON.parse(readFileSync(resolve(fixture, name), "utf8")), { fixture_id: MN_FRONTEND_DEFAULT_FIXTURE_ID, candidate_state: "generation_pending" });
  }
});
