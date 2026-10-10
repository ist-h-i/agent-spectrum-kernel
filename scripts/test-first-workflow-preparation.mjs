import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { prepareFirstWorkflow } from "./prepare-first-workflow.mjs";
import { captureApplyTarget, setupChildEnvironment } from "./ask-setup-apply-state.mjs";

test("public engineering preparation installs only in its owned workspace and preserves pending acceptance", () => {
  const prepared = prepareFirstWorkflow();
  try {
    const { workspace, evidence, record, parent } = prepared;
    assert.equal(record.preparation.status, "prepared");
    assert.equal(record.preparation.steps.length, 7);
    assert.ok(record.preparation.steps.every((step) => step.exit_status === 0));
    assert.equal(record.preparation.input_files.length, 10);
    assert.deepEqual(record.preparation.baseline, { command: "node --test --test-reporter=tap test/rule-service.test.mjs", exit_status: 1,
      tests: 3, passed: 2, failed: 1, log: "seed-test.log" });
    assert.equal(record.installed.status, "pass");
    const savedDoctor = JSON.parse(readFileSync(resolve(evidence, record.installed.evidence_ref)));
    assert.equal(savedDoctor.setup_interpretation.installed.status, "pass");
    assert.equal(record.preparation.managed_identities.find((item) => item.installer === "agent-spectrum-codex-adapter").profile, "implementation");
    assert.equal(record.activation.status, "insufficient_evidence");
    assert.equal(record.operational.status, "insufficient_evidence");
    assert.equal(record.operational.governance_judgment_ref, null);
    assert.equal(record.execution.state, "not_started");
    for (const section of ["runtime", "traffic", "limits"]) assert.ok(Object.values(record.execution[section]).every((value) => value === null));
    assert.deepEqual(record.execution.usage, { status: "unknown", input_tokens: null, output_tokens: null, total_tokens: null, cost: null });
    assert.equal(record.bypass.state, "not_started");
    assert.equal(record.bypass.observed_route_ref, null);
    assert.match(readFileSync(resolve(parent, "bypass-input-ja.md"), "utf8"), /ファイル変更やコマンド実行は不要/u);
    assert.ok(!existsSync(resolve(workspace, "acceptance-record.json")));
    assert.ok(!existsSync(resolve(workspace, "local-records")));
    assert.ok(!existsSync(resolve(workspace, "requirement-record.json")));
    assert.ok(!existsSync(resolve(workspace, "evaluator-authority-manifest.json")));
    assert.ok(!existsSync(resolve(workspace, "evaluator")));
    const originalPaths = JSON.parse(readFileSync(new URL("../docs/fixtures/first-workflow-315/seed.json", import.meta.url))).workspace_files;
    for (const path of originalPaths) assert.deepEqual(readFileSync(resolve(workspace, path)),
      readFileSync(new URL(`../benchmarks/fixtures/checkpoint-b2/impl-rule-batch-medium-hard/workspace/${path}`, import.meta.url)));
    assert.deepEqual(readFileSync(resolve(workspace, "task.md")),
      readFileSync(new URL("../benchmarks/fixtures/checkpoint-b2/impl-rule-batch-medium-hard/task.md", import.meta.url)));
    // Reopening a saved worksheet is byte inspection, never a new task/grade.
    const before = captureApplyTarget(workspace).binding;
    assert.deepEqual(JSON.parse(readFileSync(resolve(evidence, "acceptance-record.json"))), record);
    assert.deepEqual(captureApplyTarget(workspace).binding, before);
    assert.deepEqual(readdirSync(resolve(workspace, "src")).sort(), ["errors.mjs", "index.mjs", "rule-service.mjs", "rule-store.mjs", "validation.mjs"]);
  } finally {
    rmSync(prepared.parent, { recursive: true, force: true });
  }
});

test("preparer refuses real targets and execution options before preparation", () => {
  for (const args of [["--target", "/not-a-fixture"], ["--run"], ["--codex-bin", "/not-a-cli"], ["--json", "--json"]]) {
    const result = spawnSync(process.execPath, [new URL("./prepare-first-workflow.mjs", import.meta.url).pathname, ...args], {
      env: setupChildEnvironment(), encoding: "utf8", shell: false, timeout: 30000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /only --json is accepted/u);
    assert.equal(result.stdout, "");
  }
});
