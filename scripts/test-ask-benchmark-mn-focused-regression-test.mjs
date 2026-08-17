#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { resolveRepositoryAdmissionDecision } from "./ask-benchmark-admission-decision.mjs";
import {
  createSealedEvaluatorExecutionForTest,
  executeSealedEvaluatorForTest,
  readEvaluatorAuthorityAnchorFromFreeze,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { resolvePortfolioExecutionAdmission, resolvePortfolioExecutionFixtures } from "./ask-benchmark-plan.mjs";
import { computeResultProfileDigest } from "./ask-benchmark-scoring-contract.mjs";
import { validateEquivalenceAuthority, validateMatchedEquivalenceIds, validateMutationAuthority } from "./ask-benchmark-mn-build-option-update.mjs";
import {
  MN_FOCUSED_REGRESSION_FIXTURE_ID as FIXTURE_ID,
  MN_FOCUSED_REGRESSION_FIXTURE_ROOT as FIXTURE_ROOT_RELATIVE,
  sha256,
  validateMnFocusedRegressionTestInputClosure,
} from "./ask-benchmark-mn-focused-regression-test.mjs";
import {
  buildMnFocusedRegressionTestAuthority,
  validateMnFocusedRegressionTestProductionAuthority,
} from "./ask-benchmark-mn-focused-regression-test-authority.mjs";
import { generateMnFocusedRegressionTestReviewArchive } from "./ask-benchmark-mn-focused-regression-test-review-archive.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = resolve(ROOT, FIXTURE_ROOT_RELATIVE);
const WORKSPACE_ROOT = resolve(FIXTURE_ROOT, "workspace");
const REQUIREMENT_IDS = ["regression-behavior-coverage", "production-behavior-preservation", "request-scope-discipline", "verification-evidence"];
const MAX_POINTS = [5, 2, 2, 1];
const EQUIVALENCE_IDS = ["equivalent-mutation-catching-regression", "equivalent-production-preservation", "equivalent-focused-test-change", "equivalent-focused-verification"];
const FINDING_SEEDS = [
  ["missing-regression-coverage", "incorrect_verification", "high"],
  ["production-behavior-not-preserved", "unauthorized_change", "high"],
  ["focused-change-scope-not-met", "incorrect_decision", "medium"],
  ["missing-or-inaccurate-verification-evidence", "insufficient_evidence", "medium"],
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function privateArgs(argv) {
  const privateIndex = argv.indexOf("--private-root");
  const casesIndex = argv.indexOf("--private-case-root");
  if ((privateIndex === -1) !== (casesIndex === -1)) throw new Error("--private-root and --private-case-root must be supplied together");
  return privateIndex === -1 ? null : { privateRoot: resolve(argv[privateIndex + 1]), caseRoot: resolve(argv[casesIndex + 1]) };
}

function createBoundaryRoots(work) {
  const fields = {
    materializedPath: ["materialized", "materialization-manifest.json"],
    selectionState: ["selection", "selection-state.json"],
    runDir: ["run", "run-identity.json"],
    normalizedResultsPath: ["normalized", "normalized-results-root.json"],
  };
  return Object.fromEntries(Object.entries(fields).map(([field, [directory, marker]]) => {
    const root = resolve(work, directory);
    mkdirSync(root, { recursive: true });
    writeFileSync(resolve(root, marker), "{}\n");
    return [field, root];
  }));
}

function expectFailure(operation, pattern, label) {
  assert.throws(operation, pattern, label);
}

function portableStates(root, current = root) {
  const states = new Map();
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = resolve(current, entry.name);
    const path = relative(root, absolute).split(sep).join("/");
    const status = lstatSync(absolute);
    let state;
    if (status.isSymbolicLink()) state = { path, file_type: "symlink", mode: status.mode & 0o777, bytes: null, sha256: null };
    else if (status.isDirectory()) state = { path, file_type: "directory", mode: status.mode & 0o777, bytes: null, sha256: null };
    else if (status.isFile() && !status.isSymbolicLink()) {
      const bytes = readFileSync(absolute);
      state = { path, file_type: "file", mode: status.mode & 0o777, bytes: bytes.length, sha256: digestBytes(bytes) };
    } else throw new Error(`private test workspace contains an unsupported path type: ${path}`);
    states.set(path, state);
    if (status.isDirectory()) for (const [childPath, child] of portableStates(root, absolute)) states.set(childPath, child);
  }
  return states;
}

function repositoryDiffArtifact(frozen, candidate) {
  const before = portableStates(frozen);
  const after = portableStates(candidate);
  const diffEntries = [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((path) => {
    const frozenState = before.get(path) ?? null;
    const candidateState = after.get(path) ?? null;
    if (stableCanonicalJson(frozenState) === stableCanonicalJson(candidateState)) return [];
    return [{ path, change_type: frozenState === null ? "addition" : candidateState === null ? "deletion" : "modification", before: frozenState, after: candidateState }];
  });
  return { artifact_digest: canonicalDigest(diffEntries), artifact_bytes: Buffer.byteLength(stableCanonicalJson(diffEntries)) || 1, diff_entries: diffEntries };
}

function commandEvidence(caseEntry) {
  const state = caseEntry.verification_state ?? "success";
  if (state === "missing") return [];
  const correct = state !== "wrong_command";
  const succeeded = state !== "failed";
  return [{
    command_id: correct ? "session-key-focused-test" : "unrelated-command",
    match_state: "matched",
    outcome: succeeded ? "succeeded" : "failed",
    exit_code: succeeded ? 0 : 1,
    digest: canonicalDigest({ case_id: caseEntry.case_id, state }),
    bytes: 1,
  }];
}

function normalizedResult(caseEntry, index) {
  return {
    normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, case_id: caseEntry.case_id }),
    lineage: {
      run_instance_id: `20720720-7207-4207-8207-${String(index + 1).padStart(12, "0")}`,
      case_id: `case-2072072072072072-${String(index + 101).padStart(16, "0")}`,
      attempt: "0001",
    },
    command_evidence: {
      capture_support: "supported",
      evidence_level: "complete",
      required_command_ids: ["session-key-focused-test"],
      required_alternative_groups: [],
      references: commandEvidence(caseEntry),
      cwd_unverified_command_count: 0,
    },
  };
}

