import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareStaticFullComparison, auditStaticFullComparison, inspectPackageClosure } from "./ask-local-full-package.mjs";

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "ask-local-full-package.mjs");
function fresh(t) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), "ask-full-static-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return join(parent, "preparation");
}
test("real Full materialization binds three distinct conditions to identical public inputs", t => {
  const root = fresh(t), report = prepareStaticFullComparison(root);
  assert.equal(report.native_cli_starts, 0);
  assert.equal(report.model_calls, 0);
  assert.equal(report.live_ready, false);
  assert.equal(report.status, "blocked");
  assert.equal(report.static_package_eligible, false);
  assert.ok(report.closure.violations.some(v => v.reason === "instruction_reference_unresolved"));
  assert.equal(report.task_admission.evaluator_binding, "unknown");
  assert.equal(report.task_admission.kernel_zero_skill_workflow, "unknown");
  assert.deepEqual(report.distribution.counts, { skills: 47, prompts: 5, commands: 1 });
  assert.equal(report.distribution.source_candidate_commit, "f65a24c910135f160cfdec0bb35f9c6546d563de");
  const inputPaths = Object.keys(report.task_inputs);
  assert.equal(inputPaths.length, 13);
  for (const condition of ["plain", "kernel_only", "full_ask"]) {
    const inv = report.conditions[condition];
    for (const path of inputPaths) assert.deepEqual(inv.files[path], report.task_inputs[path]);
    assert.ok(!Object.keys(inv.files).some(p => /(?:oracle|evaluator|final-admission|scoring-input|expected-answer)/u.test(p)));
  }
  assert.deepEqual(Object.keys(report.conditions.plain.files).sort(), inputPaths.sort());
  assert.equal(Object.keys(report.conditions.kernel_only.files).length, inputPaths.length + 1);
  assert.ok(report.conditions.full_ask.files[".agent-spectrum-kernel/codex-install-state.json"]);
  assert.deepEqual(auditStaticFullComparison(root, report.record_digest), report);
  const second = prepareStaticFullComparison(join(dirname(root), "independent-preparation"));
  assert.deepEqual(second.conditions.full_ask, report.conditions.full_ask);
  assert.equal(auditStaticFullComparison(root).reason, "external_record_digest_required");
  const before = readFileSync(join(root, "controller", "static-preparation.json"));
  assert.throws(() => prepareStaticFullComparison(root), /root_exists/u);
  assert.deepEqual(readFileSync(join(root, "controller", "static-preparation.json")), before);
  // Empty PATH forbids git/installer/Codex launch during audit.
  const result = spawnSync(process.execPath, [ENTRY, "audit", root, report.record_digest], { env: { PATH: "" }, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result.stdout), report);
  assert.deepEqual(readFileSync(join(root, "controller", "static-preparation.json")), before);
  writeFileSync(join(root, "conditions/plain/task.md"), "modified");
  assert.equal(auditStaticFullComparison(root, report.record_digest).status, "blocked");
});
test("unexpected task files and symlinks block without following their contents", t => {
  const root = fresh(t), report = prepareStaticFullComparison(root);
  chmodSync(root, 0o777);
  assert.equal(auditStaticFullComparison(root, report.record_digest).reason, "private_directory_mode");
  chmodSync(root, 0o700);
  const extra = join(root, "controller/unexpected.txt");
  writeFileSync(extra, "must not read");
  assert.equal(auditStaticFullComparison(root, report.record_digest).reason, "preparation_shape_changed");
  rmSync(extra);
  const target = join(root, "conditions/plain/unknown-file");
  writeFileSync(target, "unclassified");
  assert.match(JSON.stringify(auditStaticFullComparison(root, report.record_digest)), /inventory_paths_changed/u);
  rmSync(target);
  symlinkSync(join(root, "controller/static-preparation.json"), target);
  assert.equal(auditStaticFullComparison(root, report.record_digest).status, "blocked");
  rmSync(target);
  const record = join(root, "controller/static-preparation.json");
  writeFileSync(record, readFileSync(record, "utf8").replace('"measured_ready": false', '"measured_ready": true'));
  assert.equal(auditStaticFullComparison(root, report.record_digest).reason, "static_record_digest_changed");
});
test("required imports/references fail closed without evaluating packaged modules", t => {
  const root = fresh(t); mkdirSync(root); mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts/main.mjs"), 'import "./missing.mjs";\nthrow new Error("must not execute");');
  assert.ok(inspectPackageClosure(root).violations.some(v => v.reason === "import_missing"));
  writeFileSync(join(root, "scripts/main.mjs"), 'import "../../outside.mjs";');
  assert.ok(inspectPackageClosure(root).violations.some(v => v.reason === "import_escape"));
  writeFileSync(join(root, "scripts/main.mjs"), 'const x = import("./dynamic.mjs");');
  assert.ok(inspectPackageClosure(root).violations.some(v => v.reason === "unsupported_import"));
  writeFileSync(join(root, "scripts/main.mjs"), 'import /* ambiguous syntax */ "./missing.mjs";');
  assert.ok(inspectPackageClosure(root).violations.some(v => v.reason === "unsupported_import"));
  writeFileSync(join(root, "scripts/main.mjs"), 'import "node:fs";');
  writeFileSync(join(root, "AGENTS.md"), 'Read `docs/missing.md`.');
  assert.ok(inspectPackageClosure(root).violations.some(v => v.reason === "instruction_reference_unresolved"));
  assert.ok(inspectPackageClosure(root, ["skills/review-router/SKILL.md"]).violations.some(v => v.reason === "required_asset_missing"));
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs/missing.md"), "Now present.");
  const closed = inspectPackageClosure(root, ["scripts/main.mjs"]);
  assert.equal(closed.status, "bounded_literal_closure_verified");
  assert.deepEqual(closed.violations, []);
  assert.ok(closed.unverified.includes("native_cli_discovery"));
});
test("invalid targets refuse before allocating anything", t => {
  const root = fresh(t);
  for (const target of ["relative", "/", join(root, "missing-parent/new")]) assert.throws(() => prepareStaticFullComparison(target));
});
