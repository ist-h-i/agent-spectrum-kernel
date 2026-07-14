#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeSelectionDigest, sealAdaptiveSelection } from "./ask-benchmark-selection.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runner = resolve(root, "scripts/ask-benchmark.mjs");
const config = resolve(root, "benchmarks/adaptive-portfolio.config.json");
const work = mkdtempSync(resolve(root, ".ask-benchmark-selection-test-"));

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function expectFailure(name, args, pattern = /ASK benchmark failed/u) {
  const result = run(args, 1);
  assert.match(`${result.stderr}\n${result.stdout}`, pattern, name);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function differentHex(value) {
  const raw = value.replace(/^sha256:/u, "");
  const changed = `${raw[0] === "a" ? "b" : "a"}${raw.slice(1)}`;
  return value.startsWith("sha256:") ? `sha256:${changed}` : changed;
}

function repositoryRevision() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function portfolioConfigForSelection() {
  const value = JSON.parse(readFileSync(config, "utf8"));
  return {
    ...value,
    _kind: "portfolio",
    _configPath: config,
    _protocolPath: resolve(root, value.protocol_path),
  };
}

function withTemporaryTrackedChange(path, suffix, callback) {
  const original = readFileSync(path);
  try {
    writeFileSync(path, Buffer.concat([original, Buffer.from(suffix)]));
    callback();
  } finally {
    writeFileSync(path, original);
  }
}

function withTemporaryIndexChange(path, suffix, callback) {
  const original = readFileSync(path);
  const repositoryPath = relative(root, path);
  try {
    writeFileSync(path, Buffer.concat([original, Buffer.from(suffix)]));
    const staged = spawnSync("git", ["add", repositoryPath], { cwd: root, encoding: "utf8" });
    assert.equal(staged.status, 0, staged.stderr || staged.stdout);
    callback();
  } finally {
    writeFileSync(path, original);
    const restored = spawnSync("git", ["add", repositoryPath], { cwd: root, encoding: "utf8" });
    assert.equal(restored.status, 0, restored.stderr || restored.stdout);
  }
}

try {
  const planPath = resolve(work, "plan.json");
  const materialized = resolve(work, "materialized");
  const stateDir = resolve(work, "selection-state");
  run(["plan", "--config", config, "--output", planPath, "--seed", "selection-seal-regression-2026"]);
  run(["materialize", "--config", config, "--plan", planPath, "--output", materialized]);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const manifestPath = resolve(materialized, "materialization-manifest.json");
  const originalManifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(originalManifestBytes);
  const adaptive = manifest.cases.filter((entry) => entry.condition === "adaptive_ask");
  const codexCase = adaptive.find((entry) => entry.adapter === "codex");
  const claudeCase = adaptive.find((entry) => entry.adapter === "claude");
  const downgradeCase = adaptive.find((entry) => entry.case_id !== codexCase.case_id && entry.case_id !== claudeCase.case_id);
  const sealedCaseIds = new Set([codexCase.case_id, claudeCase.case_id, downgradeCase.case_id]);
  const dirtyCase = adaptive.find((entry) => !sealedCaseIds.has(entry.case_id));
  const spareCase = adaptive.find((entry) => !sealedCaseIds.has(entry.case_id) && entry.case_id !== dirtyCase.case_id);
  const crossAdapterCase = adaptive.find((entry) => entry.adapter !== codexCase.adapter && !sealedCaseIds.has(entry.case_id) && entry.case_id !== dirtyCase.case_id);
  assert.ok(codexCase && claudeCase && downgradeCase && dirtyCase && spareCase && crossAdapterCase);
  const planCases = new Map(plan.cases.map((entry) => [entry.case_id, entry]));

  function selectionInput(caseRecord, overrides = {}) {
    const planCase = planCases.get(caseRecord.case_id);
    return {
      task_class: planCase.task_class,
      observed_signals: ["cross-file contract"],
      selected_mechanisms: ["repository-orientation"],
      skipped_mechanisms: ["agent-orchestration"],
      required_gates: ["test-first-verification"],
      agents: { requested: [], omitted: ["subagent"] },
      expected_evidence: ["materialization manifest revalidation"],
      capability_downgrades: [],
      lightweight_bypass: { used: false, reason: "Observed signals require one local mechanism." },
      projection: {
        adapter_track: caseRecord.adapter,
        profile: caseRecord.projection_evidence.selected_profile,
        renderer_id: caseRecord.projection_evidence.renderer_id,
        renderer_version: caseRecord.projection_evidence.renderer_version,
        projection_fingerprint: caseRecord.projection_evidence.projection_fingerprint,
      },
      ...overrides,
    };
  }

  function sealArgs(caseRecord, inputPath, state = stateDir) {
    return ["seal-selection", "--config", config, "--plan", planPath, "--materialized", materialized, "--state-dir", state, "--case-id", caseRecord.case_id, "--input", inputPath];
  }

  function verifyArgs(caseRecord, state = stateDir, selectedPlan = planPath) {
    return ["verify-selection", "--config", config, "--plan", selectedPlan, "--materialized", materialized, "--state-dir", state, "--case-id", caseRecord.case_id];
  }

  function inputFile(name, value) {
    const path = resolve(work, `${name}.json`);
    writeJson(path, value);
    return path;
  }

  function sealWithClock(caseRecord, input, state, selectedAt) {
    return sealAdaptiveSelection({
      root,
      config: portfolioConfigForSelection(),
      planPath,
      materializedPath: materialized,
      stateDir: state,
      caseId: caseRecord.case_id,
      input,
      repositoryRevision: repositoryRevision(),
      now: () => selectedAt,
    });
  }

  const codexInput = selectionInput(codexCase);
  const codexInputPath = inputFile("codex-selection", codexInput);
  const codexSealed = sealWithClock(codexCase, codexInput, stateDir, "2026-07-14T16:00:00+09:00");
  assert.equal(codexSealed.selected_at, "2026-07-14T16:00:00+09:00");
  const claudeInput = selectionInput(claudeCase, {
    selected_mechanisms: [],
    skipped_mechanisms: ["repository-orientation", "agent-orchestration"],
    lightweight_bypass: { used: true, reason: "The observed task is localized and needs no additional mechanism." },
  });
  const claudeInputPath = inputFile("claude-bypass-selection", claudeInput);
  sealWithClock(claudeCase, claudeInput, stateDir, "2026-07-14T16:00:01+09:00");
  const downgradeInput = selectionInput(downgradeCase, {
    capability_downgrades: [{ capability: "remote-runtime-probe", reason: "Runtime capability is not evidenced in this selection-only slice." }],
  });
  const downgradeInputPath = inputFile("capability-downgrade-selection", downgradeInput);
  sealWithClock(downgradeCase, downgradeInput, stateDir, "2026-07-14T16:00:02+09:00");

  const selectionsDir = resolve(stateDir, "selections");
  const codexSelectionPath = resolve(selectionsDir, `${codexCase.case_id}.json`);
  const claudeSelectionPath = resolve(selectionsDir, `${claudeCase.case_id}.json`);
  const codexRecord = JSON.parse(readFileSync(codexSelectionPath, "utf8"));
  const claudeRecord = JSON.parse(readFileSync(claudeSelectionPath, "utf8"));
  assert.equal(codexRecord.adapter, "codex");
  assert.equal(claudeRecord.adapter, "claude");
  assert.notEqual(codexRecord.selection_digest.value, claudeRecord.selection_digest.value, "Codex and Claude seals must be distinct");
  assert.equal(claudeRecord.lightweight_bypass.used, true);
  assert.equal(JSON.parse(readFileSync(resolve(selectionsDir, `${downgradeCase.case_id}.json`), "utf8")).capability_downgrades.length, 1);
  assert.equal(existsSync(resolve(materialized, codexCase.case_id, "selections")), false, "selection state must stay outside the case root");
  assert.ok(manifest.cases.every((entry) => !entry.agent_visible_files.some((file) => file.path.includes("selection"))), "selection state must not enter workspace inventory");

  const reorderedRecord = Object.fromEntries(Object.entries(codexRecord).reverse());
  assert.equal(computeSelectionDigest(reorderedRecord), codexRecord.selection_digest.value, "canonical digest must ignore property insertion order");
  const changedBinding = structuredClone(codexRecord);
  changedBinding.case_id = spareCase.case_id;
  assert.notEqual(computeSelectionDigest(changedBinding), codexRecord.selection_digest.value, "bound identity must affect the digest");

  const selectionBytesBeforeVerify = readFileSync(codexSelectionPath);
  const indexPath = resolve(stateDir, "selection-state.json");
  const indexBytesBeforeVerify = readFileSync(indexPath);
  const firstVerify = run(verifyArgs(codexCase));
  const secondVerify = run(verifyArgs(codexCase));
  assert.equal(firstVerify.stdout, secondVerify.stdout, "repeated verification must be deterministic");
  assert.deepEqual(readFileSync(codexSelectionPath), selectionBytesBeforeVerify, "verification must not rewrite the sealed record");
  assert.deepEqual(readFileSync(indexPath), indexBytesBeforeVerify, "verification must not rewrite state identity");

  const spareInputPath = inputFile("spare-selection", selectionInput(spareCase));
  const dirtyInputPath = inputFile("dirty-selection", selectionInput(dirtyCase));
  withTemporaryTrackedChange(resolve(root, "benchmarks/schemas/adaptive-selection-input.schema.json"), "\n", () => {
    expectFailure("dirty selection input schema", sealArgs(dirtyCase, dirtyInputPath), /tracked working tree and index must match HEAD/u);
  });
  withTemporaryTrackedChange(resolve(root, "scripts/ask-benchmark-selection.mjs"), "\n// selection dirty-source regression\n", () => {
    expectFailure("dirty selection sealer source", verifyArgs(codexCase), /tracked working tree and index must match HEAD/u);
  });
  withTemporaryIndexChange(resolve(root, "benchmarks/schemas/adaptive-selection-state.schema.json"), "\n", () => {
    expectFailure("index-only dirty selection state schema", verifyArgs(codexCase), /tracked working tree and index must match HEAD/u);
  });
  run(sealArgs(dirtyCase, dirtyInputPath));
  run(verifyArgs(dirtyCase));
  sealedCaseIds.add(dirtyCase.case_id);
  expectFailure("public timestamp override", [...sealArgs(spareCase, spareInputPath), "--test-selected-at", "2026-07-14T16:00:03+09:00"], /Unknown argument: --test-selected-at/u);

  const nonAdaptive = manifest.cases.find((entry) => entry.condition === "plain");
  expectFailure("non-Adaptive case", sealArgs(nonAdaptive, inputFile("plain-selection", selectionInput(codexCase))), /not an Adaptive ASK case/u);
  expectFailure("missing case", sealArgs({ case_id: "case-0000000000000000-0000000000000000" }, spareInputPath), /does not exist/u);

  const wrongPlanPath = resolve(work, "wrong-plan.json");
  run(["plan", "--config", config, "--output", wrongPlanPath, "--seed", "selection-seal-wrong-plan"]);
  expectFailure("stale plan", verifyArgs(codexCase, stateDir, wrongPlanPath), /plan identity mismatch/u);

  function mutateManifest(name, mutate, pattern) {
    try {
      const candidate = JSON.parse(originalManifestBytes);
      mutate(candidate);
      writeJson(manifestPath, candidate);
      expectFailure(name, sealArgs(spareCase, spareInputPath, resolve(work, `state-${name.replaceAll(/[^a-z0-9]+/giu, "-")}`)), pattern);
    } finally {
      writeFileSync(manifestPath, originalManifestBytes);
    }
  }

  mutateManifest("wrong materialization manifest", (value) => { value.plan.digest = differentHex(value.plan.digest); }, /plan identity mismatch/u);
  mutateManifest("materializer revision mismatch", (value) => { value.materializer.source_revision = differentHex(value.materializer.source_revision); }, /materializer identity mismatch/u);
  mutateManifest("duplicate case IDs", (value) => { value.cases[1].case_id = value.cases[0].case_id; }, /duplicate case id/u);
  mutateManifest("case count mismatch", (value) => { value.case_count -= 1; }, /case_count/u);
  mutateManifest("adapter mismatch", (value) => { value.cases.find((entry) => entry.case_id === spareCase.case_id).adapter = spareCase.adapter === "codex" ? "claude" : "codex"; }, /does not match execution plan/u);
  mutateManifest("condition profile mismatch", (value) => { value.cases.find((entry) => entry.case_id === spareCase.case_id).projection_evidence.selected_profile = "full"; }, /expected projection profile/u);
  mutateManifest("task digest mismatch", (value) => { value.cases.find((entry) => entry.case_id === spareCase.case_id).task_digest = differentHex(value.cases.find((entry) => entry.case_id === spareCase.case_id).task_digest); }, /actual case digest mismatch/u);
  mutateManifest("workspace digest mismatch", (value) => { value.cases.find((entry) => entry.case_id === spareCase.case_id).workspace_digest = differentHex(value.cases.find((entry) => entry.case_id === spareCase.case_id).workspace_digest); }, /actual case digest mismatch/u);
  mutateManifest("frozen input digest mismatch", (value) => { value.cases.find((entry) => entry.case_id === spareCase.case_id).frozen_input_digest = differentHex(value.cases.find((entry) => entry.case_id === spareCase.case_id).frozen_input_digest); }, /actual case digest mismatch/u);
  mutateManifest("projection digest mismatch", (value) => { value.cases.find((entry) => entry.case_id === spareCase.case_id).condition_projection_digest = differentHex(value.cases.find((entry) => entry.case_id === spareCase.case_id).condition_projection_digest); }, /actual case digest mismatch/u);
  mutateManifest("projection fingerprint mismatch", (value) => { value.cases.find((entry) => entry.case_id === spareCase.case_id).projection_evidence.projection_fingerprint = differentHex(value.cases.find((entry) => entry.case_id === spareCase.case_id).projection_evidence.projection_fingerprint); }, /projection fingerprint mismatch/u);

  const spareRoot = resolve(materialized, spareCase.case_id);
  const taskPath = resolve(spareRoot, "BENCHMARK_TASK.md");
  const originalTask = readFileSync(taskPath);
  try {
    writeFileSync(taskPath, Buffer.concat([originalTask, Buffer.from("mutation\n")]));
    expectFailure("actual case file mutation", sealArgs(spareCase, spareInputPath, resolve(work, "state-mutated-file")), /actual case files|digest mismatch/u);
  } finally {
    writeFileSync(taskPath, originalTask);
  }
  const extraPath = resolve(spareRoot, "undeclared.txt");
  try {
    writeFileSync(extraPath, "undeclared\n");
    expectFailure("undeclared case file", sealArgs(spareCase, spareInputPath, resolve(work, "state-undeclared")), /actual case files/u);
  } finally {
    rmSync(extraPath, { force: true });
  }
  const evaluatorPath = resolve(spareRoot, "evaluator", "hidden.json");
  try {
    mkdirSync(dirname(evaluatorPath), { recursive: true });
    writeFileSync(evaluatorPath, "not agent visible\n");
    expectFailure("evaluator reintroduction", sealArgs(spareCase, spareInputPath, resolve(work, "state-evaluator")), /evaluator material/u);
  } finally {
    rmSync(resolve(spareRoot, "evaluator"), { recursive: true, force: true });
  }
  const symlinkPath = resolve(spareRoot, "linked.txt");
  try {
    symlinkSync(taskPath, symlinkPath);
    expectFailure("symlink reintroduction", sealArgs(spareCase, spareInputPath, resolve(work, "state-symlink")), /symlink/u);
  } finally {
    unlinkSync(symlinkPath);
  }

  const realState = resolve(work, "real-state");
  const linkedState = resolve(work, "linked-state");
  mkdirSync(realState);
  symlinkSync(realState, linkedState, "dir");
  expectFailure("state through symlink", sealArgs(spareCase, spareInputPath, linkedState), /traverses a symlink/u);
  const regularState = resolve(work, "regular-state");
  writeFileSync(regularState, "not a directory\n");
  expectFailure("state regular file", sealArgs(spareCase, spareInputPath, regularState), /absent or a directory/u);
  expectFailure("state inside case", sealArgs(spareCase, spareInputPath, resolve(spareRoot, "selection-state")), /outside all materialized case roots/u);

  const suppliedDigest = selectionInput(spareCase);
  suppliedDigest.selection_digest = { algorithm: "sha256", value: "0".repeat(64) };
  expectFailure("caller-supplied false digest", sealArgs(spareCase, inputFile("supplied-digest", suppliedDigest), resolve(work, "state-supplied-digest")), /failed JSON Schema validation/u);

  const originalIndexBytes = readFileSync(indexPath);
  function injectReusedSelection(caseRecord) {
    const reusedPath = resolve(selectionsDir, `${caseRecord.case_id}.json`);
    writeFileSync(reusedPath, readFileSync(codexSelectionPath));
    chmodSync(indexPath, 0o644);
    const index = JSON.parse(originalIndexBytes);
    index.sealed_cases.push({ case_id: caseRecord.case_id, selection_digest: codexRecord.selection_digest.value, selection_path: `selections/${caseRecord.case_id}.json` });
    writeJson(indexPath, index);
    chmodSync(indexPath, 0o444);
    return reusedPath;
  }
  const crossCase = adaptive.find((entry) => entry.adapter === codexCase.adapter && !sealedCaseIds.has(entry.case_id));
  let reusedPath = injectReusedSelection(crossCase);
  expectFailure("cross-case reuse", verifyArgs(crossCase), /sealed selection binding mismatch: case_id/u);
  rmSync(reusedPath, { force: true });
  chmodSync(indexPath, 0o644);
  writeFileSync(indexPath, originalIndexBytes);
  chmodSync(indexPath, 0o444);
  reusedPath = injectReusedSelection(crossAdapterCase);
  expectFailure("cross-adapter reuse", verifyArgs(crossAdapterCase), /sealed selection binding mismatch: case_id|adapter/u);
  rmSync(reusedPath, { force: true });
  chmodSync(indexPath, 0o644);
  writeFileSync(indexPath, originalIndexBytes);
  chmodSync(indexPath, 0o444);
  expectFailure("cross-plan reuse", verifyArgs(codexCase, stateDir, wrongPlanPath), /plan identity mismatch/u);

  expectFailure("second seal", sealArgs(codexCase, codexInputPath), /already sealed/u);
  assert.throws(() => sealWithClock(codexCase, codexInput, stateDir, "2026-07-14T16:00:04+09:00"), /already sealed/u, "a test-injected clock must not permit a reseal");
  const sealedBackup = readFileSync(codexSelectionPath);
  unlinkSync(codexSelectionPath);
  expectFailure("missing sealed selection after index record", sealArgs(codexCase, codexInputPath), /prior seal but its file is missing/u);
  writeFileSync(codexSelectionPath, sealedBackup);
  chmodSync(codexSelectionPath, 0o444);

  function mutateSealedRecord(name, mutate, pattern) {
    try {
      chmodSync(codexSelectionPath, 0o644);
      const record = JSON.parse(sealedBackup);
      mutate(record);
      writeJson(codexSelectionPath, record);
      chmodSync(codexSelectionPath, 0o444);
      expectFailure(name, verifyArgs(codexCase), pattern);
    } finally {
      chmodSync(codexSelectionPath, 0o644);
      writeFileSync(codexSelectionPath, sealedBackup);
      chmodSync(codexSelectionPath, 0o444);
    }
  }
  mutateSealedRecord("modified sealed payload", (value) => { value.observed_signals = ["tampered signal"]; }, /sealed selection digest mismatch/u);
  mutateSealedRecord("modified seal digest", (value) => { value.selection_digest.value = differentHex(value.selection_digest.value); }, /sealed selection digest mismatch/u);
  mutateSealedRecord("result field in selection record", (value) => { value.result = "forbidden"; }, /failed JSON Schema validation/u);

  const resultArtifact = resolve(spareRoot, ".benchmark-run.json");
  try {
    writeFileSync(resultArtifact, "{}\n");
    const resultManifest = JSON.parse(originalManifestBytes);
    const resultCase = resultManifest.cases.find((entry) => entry.case_id === spareCase.case_id);
    const resultBytes = readFileSync(resultArtifact);
    resultCase.projected_asset_inventory.push({ path: ".benchmark-run.json", sha256: createHash("sha256").update(resultBytes).digest("hex"), bytes: resultBytes.length, mode: "0644" });
    resultCase.projected_asset_inventory.sort((left, right) => left.path.localeCompare(right.path));
    resultCase.condition_projection_digest = canonicalDigest(resultCase.projected_asset_inventory);
    resultCase.projection_evidence.projection_fingerprint = canonicalDigest({ adapter: resultCase.adapter, condition: resultCase.condition, inventory: resultCase.projected_asset_inventory });
    writeJson(manifestPath, resultManifest);
    expectFailure("result artifact before seal", sealArgs(spareCase, spareInputPath, resolve(work, "state-result")), /result-like artifact/u);
  } finally {
    rmSync(resultArtifact, { force: true });
    writeFileSync(manifestPath, originalManifestBytes);
  }
  function expectWorkspaceBenchmarkArtifact(relativePath) {
    const artifactPaths = [];
    try {
      const resultManifest = JSON.parse(originalManifestBytes);
      for (const resultCase of resultManifest.cases.filter((entry) => entry.block_id === spareCase.block_id)) {
        const artifactPath = resolve(materialized, resultCase.case_id, relativePath);
        mkdirSync(dirname(artifactPath), { recursive: true });
        writeFileSync(artifactPath, "{}\n");
        artifactPaths.push(artifactPath);
        const artifactBytes = readFileSync(artifactPath);
        resultCase.agent_visible_files.push({ path: relativePath, sha256: createHash("sha256").update(artifactBytes).digest("hex"), bytes: artifactBytes.length, mode: "0644" });
        resultCase.agent_visible_files.sort((left, right) => left.path.localeCompare(right.path));
        resultCase.frozen_input_digest = canonicalDigest(resultCase.agent_visible_files);
        resultCase.workspace_digest = canonicalDigest(resultCase.agent_visible_files.filter((entry) => entry.path.startsWith("workspace/")));
      }
      writeJson(manifestPath, resultManifest);
      expectFailure(`workspace benchmark artifact ${relativePath}`, sealArgs(spareCase, spareInputPath, resolve(work, `state-${relativePath.replaceAll(/[^a-z0-9]+/giu, "-")}`)), /result-like artifact/u);
    } finally {
      for (const artifactPath of artifactPaths) rmSync(artifactPath, { force: true });
      writeFileSync(manifestPath, originalManifestBytes);
    }
  }
  expectWorkspaceBenchmarkArtifact("workspace/.benchmark-final.json");
  expectWorkspaceBenchmarkArtifact("workspace/.benchmark-run.json");
  expectWorkspaceBenchmarkArtifact("workspace/nested/.benchmark-events.jsonl");
  expectFailure("invalid lightweight bypass", sealArgs(spareCase, inputFile("invalid-bypass", selectionInput(spareCase, { lightweight_bypass: { used: true, reason: "invalid" } })), resolve(work, "state-invalid-bypass")), /must not claim selected mechanisms/u);
  expectFailure("empty selection without bypass", sealArgs(spareCase, inputFile("empty-selection", selectionInput(spareCase, { selected_mechanisms: [] })), resolve(work, "state-empty-selection")), /not a valid lightweight bypass/u);
  expectFailure("unsupported capability selected", sealArgs(spareCase, inputFile("unsupported-capability", selectionInput(spareCase, { selected_mechanisms: ["remote-runtime-probe"], capability_downgrades: [{ capability: "remote-runtime-probe", reason: "unavailable" }] })), resolve(work, "state-unsupported-capability")), /unavailable capability/u);
  const unknownField = selectionInput(spareCase);
  unknownField.unknown = true;
  const failedState = resolve(work, "state-failed-operation");
  expectFailure("unknown selection field", sealArgs(spareCase, inputFile("unknown-field", unknownField), failedState), /failed JSON Schema validation/u);
  assert.equal(existsSync(resolve(failedState, "selections", `${spareCase.case_id}.json`)), false, "failed seal must not leave a valid-looking selection");

  console.log("ASK benchmark selection seal tests passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}