function applyCase(candidate, entry) {
  const testPath = resolve(candidate, "test/session-key.test.mjs");
  if (typeof entry.test_source === "string") writeFileSync(testPath, entry.test_source);
  for (const [path, suffix] of Object.entries(entry.append_files ?? {})) writeFileSync(resolve(candidate, path), `${readFileSync(resolve(candidate, path), "utf8")}${suffix}`);
  for (const [path, bytes] of Object.entries(entry.new_files ?? {})) {
    mkdirSync(dirname(resolve(candidate, path)), { recursive: true });
    writeFileSync(resolve(candidate, path), bytes);
  }
  for (const [path, replacement] of Object.entries(entry.replacements ?? {})) {
    const absolute = resolve(candidate, path);
    const source = readFileSync(absolute, "utf8");
    assert.equal(source.split(replacement.from).length - 1, 1, `${entry.case_id} replacement source must be unique`);
    writeFileSync(absolute, source.replace(replacement.from, replacement.to));
  }
  for (const [from, to] of Object.entries(entry.rename_paths ?? {})) {
    mkdirSync(dirname(resolve(candidate, to)), { recursive: true });
    renameSync(resolve(candidate, from), resolve(candidate, to));
  }
  for (const path of entry.delete_paths ?? []) rmSync(resolve(candidate, path), { recursive: true, force: true });
  for (const path of entry.directory_paths ?? []) {
    rmSync(resolve(candidate, path), { recursive: true, force: true });
    mkdirSync(resolve(candidate, path), { recursive: true });
  }
  for (const [path, mode] of Object.entries(entry.mode_changes ?? {})) chmodSync(resolve(candidate, path), mode);
}

function evaluatorProjection(result) {
  return {
    evaluation_status: result.evaluation_status,
    requirement_results: result.requirement_results,
    findings: result.findings,
    scope_deviations: result.scope_deviations,
    verification_correctness: result.verification_correctness,
    evidence_correctness: result.evidence_correctness,
    under_processing: result.under_processing,
    over_processing: result.over_processing,
    classification: result.classification,
    result_profile: result.result_profile,
    scoring_ready: result.scoring_ready,
  };
}

function expectedProjection(entry, normalized, diffArtifact) {
  const verificationSource = commandEvidence(entry).find(({ command_id, match_state, outcome, exit_code }) => command_id === "session-key-focused-test" && match_state === "matched" && outcome === "succeeded" && exit_code === 0);
  const normalizedReference = { kind: "normalized_result", digest: normalized.normalized_result_digest, bytes: 1 };
  const diffReference = { kind: "repository_diff", digest: diffArtifact.artifact_digest, bytes: diffArtifact.artifact_bytes };
  const verificationReference = verificationSource ? { kind: "execution_event", digest: verificationSource.digest, bytes: verificationSource.bytes } : null;
  const standard = [normalizedReference, diffReference, ...(verificationReference ? [verificationReference] : [])];
  const scopeIds = entry.expected_scope_deviation ? ["unauthorized-candidate-change"] : [];
  const findings = FINDING_SEEDS.flatMap(([finding_id, category, severity], index) => entry.expected_passes[index] ? [] : [{ finding_id, category, severity, evidence_references: standard }]);
  const observation = (state, evidence = standard) => ({ state, evidence_references: evidence });
  return {
    evaluation_status: "completed",
    requirement_results: REQUIREMENT_IDS.map((requirement_id, index) => ({
      requirement_id,
      outcome: entry.expected_passes[index] ? "pass" : "fail",
      earned_points: entry.expected_passes[index] ? MAX_POINTS[index] : 0,
      matched_equivalence_class_ids: entry.expected_passes[index] ? [EQUIVALENCE_IDS[index]] : [],
      finding_ids: entry.expected_passes[index] ? [] : [FINDING_SEEDS[index][0]],
      evidence_references: standard,
      scope_deviation_references: scopeIds,
      verification_evidence_references: verificationReference ? [verificationReference] : [],
      verification_evidence_state: verificationReference ? "executed_success" : "missing",
    })),
    findings,
    scope_deviations: entry.expected_scope_deviation ? [{ finding_id: "unauthorized-candidate-change", category: "unauthorized_change", severity: "high", evidence_references: standard }] : [],
    verification_correctness: observation(entry.expected_passes[3] ? "pass" : "fail", verificationReference ? [verificationReference] : standard),
    evidence_correctness: observation(entry.expected_evidence_correctness),
    under_processing: observation(entry.expected_passes.every(Boolean) ? "not_detected" : "detected"),
    over_processing: observation(entry.expected_scope_deviation ? "detected" : "not_detected"),
    classification: entry.expected_classification,
    result_profile: { name: "binary_scope_verification_v1", digest: computeResultProfileDigest() },
    scoring_ready: false,
  };
}

