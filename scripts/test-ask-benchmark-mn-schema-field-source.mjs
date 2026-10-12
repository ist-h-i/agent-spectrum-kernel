import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MN_SCHEMA_FIELD_ALIGNMENT_FIXTURE_ID, MN_SCHEMA_FIELD_ALIGNMENT_FIXTURE_ROOT, validateMnSchemaFieldAlignmentInputClosure } from "./ask-benchmark-mn-schema-field-source.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(root, MN_SCHEMA_FIELD_ALIGNMENT_FIXTURE_ROOT);

test("source input and existing verification-command contract close exactly", () => {
  const result = validateMnSchemaFieldAlignmentInputClosure({ root });
  assert.equal(result.fixtureId, MN_SCHEMA_FIELD_ALIGNMENT_FIXTURE_ID);
  assert.match(result.inputDigest, /^sha256:[a-f0-9]{64}$/u);
  const manifest = JSON.parse(readFileSync(resolve(fixture, "input-manifest.json"), "utf8"));
  assert.equal(manifest.fixtures[MN_SCHEMA_FIELD_ALIGNMENT_FIXTURE_ID].files.length, 8);
});

test("source preserves the frozen catalog role and ordinary task intent", () => {
  const catalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"), "utf8"));
  const item = catalog.fixtures.find(({ fixture_id }) => fixture_id === MN_SCHEMA_FIELD_ALIGNMENT_FIXTURE_ID);
  assert.equal(item.fixture_role, "primary");
  assert.equal(item.suite, "mechanism_negative");
  assert.equal(item.task_class, "small_feature");
  assert.equal(item.domain, "data_schema");
  assert.equal(item.difficulty, "easy_medium");
  assert.equal(item.lineage_required, false);
  assert.equal(item.public_intent, "Align an adjacent schema field contract without introducing a generic framework.");
});

test("seed reproduces the documented defects while other schema constraints remain", () => {
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "test/member-record.test.mjs"], { cwd: resolve(fixture, "workspace"), encoding: "utf8", env: childEnvironment });
  assert.equal(run.error, undefined);
  assert.equal(run.signal, null);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /not ok 1 - current producer payload/u);
  assert.match(run.stdout, /not ok 2 - v2 rejects/u);
  assert.match(run.stdout, /ok 5 - unknown fields remain/u);
  assert.match(run.stdout, /ok 6 - unrelated schema declarations/u);
  assert.match(run.stdout, /# pass 4/u);
  assert.match(run.stdout, /# fail 2/u);
});

test("input inventory drift is rejected", () => {
  const scratch = mkdtempSync(resolve(tmpdir(), "mn-schema-public-source-"));
  try {
    const copied = resolve(scratch, MN_SCHEMA_FIELD_ALIGNMENT_FIXTURE_ROOT);
    cpSync(fixture, copied, { recursive: true });
    writeFileSync(resolve(copied, "workspace/src/member-import.mjs"), "export const changed = true;\n");
    assert.throws(() => validateMnSchemaFieldAlignmentInputClosure({ root: scratch }), /inventory/u);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("source preparation does not pretend to carry evaluator or admission authority", () => {
  for (const name of ["metadata.json", "evaluator-reference.json", "evaluator-authority-manifest.json", "final-admission-record.json", "admission-review.json", "output-contract.json", "requirement-record.json", "source-freeze-candidate.json", "scoring-input-freeze-manifest.json", "evidence-map.json"]) {
    assert.deepEqual(JSON.parse(readFileSync(resolve(fixture, name), "utf8")), { fixture_id: MN_SCHEMA_FIELD_ALIGNMENT_FIXTURE_ID, candidate_state: "generation_pending" });
  }
});
