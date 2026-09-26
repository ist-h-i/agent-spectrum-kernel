import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import {
  assertCalibrationExecutionAdmission, assertCalibrationScoringAdmissionCandidate,
  inspectCalibrationExecutionAdmission, inspectCalibrationUnstartedInventories,
  openCalibrationExecutionAdmission, reopenCalibrationExecutionAdmission,
} from "./ask-benchmark-calibration-execution-admission.mjs";

function createInventory(t) {
  const base = realpathSync(mkdtempSync(resolve(tmpdir(), "ask291-admission-inventory-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const sources = {}; const normalizedRoots = {};
  for (const role of ["current_prompt", "prompt_v2"]) {
    const runDir = resolve(base, `run-${role}`);
    mkdirSync(resolve(runDir, "adapters"), { recursive: true });
    mkdirSync(resolve(runDir, "cases", "case-a", "attempts"), { recursive: true });
    writeFileSync(resolve(runDir, "run-identity.json"), "{}\n");
    writeFileSync(resolve(runDir, "cases", "case-a", "state.json"), "{}\n");
    const result = resolve(base, `normalized-${role}`);
    mkdirSync(result);
    writeFileSync(resolve(result, "normalized-results-root.json"), "{}\n");
    sources[role] = { execution: { runDir }, scope: { run_instance_id: "synthetic-unstarted" } };
    normalizedRoots[role] = result;
  }
  return { base, sources, normalizedRoots };
}

const candidate = () => ({ fixtures: CALIBRATION_SOURCE_BINDINGS.map(([fixture_id, source_fixture_id]) => ({
  fixture_id, source_fixture_id, admission_status: "admission_pending", effective_admission_status: "review_evidence_missing",
  admission_overlay: { decision_digest: `sha256:${"a".repeat(64)}` },
})) });

test("result-blind inventory guard accepts only empty unstarted roots", t => {
  const input = createInventory(t);
  assert.deepEqual(inspectCalibrationUnstartedInventories(input), {
    kind: "calibration_unstarted_inventory_inspection", verified_native_state: false,
    verified_private_admission: false, measured_result_bytes_read: 0,
  });
  writeFileSync(resolve(input.normalizedRoots.current_prompt, "orphan-model-output.txt"), "never read me\n");
  assert.throws(() => inspectCalibrationUnstartedInventories(input), { code: "SUCCESSOR_IDENTITY_MISMATCH" });
});

test("run guard rejects claims, attempts and orphan output before byte scanning", t => {
  const input = createInventory(t);
  const caseRoot = resolve(input.sources.current_prompt.execution.runDir, "cases", "case-a");
  mkdirSync(resolve(caseRoot, "claim"));
  assert.throws(() => inspectCalibrationUnstartedInventories(input), { code: "SUCCESSOR_IDENTITY_MISMATCH" });
  rmSync(resolve(caseRoot, "claim"), { recursive: true });
  writeFileSync(resolve(caseRoot, "attempts", "0001"), "never read me\n");
  assert.throws(() => inspectCalibrationUnstartedInventories(input), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
});

test("candidate shape rejects wrong fixture, source, missing overlay and late status", () => {
  assert.deepEqual(assertCalibrationScoringAdmissionCandidate(candidate()), {
    kind: "calibration_scoring_candidate_inspection", creates_admission: false,
  });
  for (const mutate of [
    value => { value.fixtures[0].fixture_id = "cal-other"; },
    value => { value.fixtures[0].source_fixture_id = value.fixtures[1].source_fixture_id; },
    value => { value.fixtures.reverse(); },
  ]) {
    const value = candidate(); mutate(value);
    assert.throws(() => assertCalibrationScoringAdmissionCandidate(value), { code: "SUCCESSOR_IDENTITY_MISMATCH" });
  }
  for (const mutate of [
    value => { value.fixtures[0].admission_status = "admitted"; },
    value => { value.fixtures[0].effective_admission_status = "admitted"; },
    value => { value.fixtures[0].admission_overlay = null; },
    value => { value.fixtures[0].admission_overlay.decision_digest = null; },
  ]) {
    const value = candidate(); mutate(value);
    assert.throws(() => assertCalibrationScoringAdmissionCandidate(value), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  }
});

test("opaque admission cannot be forged or reopened from a claimed digest", t => {
  assert.throws(() => inspectCalibrationExecutionAdmission({}), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  assert.throws(() => assertCalibrationExecutionAdmission({}, {}), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  assert.throws(() => reopenCalibrationExecutionAdmission({}, "sha256:bad"), { code: "SUCCESSOR_CALIBRATION_EXECUTION_ADMISSION" });
  const input = createInventory(t);
  writeFileSync(resolve(input.normalizedRoots.prompt_v2, "orphan-result.json"), "never read me\n");
  assert.throws(() => openCalibrationExecutionAdmission({ ...input, preparation: {}, scoringInputs: {} }),
    { code: "SUCCESSOR_IDENTITY_MISMATCH" });
});