function validateFrozenDesign() {
  const record = readJson(resolve(ROOT, "benchmarks/portfolio-design-admission-records/mn-focused-regression-test.json"));
  assert.deepEqual(record.catalog_metadata, {
    suite: "mechanism_negative",
    task_class: "verification_only",
    domain: "testing",
    difficulty: "medium",
    repetitions: 3,
    capability_families: ["regression_testing", "verification_discipline"],
    evidence_topologies: ["implementation_and_tests", "single_file_spec"],
    outcome_dimensions: ["evidence_completeness", "regression_prevention"],
    risk_boundary: "none",
  });
  assert.equal(record.answer_neutral_design.output_contract_type, "implementation_producing");
  assert.equal(record.answer_neutral_design.evidence_removal_mutation_topology, "implementation_and_tests");
  assert.equal(record.answer_neutral_design.suspicious_but_correct_control_required, false);
  assert.equal(record.answer_neutral_design.safety_approval_boundary_required, false);
}

function runShell(script, cwd) {
  return spawnSync("/bin/bash", ["-lc", script], { cwd, encoding: "utf8", timeout: 60_000 });
}

function validateVisibleScenario() {
  const task = readFileSync(resolve(FIXTURE_ROOT, "task.md"), "utf8");
  const specification = readFileSync(resolve(WORKSPACE_ROOT, "spec/session-key.md"), "utf8");
  const implementation = readFileSync(resolve(WORKSPACE_ROOT, "src/session-key.mjs"), "utf8");
  const test = readFileSync(resolve(WORKSPACE_ROOT, "test/session-key.test.mjs"), "utf8");
  assert.match(task, /existing focused test suite.+production behavior.+unchanged.+repository test command/isu);
  assert.match(specification, /case-insensitive.+lowercase the complete region label/isu);
  assert.match(implementation, /\.toLowerCase\(\)/u);
  assert.doesNotMatch(test, /Us-East-1|eU-West-2|aP-South-1/u, "frozen suite must leave the mixed-case boundary unprotected");
  const baseline = spawnSync("npm", ["test"], { cwd: WORKSPACE_ROOT, encoding: "utf8", timeout: 60_000 });
  assert.equal(baseline.status, 0, baseline.stderr || baseline.stdout);
  const verification = readJson(resolve(FIXTURE_ROOT, "verification-command-contract.json"));
  const command = verification.commands.find(({ command_id }) => command_id === "session-key-focused-test");
  assert.ok(command, "focused verification command must exist");
  const work = mkdtempSync(resolve(tmpdir(), "mn-focused-regression-visible-"));
  cpSync(WORKSPACE_ROOT, work, { recursive: true });
  const original = runShell(command.canonical_script, work);
  assert.equal(original.status, 0, original.stderr || original.stdout);
  writeFileSync(resolve(work, "test/session-key.test.mjs"), `${readFileSync(resolve(work, "test/session-key.test.mjs"), "utf8")}\n// candidate test edit\n`);
  const testEdit = runShell(command.canonical_script, work);
  assert.equal(testEdit.status, 0, "verification anchor must permit the requested test-file edit");
  writeFileSync(resolve(work, "src/session-key.mjs"), `${readFileSync(resolve(work, "src/session-key.mjs"), "utf8")}\n// protected drift\n`);
  const sourceDrift = runShell(command.canonical_script, work);
  assert.equal(sourceDrift.status, 41, "verification anchor must reject production-source drift");
}

function validationCopy(name) {
  const work = mkdtempSync(resolve(tmpdir(), `mn-focused-regression-${name}-`));
  const cloned = spawnSync("git", ["clone", "--shared", "--quiet", ROOT, work], { encoding: "utf8" });
  assert.equal(cloned.status, 0, cloned.stderr || cloned.stdout);
  cpSync(FIXTURE_ROOT, resolve(work, FIXTURE_ROOT_RELATIVE), { recursive: true, force: true });
  cpSync(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"), resolve(work, "benchmarks/adaptive-portfolio.config.json"), { force: true });
  return work;
}

function validatePublicNegativeCoverage() {
  const vocabulary = validationCopy("vocabulary");
  writeFileSync(resolve(vocabulary, FIXTURE_ROOT_RELATIVE, "task.md"), "Complete this benchmark evaluator task.\n");
  expectFailure(() => validateMnFocusedRegressionTestInputClosure({ root: vocabulary }), /benchmark-specific vocabulary/u, "public vocabulary leakage");
  const inventory = validationCopy("inventory");
  writeFileSync(resolve(inventory, FIXTURE_ROOT_RELATIVE, "workspace/notes.txt"), "drift\n");
  expectFailure(() => validateMnFocusedRegressionTestInputClosure({ root: inventory }), /inventory/u, "agent-visible inventory drift");
  const privateLeak = validationCopy("private-leak");
  writeFileSync(resolve(privateLeak, FIXTURE_ROOT_RELATIVE, "workspace/oracle.json"), "{}\n");
  expectFailure(() => validateMnFocusedRegressionTestInputClosure({ root: privateLeak }), /prohibited/u, "private material leakage");
  const inputDrift = validationCopy("input-drift");
  const inputPath = resolve(inputDrift, FIXTURE_ROOT_RELATIVE, "input-manifest.json");
  const input = readJson(inputPath);
  input.fixtures[FIXTURE_ID].files[0].sha256 = "0".repeat(64);
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  expectFailure(() => validateMnFocusedRegressionTestInputClosure({ root: inputDrift }), /inventory/u, "input digest drift");
  const verificationDrift = validationCopy("verification-drift");
  const verificationPath = resolve(verificationDrift, FIXTURE_ROOT_RELATIVE, "verification-command-contract.json");
  const verification = readJson(verificationPath);
  verification.fixture_input_digest = `sha256:${"0".repeat(64)}`;
  writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
  expectFailure(() => validateMnFocusedRegressionTestInputClosure({ root: verificationDrift }), /digest|binding/u, "verification/input transplant");
  const symlink = validationCopy("symlink");
  symlinkSync(resolve(symlink, FIXTURE_ROOT_RELATIVE, "workspace/src/session-key.mjs"), resolve(symlink, FIXTURE_ROOT_RELATIVE, "workspace/symlink.mjs"));
  expectFailure(() => validateMnFocusedRegressionTestInputClosure({ root: symlink }), /symlink/u, "agent-visible symlink");
}

function validateProductionNegativeCoverage() {
  for (const [name, relativePath, mutate, pattern] of [
    ["missing-requirement-evidence", "requirement-record.json", (value) => { value.requirements[0].evidence_map_ids = []; }, /requirement|evidence|digest/u],
    ["evaluator-reference-mismatch", "evaluator-reference.json", (value) => { value.evaluator_authority_manifest_digest = `sha256:${"0".repeat(64)}`; }, /digest|binding|transplanted/u],
    ["stale-source-freeze", "source-freeze-candidate.json", (value) => { value.public_bindings.input_manifest.raw_sha256 = `sha256:${"0".repeat(64)}`; }, /state|digest|binding/u],
  ]) {
    const root = validationCopy(`production-${name}`);
    const path = resolve(root, FIXTURE_ROOT_RELATIVE, relativePath);
    const value = readJson(path);
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
    expectFailure(() => validateMnFocusedRegressionTestProductionAuthority({ root }), pattern, name);
  }
}

function validatePrivateEvidenceMapClosure(requirement, evidenceMap, oracle) {
  const maps = new Map(evidenceMap.maps.map((entry) => [entry.evidence_map_id, entry]));
  for (const entry of requirement.requirements) {
    const mapped = new Set(entry.evidence_map_ids.flatMap((id) => maps.get(id).agent_visible_paths.map((path) => path.replace(/^workspace\//u, ""))));
    assert.deepEqual([...mapped].sort(), [...oracle.basis_paths[entry.requirement_id]].sort(), `${entry.requirement_id} public/private direct-source closure`);
  }
}

async function validatePrivateCases({ privateRoot, caseRoot, productionExists }) {
  const work = mkdtempSync(resolve(tmpdir(), "mn-focused-regression-private-"));
  const cases = readJson(resolve(caseRoot, "cases.json"));
  assert.equal(cases.fixture_id, FIXTURE_ID);
  assert.equal(cases.cases.length, 36, "private regression inventory must remain closed");
  assert.equal(new Set(cases.cases.map(({ case_id }) => case_id)).size, cases.cases.length);
  let production = null;
  let externalAuthorityAnchor = null;
  let hiddenAsset = null;
  let privateEvaluationRoot = null;
  let evaluationInputRoot = null;
  if (productionExists) {
    const boundaryRoots = createBoundaryRoots(resolve(work, "boundaries"));
    production = validateMnFocusedRegressionTestProductionAuthority({ root: ROOT, privateRoot, boundaryRoots });
    const bundle = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
    hiddenAsset = bundle.asset_inventory.find(({ role }) => role === "hidden_tests");
    assert.ok(hiddenAsset);
    const freezePath = resolve(FIXTURE_ROOT, "scoring-input-freeze-manifest.json");
    externalAuthorityAnchor = readEvaluatorAuthorityAnchorFromFreeze({
      root: ROOT,
      freezeManifestPath: freezePath,
      freezeManifestSourceDigest: digestBytes(readFileSync(freezePath)),
      referencePath: resolve(FIXTURE_ROOT, "evaluator-reference.json"),
      label: "mn-focused-regression private regression authority",
    });
    privateEvaluationRoot = resolve(work, "sealed-authority");
    evaluationInputRoot = resolve(work, "sealed-input");
    mkdirSync(privateEvaluationRoot);
    mkdirSync(evaluationInputRoot);
    writeFileSync(resolve(evaluationInputRoot, "private-regression-authority.json"), "{\"measured_execution\":false,\"scoring_ready\":false}\n");
  }
  const evaluator = await import(`${pathToFileURL(resolve(privateRoot, "hidden-evaluator.mjs")).href}?digest=${digestBytes(readFileSync(resolve(privateRoot, "hidden-evaluator.mjs")))}`);
  for (const [index, entry] of cases.cases.entries()) {
    const frozen = resolve(work, `${entry.case_id}-frozen`);
    const candidate = resolve(work, `${entry.case_id}-candidate`);
    cpSync(WORKSPACE_ROOT, frozen, { recursive: true });
    cpSync(frozen, candidate, { recursive: true });
    applyCase(candidate, entry);
    const normalized = normalizedResult(entry, index);
    let diffArtifact = repositoryDiffArtifact(frozen, candidate);
    let sealedExecution = null;
    if (productionExists) {
      sealedExecution = createSealedEvaluatorExecutionForTest({
        root: ROOT,
        privateEvaluationRoot,
        privateRoot,
        hiddenAsset,
        frozenWorkspace: frozen,
        candidateWorkspace: candidate,
        evaluationInputRoot,
        evaluationLineage: normalized.lineage,
        evaluatorRevision: production.evaluatorRevision,
        externalAuthorityAnchor,
        executionDirectoryName: `sealed-${entry.case_id}`,
        label: `mn-focused-regression sealed ${entry.case_id} evaluator`,
      });
      diffArtifact = readJson(resolve(sealedExecution.originalWorkspaceAuthority.path, sealedExecution.originalWorkspaceAuthority.repositoryDiffPath));
      if (entry.mode_changes) {
        for (const path of Object.keys(entry.mode_changes)) {
          const modeEntry = diffArtifact.diff_entries.find((candidateEntry) => candidateEntry.path === path);
          assert.ok(modeEntry && modeEntry.before?.mode !== modeEntry.after?.mode, `${entry.case_id} sealed authority must retain mode change: ${path}`);
        }
      }
    }
    const first = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult: normalized, repositoryDiffArtifact: diffArtifact });
    const second = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult: normalized, repositoryDiffArtifact: diffArtifact });
    assert.deepEqual(first, second, `${entry.case_id} evaluator determinism`);
    assertBenchmarkSchemaInstance(first, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} private fragment` });
    assert.deepEqual(evaluatorProjection(first), expectedProjection(entry, normalized, diffArtifact), `${entry.case_id} complete private evaluator projection`);
    if (index === 0) {
      const invalidDiff = clone(diffArtifact);
      invalidDiff.artifact_digest = `sha256:${"0".repeat(64)}`;
      await assert.rejects(evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult: normalized, repositoryDiffArtifact: invalidDiff }), /repository diff byte authority/u, "repository diff transplant must fail closed");
    }
    if (sealedExecution) {
      const sealed = executeSealedEvaluatorForTest({ execution: sealedExecution, externalAuthorityAnchor, repositoryRoot: ROOT, normalized, label: `mn-focused-regression sealed ${entry.case_id} evaluator` });
      assert.deepEqual(evaluatorProjection(sealed.firstFragment), expectedProjection(entry, normalized, diffArtifact), `${entry.case_id} production-safe private evaluator projection`);
      assert.deepEqual(sealed.firstFragment, first, `${entry.case_id} direct/production-safe evaluator agreement`);
    }
  }
  assert.ok(cases.cases.some(({ case_id }) => case_id === "focused-test-replaced-by-directory"), "directory type replacement must remain in the private case inventory");
  const symlinkControls = [
    { caseId: "focused-test-replaced-by-symlink", path: "test/session-key.test.mjs", target: "../src/session-key.mjs" },
    { caseId: "protected-source-replaced-by-symlink", path: "src/session-key.mjs", target: "../spec/session-key.md" },
  ];
  for (const [controlIndex, control] of symlinkControls.entries()) {
    const frozen = resolve(work, `${control.caseId}-frozen`);
    const candidate = resolve(work, `${control.caseId}-candidate`);
    cpSync(WORKSPACE_ROOT, frozen, { recursive: true });
    cpSync(frozen, candidate, { recursive: true });
    const target = resolve(candidate, control.path);
    rmSync(target);
    symlinkSync(control.target, target);
    const entry = { case_id: control.caseId };
    const normalized = normalizedResult(entry, cases.cases.length + controlIndex);
    const diffArtifact = repositoryDiffArtifact(frozen, candidate);
    const changed = diffArtifact.diff_entries.find(({ path }) => path === control.path);
    assert.equal(changed?.before?.file_type, "file", `${control.caseId} frozen path must remain a regular file`);
    assert.equal(changed?.after?.file_type, "symlink", `${control.caseId} repository diff must retain the symlink type`);
    const first = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult: normalized, repositoryDiffArtifact: diffArtifact });
    const second = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult: normalized, repositoryDiffArtifact: diffArtifact });
    assert.deepEqual(first, second, `${control.caseId} evaluator determinism`);
    assert.equal(first.classification, "over_processing", `${control.caseId} must be classified as over-processing`);
    assert.equal(first.over_processing.state, "detected", `${control.caseId} must be observable as a scope deviation`);
    assert.ok(first.scope_deviations.some(({ finding_id }) => finding_id === "unauthorized-candidate-change"), `${control.caseId} must identify the unauthorized type change`);
    assertBenchmarkSchemaInstance(first, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${control.caseId} private fragment` });
    if (productionExists) {
      assert.throws(() => createSealedEvaluatorExecutionForTest({
        root: ROOT,
        privateEvaluationRoot,
        privateRoot,
        hiddenAsset,
        frozenWorkspace: frozen,
        candidateWorkspace: candidate,
        evaluationInputRoot,
        evaluationLineage: normalized.lineage,
        evaluatorRevision: production.evaluatorRevision,
        externalAuthorityAnchor,
        executionDirectoryName: `sealed-${control.caseId}`,
        label: `mn-focused-regression sealed ${control.caseId} evaluator`,
      }), /prohibited filesystem entry|symlink/u, `${control.caseId} must fail closed at the sealed workspace boundary`);
    }
  }
  const deterministicAuthority = buildMnFocusedRegressionTestAuthority();
  let mutationAsset = deterministicAuthority.mutationAsset;
  let equivalenceAsset = deterministicAuthority.equivalenceAsset;
  const equivalenceCount = cases.cases.filter(({ control }) => control === "equivalent_solution").length;
  if (productionExists) {
    const requirement = readJson(resolve(FIXTURE_ROOT, "requirement-record.json"));
    const admission = readJson(resolve(FIXTURE_ROOT, "final-admission-record.json"));
    const evidenceMap = readJson(resolve(FIXTURE_ROOT, "evidence-map.json"));
    const oracle = readJson(resolve(privateRoot, "oracle.json"));
    validatePrivateEvidenceMapClosure(requirement, evidenceMap, oracle);
    const inputRecord = readJson(resolve(FIXTURE_ROOT, "input-manifest.json")).fixtures[FIXTURE_ID];
    mutationAsset = readJson(resolve(privateRoot, "evidence-removal-mutations.json"));
    equivalenceAsset = readJson(resolve(privateRoot, "equivalent-solutions.json"));
    assert.doesNotThrow(() => validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset }));
    assert.doesNotThrow(() => validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset }));
    assert.doesNotThrow(() => validateMatchedEquivalenceIds({ requirementRecord: requirement, equivalenceAsset, matchedEquivalenceClassIds: equivalenceAsset.rules.map(({ equivalence_class_id }) => equivalence_class_id) }));
    const missingMutation = clone(mutationAsset);
    missingMutation.mutations.pop();
    expectFailure(() => validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset: missingMutation }), /inventory/u, "missing evidence-removal mutation");
    const transplanted = clone(equivalenceAsset);
    transplanted.fixture_id = "foreign-fixture";
    expectFailure(() => {
      if (transplanted.fixture_id !== requirement.fixture_id) throw new Error("private equivalence fixture transplant");
      validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset: transplanted });
    }, /transplant/u, "cross-fixture equivalence transplant");
  } else {
    const oracle = readJson(resolve(privateRoot, "oracle.json"));
    const syntheticRequirement = {
      requirements: REQUIREMENT_IDS.map((requirement_id, index) => ({ requirement_id, evidence_map_ids: [deterministicAuthority.evidenceMap.maps[index].evidence_map_id] })),
    };
    validatePrivateEvidenceMapClosure(syntheticRequirement, deterministicAuthority.evidenceMap, oracle);
    assert.equal(equivalenceAsset.rules.length, 4);
  }
  const referenceSource = cases.cases[0].test_source;
  for (const mutation of mutationAsset.mutations) {
    const frozen = resolve(work, `${mutation.mutation_id}-frozen`);
    const candidate = resolve(work, `${mutation.mutation_id}-candidate`);
    cpSync(WORKSPACE_ROOT, frozen, { recursive: true });
    for (const path of mutation.remove_paths) {
      const normalizedPath = path.replace(/^workspace\//u, "");
      const absolute = resolve(frozen, normalizedPath);
      assert.ok(existsSync(absolute), `${mutation.mutation_id} removal source must exist: ${path}`);
      rmSync(absolute, { recursive: true, force: true });
    }
    cpSync(frozen, candidate, { recursive: true });
    mkdirSync(resolve(candidate, "test"), { recursive: true });
    writeFileSync(resolve(candidate, "test/session-key.test.mjs"), referenceSource);
    const result = await evaluator.evaluateCandidate({ frozenWorkspace: frozen, candidateWorkspace: candidate, verificationState: "executed_success" });
    const target = result.requirement_results.find(({ requirement_id }) => requirement_id === mutation.requirement_id);
    assert.equal(target?.outcome, "fail", `${mutation.mutation_id} must make ${mutation.requirement_id} unrecoverable`);
    assert.notEqual(result.classification, "correct_narrow_execution", `${mutation.mutation_id} must not preserve reference classification`);
  }
  return {
    cases: cases.cases.length,
    directPass: cases.cases.length,
    productionSafePass: productionExists ? cases.cases.length : 0,
    mutationBehaviorPass: mutationAsset.mutations.length,
    equivalentSolutionControls: equivalenceCount,
    typeBoundaryControls: 3,
    sealedSymlinkRejections: productionExists ? symlinkControls.length : 0,
  };
}

function validateReviewArchive({ privateRoot, caseRoot }) {
  const work = mkdtempSync(resolve(tmpdir(), "mn-focused-regression-review-archive-"));
  const reviewedHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const firstPath = resolve(work, "first.zip");
  const secondPath = resolve(work, "second.zip");
  const first = generateMnFocusedRegressionTestReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: firstPath, reviewedHead });
  const second = generateMnFocusedRegressionTestReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: secondPath, reviewedHead });
  assert.deepEqual({ ...first, archivePath: null }, { ...second, archivePath: null }, "review archive identity must be deterministic");
  assert.deepEqual(readFileSync(firstPath), readFileSync(secondPath), "review archive bytes must be deterministic");
  const integrity = spawnSync("unzip", ["-tqq", firstPath], { encoding: "utf8" });
  assert.equal(integrity.status, 0, integrity.stderr || integrity.stdout);
  const names = spawnSync("unzip", ["-Z1", firstPath], { encoding: "utf8" }).stdout.trim().split("\n");
  const manifest = JSON.parse(spawnSync("unzip", ["-p", firstPath, "REVIEW-MANIFEST.json"], { encoding: "utf8" }).stdout);
  assert.equal(manifest.reviewed_repository_head, reviewedHead);
  assert.equal(manifest.evaluator_bundle_id, readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).evaluator_bundle_id);
  assert.equal(manifest.evaluator_bundle_digest, readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).evaluator_bundle_digest);
  assert.equal(manifest.independent_review_status, "pending");
  assert.equal(manifest.author_self_approval, false);
  assert.equal(manifest.admission_status, "admission_pending");
  assert.equal(manifest.scoring_ready, false);
  assert.equal(manifest.measured_execution, false);
  assert.equal(manifest.archive_format.generator_source_digest, digestBytes(readFileSync(resolve(ROOT, "scripts/ask-benchmark-mn-focused-regression-test-review-archive.mjs"))));
  const expectedNames = [...manifest.entries.map(({ path }) => path), "REVIEW-MANIFEST.json"].sort((left, right) => left.localeCompare(right));
  assert.deepEqual(names, expectedNames, "review archive ZIP inventory must close against its manifest");
  assert.equal(first.entryCount, expectedNames.length);
  for (const path of [
    `repository/${FIXTURE_ROOT_RELATIVE}/task.md`,
    "repository/scripts/ask-benchmark-mn-focused-regression-test-review-archive.mjs",
    "private-evaluator/hidden-evaluator.mjs",
    "private-cases/cases.json",
  ]) assert.ok(names.includes(path), `review archive must include ${path}`);

  expectFailure(() => generateMnFocusedRegressionTestReviewArchive({ root: ROOT, privateRoot, caseRoot, outputPath: resolve(work, "wrong-head.zip"), reviewedHead: "0".repeat(40) }), /reviewed HEAD/u, "review archive wrong HEAD");
  const trackedDrift = validationCopy("review-archive-tracked-drift");
  writeFileSync(resolve(trackedDrift, FIXTURE_ROOT_RELATIVE, "task.md"), `${readFileSync(resolve(trackedDrift, FIXTURE_ROOT_RELATIVE, "task.md"), "utf8")}\nDrift.\n`);
  expectFailure(() => generateMnFocusedRegressionTestReviewArchive({ root: trackedDrift, privateRoot, caseRoot, outputPath: resolve(work, "tracked-drift.zip"), reviewedHead }), /tracked bytes differ/u, "review archive tracked-byte drift");
  const driftedPrivate = resolve(work, "drifted-private");
  cpSync(privateRoot, driftedPrivate, { recursive: true });
  const driftedBundlePath = resolve(driftedPrivate, "private-evaluator-bundle.json");
  const driftedBundle = readJson(driftedBundlePath);
  driftedBundle.evaluator_bundle_id = `evaluator-${"0".repeat(64)}`;
  writeFileSync(driftedBundlePath, `${JSON.stringify(driftedBundle, null, 2)}\n`);
  expectFailure(() => generateMnFocusedRegressionTestReviewArchive({ root: ROOT, privateRoot: driftedPrivate, caseRoot, outputPath: resolve(work, "drifted-private.zip"), reviewedHead }), /private bundle differs/u, "review archive private/public transplant");
  const driftedAsset = resolve(work, "drifted-asset");
  cpSync(privateRoot, driftedAsset, { recursive: true });
  writeFileSync(resolve(driftedAsset, "hidden-evaluator.mjs"), `${readFileSync(resolve(driftedAsset, "hidden-evaluator.mjs"), "utf8")}\n// drift\n`);
  expectFailure(() => generateMnFocusedRegressionTestReviewArchive({ root: ROOT, privateRoot: driftedAsset, caseRoot, outputPath: resolve(work, "drifted-asset.zip"), reviewedHead }), /private asset bytes/u, "review archive private asset drift");
  const transplantedCases = resolve(work, "transplanted-cases");
  cpSync(caseRoot, transplantedCases, { recursive: true });
  const transplantedCasesPath = resolve(transplantedCases, "cases.json");
  const transplantedCaseAuthority = readJson(transplantedCasesPath);
  transplantedCaseAuthority.fixture_id = "foreign-fixture";
  writeFileSync(transplantedCasesPath, `${JSON.stringify(transplantedCaseAuthority, null, 2)}\n`);
  expectFailure(() => generateMnFocusedRegressionTestReviewArchive({ root: ROOT, privateRoot, caseRoot: transplantedCases, outputPath: resolve(work, "transplanted-cases.zip"), reviewedHead }), /case identity/u, "review archive private case transplant");
  const symlinkedPrivate = resolve(work, "symlinked-private");
  cpSync(privateRoot, symlinkedPrivate, { recursive: true });
  symlinkSync("oracle.json", resolve(symlinkedPrivate, "oracle-link.json"));
  expectFailure(() => generateMnFocusedRegressionTestReviewArchive({ root: ROOT, privateRoot: symlinkedPrivate, caseRoot, outputPath: resolve(work, "symlinked-private.zip"), reviewedHead }), /symlink/u, "review archive private symlink");
  return { rawSha256: first.archiveSha256, rawBytes: first.archiveBytes, entryCount: first.entryCount };
}

validateFrozenDesign();
validateMnFocusedRegressionTestInputClosure({ root: ROOT });
validateVisibleScenario();
validatePublicNegativeCoverage();

const productionExists = readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).schema_version === "1.0.0";
let effectiveAdmissionStatus = "admission_pending";
if (productionExists) {
  const production = validateMnFocusedRegressionTestProductionAuthority({ root: ROOT });
  assert.equal(production.scoringReady, false);
  validateProductionNegativeCoverage();
  const config = readJson(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"));
  config._configPath = resolve(ROOT, "benchmarks/adaptive-portfolio.config.json");
  config._protocolPath = resolve(ROOT, config.protocol_path);
  const fixture = config.fixtures.find(({ id }) => id === FIXTURE_ID);
  const admission = resolvePortfolioExecutionAdmission({ root: ROOT, fixture });
  assert.equal(admission.execution_eligible, false);
  assert.equal(resolvePortfolioExecutionFixtures({ root: ROOT, config }).some(({ id }) => id === FIXTURE_ID), false);
  const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const decision = resolveRepositoryAdmissionDecision({ root: ROOT, repositoryRevision: revision, fixtureId: FIXTURE_ID });
  if (decision) {
    assert.equal(decision.decision.decision_status, "admitted");
    effectiveAdmissionStatus = admission.effective_admission_status;
  }
}

const requested = privateArgs(process.argv.slice(2));
const privateSummary = requested ? await validatePrivateCases({ ...requested, productionExists }) : null;
const reviewArchiveSummary = requested ? validateReviewArchive(requested) : null;
console.log(JSON.stringify({ fixture_id: FIXTURE_ID, input_closure: "pass", frozen_design: "pass", visible_scenario: "pass", negative_regressions: "pass", production_validation: productionExists ? "pass" : "generation_pending", actual_private_validation: requested ? "pass" : "not_supplied", ...(privateSummary ? { private_summary: privateSummary } : {}), ...(reviewArchiveSummary ? { review_archive_validation: reviewArchiveSummary } : {}), admission: effectiveAdmissionStatus, scoring_ready: false }));
