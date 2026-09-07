import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import {
  createSealedEvaluatorExecutionForTest,
  executeSealedEvaluatorForTest,
  readEvaluatorAuthorityAnchorFromFreeze,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { resolvePortfolioExecutionAdmission, resolvePortfolioExecutionFixtures } from "./ask-benchmark-plan.mjs";
import { validateEquivalenceAuthority, validateMatchedEquivalenceIds, validateMutationAuthority } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMpCiEvidenceGapInputClosure } from "./ask-benchmark-mp-ci-evidence-gap.mjs";
import { buildMpCiEvidenceAuthority, validateMpCiEvidenceGapProductionAuthority } from "./ask-benchmark-mp-ci-evidence-gap-authority.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = resolve(ROOT, "benchmarks/fixtures/checkpoint-b2/mp-ci-evidence-gap");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function removeTemporaryTree(root) {
  if (!existsSync(root)) return;
  const makeDirectoriesWritable = (path) => {
    const status = lstatSync(path);
    if (!status.isDirectory() || status.isSymbolicLink()) return;
    chmodSync(path, 0o700);
    for (const entry of readdirSync(path)) makeDirectoriesWritable(resolve(path, entry));
  };
  makeDirectoriesWritable(root);
  rmSync(root, { recursive: true, force: true });
}

function evaluatorSemanticProjection(result) {
  return {
    requirement_results: result.requirement_results.map(({ requirement_id, outcome, earned_points, matched_equivalence_class_ids, finding_ids, scope_deviation_references, verification_evidence_state }) => ({
      requirement_id,
      outcome,
      earned_points,
      matched_equivalence_class_ids,
      finding_ids,
      scope_deviation_references,
      ...(verification_evidence_state ? { verification_evidence_state } : {}),
    })),
    findings: result.findings.map(({ finding_id, category, severity }) => ({ finding_id, category, severity })),
    scope_deviations: result.scope_deviations.map(({ finding_id, category, severity }) => ({ finding_id, category, severity })),
    verification_correctness: result.verification_correctness.state,
    evidence_correctness: result.evidence_correctness.state,
    under_processing: result.under_processing.state,
    over_processing: result.over_processing.state,
    classification: result.classification,
    result_profile: result.result_profile,
    scoring_ready: result.scoring_ready,
  };
}

function expectFailure(operation, pattern, label) {
  assert.throws(operation, pattern, label);
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
    mkdirSync(root);
    writeFileSync(resolve(root, marker), "{}\n");
    return [field, root];
  }));
}

function validateFrozenDesign() {
  const record = readJson(resolve(ROOT, "benchmarks/portfolio-design-admission-records/mp-ci-evidence-gap.json"));
  assert.deepEqual(record.catalog_metadata, {
    suite: "mechanism_positive",
    task_class: "review_verification",
    domain: "ci_build",
    difficulty: "medium_hard",
    repetitions: 3,
    capability_families: ["evidence_synthesis", "verification_discipline"],
    evidence_topologies: ["ci_logs_and_config", "implementation_and_tests"],
    outcome_dimensions: ["evidence_completeness", "review_precision"],
    risk_boundary: "none",
  });
  assert.equal(record.answer_neutral_design.output_contract_type, "findings_producing");
  assert.equal(record.answer_neutral_design.evidence_removal_mutation_topology, "ci_logs_and_config");
  assert.equal(record.answer_neutral_design.suspicious_but_correct_control_required, true);
}

function validateVisibleScenario() {
  const workspace = resolve(FIXTURE_ROOT, "workspace");
  const unit = spawnSync(process.execPath, ["--test", "test/unit/quote-order.test.mjs"], { cwd: workspace, encoding: "utf8" });
  assert.equal(unit.status, 0, unit.stderr || unit.stdout);
  const checkout = spawnSync(process.execPath, ["--test", "test/checkout/quote-order-contract.test.mjs"], { cwd: workspace, encoding: "utf8" });
  assert.notEqual(checkout.status, 0, "checkout contract must expose the agent-visible proposed defect");
  assert.match(`${checkout.stdout}${checkout.stderr}`, /Missing expected exception|RangeError/u);
}

function validateSharedNegativeCoverage() {
  const boundary = readFileSync(resolve(ROOT, "scripts/test-ask-benchmark-evaluator-boundary.mjs"), "utf8");
  const fixtureOne = readFileSync(resolve(ROOT, "scripts/test-ask-benchmark-mn-build-option-update.mjs"), "utf8");
  const fixtureTwo = readFileSync(resolve(ROOT, "scripts/test-ask-benchmark-mn-doc-config-correction.mjs"), "utf8");
  const shared = `${boundary}\n${fixtureOne}\n${fixtureTwo}`;
  for (const pattern of [/public artifact root/u, /byte-identical private evaluator material/u, /symlink/u, /path escape/u, /cross-fixture transplant/u]) assert.match(shared, pattern);
  for (const pattern of [/caller-created admitted object injection/u, /admission_pending/u, /public reference bundle transplant/u, /private material in the public artifact root/u]) assert.match(shared, pattern);
}

function interpolate(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), template);
}

function conceptMatrixEntries(matrix) {
  const quantity = matrix.generation.quantity;
  const ci = matrix.generation.ci;
  const quantityCoverage = { subjects: new Set(), boundaries: new Set(), flows: new Set(), remediations: new Set() };
  const ciCoverage = { contexts: new Set(), boundaries: new Set(), omissions: new Set(), remediations: new Set() };
  const quantityEntries = Array.from({ length: quantity.combination_count }, (_, index) => {
    const round = Math.floor(index / quantity.boundaries.length);
    const subjectIndex = index % quantity.subjects.length;
    const boundaryIndex = index % quantity.boundaries.length;
    const flowIndex = (index * 3 + round) % quantity.flows.length;
    const remediationIndex = (index * 7 + round) % quantity.remediations.length;
    const subject = quantity.subjects[subjectIndex];
    const boundary = quantity.boundaries[boundaryIndex];
    quantityCoverage.subjects.add(subjectIndex);
    quantityCoverage.boundaries.add(boundaryIndex);
    quantityCoverage.flows.add(flowIndex);
    quantityCoverage.remediations.add(remediationIndex);
    return {
      variant_id: `generated-quantity-${String(index + 1).padStart(2, "0")}`,
      family: "quantity_positive",
      finding_index: 1,
      finding: {
        title: `${subject} bypass the positive-domain contract`,
        severity: "high",
        evidence: [{ path: "src/quote-order.mjs", line: 2 }, { path: "test/checkout/quote-order-contract.test.mjs", line: 5 }],
        impact: `${interpolate(quantity.flows[flowIndex], boundary)} even though the checkout contract requires ${subject} to be ${boundary.required}.`,
        required_action: interpolate(quantity.remediations[remediationIndex], { subject, required: boundary.required }),
      },
      expected_points: [3, 3, 2, 1, 1],
      expected_classification: "correct_narrow_execution",
    };
  });
  const ciEntries = Array.from({ length: ci.combination_count }, (_, index) => {
    const round = Math.floor(index / ci.boundaries.length);
    const contextIndex = index % ci.contexts.length;
    const boundaryIndex = index % ci.boundaries.length;
    const omissionIndex = (index * 3 + round) % ci.omissions.length;
    const remediationIndex = (index * 5 + round) % ci.remediations.length;
    const context = ci.contexts[contextIndex];
    const boundary = ci.boundaries[boundaryIndex];
    ciCoverage.contexts.add(contextIndex);
    ciCoverage.boundaries.add(boundaryIndex);
    ciCoverage.omissions.add(omissionIndex);
    ciCoverage.remediations.add(remediationIndex);
    return {
      variant_id: `generated-ci-${String(index + 1).padStart(2, "0")}`,
      family: "ci_positive",
      finding_index: 0,
      finding: {
        title: `${context} has an incomplete required-validation record`,
        severity: "high",
        evidence: [{ path: ".github/workflows/pull-request.yml", line: 17 }, { path: "ci/pull-request-314.log", line: 7 }, { path: "docs/verification.md", line: 5 }],
        impact: `${context} ${interpolate(ci.omissions[omissionIndex], { boundary })}, so the evidence required for merge is incomplete.`,
        required_action: interpolate(ci.remediations[remediationIndex], { boundary }),
      },
      expected_points: [3, 3, 2, 1, 1],
      expected_classification: "correct_narrow_execution",
    };
  });
  const morphology = matrix.morphology_components;
  const quantityMorphologyEntries = [];
  for (const subject of morphology.quantity.subjects) {
    for (const boundary of morphology.quantity.boundaries) {
      for (const flow of morphology.quantity.flows) {
        for (const remediation of morphology.quantity.remediations) {
          quantityMorphologyEntries.push({
            variant_id: `morphology-quantity-${String(quantityMorphologyEntries.length + 1).padStart(2, "0")}`,
            family: "quantity_positive",
            finding_index: 1,
            finding: {
              title: `${subject} ${boundary.title_predicate}`,
              severity: "high",
              evidence: [{ path: "src/quote-order.mjs", line: 2 }, { path: "test/checkout/quote-order-contract.test.mjs", line: 5 }],
              impact: `${boundary.invalid_values} ${flow}, despite the positive checkout contract.`,
              required_action: remediation,
            },
            expected_points: [3, 3, 2, 1, 1],
            expected_classification: "correct_narrow_execution",
          });
        }
      }
    }
  }
  const ciMorphologyEntries = [];
  for (const context of morphology.ci.contexts) {
    for (const boundary of morphology.ci.boundaries) {
      for (const omission of morphology.ci.omissions) {
        for (const gating of morphology.ci.gating) {
          ciMorphologyEntries.push({
            variant_id: `morphology-ci-${String(ciMorphologyEntries.length + 1).padStart(2, "0")}`,
            family: "ci_positive",
            finding_index: 0,
            finding: {
              title: `${context} reports success`,
              severity: "high",
              evidence: [{ path: ".github/workflows/pull-request.yml", line: 17 }, { path: "ci/pull-request-314.log", line: 7 }, { path: "docs/verification.md", line: 5 }],
              impact: `${context} ${interpolate(omission, { boundary })}, leaving the evidence required for merge incomplete.`,
              required_action: interpolate(gating, { boundary }),
            },
            expected_points: [3, 3, 2, 1, 1],
            expected_classification: "correct_narrow_execution",
          });
        }
      }
    }
  }
  assert.equal(quantityMorphologyEntries.length, morphology.quantity.subjects.length * morphology.quantity.boundaries.length * morphology.quantity.flows.length * morphology.quantity.remediations.length, "quantity morphology Cartesian coverage");
  assert.equal(ciMorphologyEntries.length, morphology.ci.contexts.length * morphology.ci.boundaries.length * morphology.ci.omissions.length * morphology.ci.gating.length, "CI morphology Cartesian coverage");
  assert.deepEqual(morphology.quantity.boundaries.map(({ form }) => form), ["exceed", "exceeds"]);
  assert.deepEqual(morphology.ci.contexts, ["repository check", "repository checks"]);
  assert.deepEqual(morphology.ci.boundaries, ["checkout test", "checkout tests", "complete check", "complete checks"]);
  assert.deepEqual(morphology.ci.omissions, ["executed only unit tests while {boundary} remained outside the merge evidence", "executes only unit tests while {boundary} remains outside the approval evidence"]);
  assert.deepEqual(morphology.ci.gating, ["The {boundary} is required for approval.", "Execute {boundary} before merging."]);
  for (const [label, coverage, source] of [
    ["quantity", quantityCoverage, quantity],
    ["CI", ciCoverage, ci],
  ]) {
    for (const [dimension, seen] of Object.entries(coverage)) assert.equal(seen.size, source[dimension].length, `${label} ${dimension} lexicon coverage`);
  }
  const probes = matrix.independent_probes.map((entry) => ({ ...entry, expected_points: [3, 3, 2, 1, 1], expected_classification: "correct_narrow_execution" }));
  const polarityPairs = matrix.polarity_pairs;
  const polarityByPair = Map.groupBy(polarityPairs, ({ pair_id }) => pair_id);
  assert.equal(polarityPairs.length, 14, "signed-predicate polarity case count");
  assert.equal(polarityByPair.size, 7, "signed-predicate polarity pair count");
  for (const [pairId, entries] of polarityByPair) {
    assert.deepEqual(entries.map(({ polarity_expectation }) => polarity_expectation).sort(), ["defect", "no_defect"], `${pairId} polarity pair closure`);
  }
  const representativeProbes = matrix.representative_positive_probes.map((entry) => ({ ...entry, expected_points: [3, 3, 2, 1, 1], expected_classification: "correct_narrow_execution" }));
  assert.equal(representativeProbes.length, 6, "representative case-out positive count");
  return {
    entries: [...quantityEntries, ...ciEntries, ...quantityMorphologyEntries, ...ciMorphologyEntries, ...probes, ...polarityPairs, ...representativeProbes, ...matrix.negative_controls],
    generated: { quantity: quantityEntries.length, ci: ciEntries.length },
    morphology: { quantity: quantityMorphologyEntries.length, ci: ciMorphologyEntries.length },
    probes: { quantity: probes.filter(({ family }) => family === "quantity_positive").length, ci: probes.filter(({ family }) => family === "ci_positive").length },
    polarity: { pairs: polarityByPair.size, positive: polarityPairs.filter(({ polarity_expectation }) => polarity_expectation === "defect").length, negative: polarityPairs.filter(({ polarity_expectation }) => polarity_expectation === "no_defect").length },
    representative: { quantity: representativeProbes.filter(({ family }) => family === "quantity_positive").length, ci: representativeProbes.filter(({ family }) => family === "ci_positive").length },
    negatives: matrix.negative_controls.length,
  };
}

async function validatePrivateCases({ privateRoot, caseRoot }, { directOnly = false } = {}) {
  const work = mkdtempSync(resolve(tmpdir(), "mp-ci-private-test-"));
  try {
    const boundaryRoots = directOnly ? null : createBoundaryRoots(work);
    const production = directOnly ? null : validateMpCiEvidenceGapProductionAuthority({ root: ROOT, privateRoot, boundaryRoots });
    if (production) {
      assert.equal(production.scoringReady, false);
      assert.equal(production.admissionState, "admission_pending");
    }
    const evaluator = await import(`${pathToFileURL(resolve(privateRoot, "hidden-evaluator.mjs")).href}?digest=${production?.evaluatorBundleDigest ?? canonicalDigest({ privateRoot, mode: "semantic-regression-direct-only" })}`);
    const cases = readJson(resolve(caseRoot, "cases.json"));
    const bundle = directOnly ? null : readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
    const hiddenAsset = bundle?.asset_inventory.find(({ role }) => role === "hidden_tests") ?? null;
    if (!directOnly) assert.ok(hiddenAsset, "private bundle requires a hidden evaluator asset");
    const freezePath = directOnly ? null : resolve(FIXTURE_ROOT, "scoring-input-freeze-manifest.json");
    const externalAuthorityAnchor = directOnly ? null : readEvaluatorAuthorityAnchorFromFreeze({
      root: ROOT,
      freezeManifestPath: freezePath,
      freezeManifestSourceDigest: `sha256:${createHash("sha256").update(readFileSync(freezePath)).digest("hex")}`,
      referencePath: resolve(FIXTURE_ROOT, "evaluator-reference.json"),
      label: "mp-ci private regression authority",
    });
    const privateEvaluationRoot = directOnly ? null : resolve(work, "sealed-authority");
    const evaluationInputRoot = directOnly ? null : resolve(work, "sealed-input");
    if (!directOnly) {
      mkdirSync(privateEvaluationRoot);
      mkdirSync(evaluationInputRoot);
      writeFileSync(resolve(evaluationInputRoot, "private-regression-authority.json"), "{\"measured_execution\":false,\"scoring_ready\":false}\n");
    }
    for (const entry of cases.cases) {
      const frozen = resolve(work, `${entry.case_id}-frozen`);
      const candidate = resolve(work, `${entry.case_id}-candidate`);
      cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
      cpSync(frozen, candidate, { recursive: true });
      cpSync(resolve(caseRoot, entry.case_id, "review.json"), resolve(candidate, "review.json"));
      if (entry.mutate_source) writeFileSync(resolve(candidate, "src/quote-order.mjs"), `${readFileSync(resolve(candidate, "src/quote-order.mjs"), "utf8")}\n// unrelated candidate edit\n`);
      const first = await evaluator.evaluateCandidate({ frozenWorkspace: frozen, candidateWorkspace: candidate, verificationState: "executed_success" });
      const second = await evaluator.evaluateCandidate({ frozenWorkspace: frozen, candidateWorkspace: candidate, verificationState: "executed_success" });
      assert.deepEqual(first, second, `${entry.case_id} evaluator determinism`);
      const normalizedResult = {
        normalized_result_digest: canonicalDigest({ fixture_id: "mp-ci-evidence-gap", case_id: entry.case_id, authority: "private-test" }),
        command_evidence: {
          capture_support: "supported",
          evidence_level: "verified",
          references: [{ command_id: "review-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ case_id: entry.case_id, command_id: "review-contract-validation" }), bytes: 1 }],
        },
      };
      const repositoryDiffArtifact = { artifact_digest: canonicalDigest({ case_id: entry.case_id, kind: "repository-diff" }), artifact_bytes: 1 };
      assertBenchmarkSchemaInstance(first, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} private fragment` });
      if (!directOnly) {
        const safeFirst = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
        const safeSecond = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
        assert.deepEqual(safeFirst, safeSecond, `${entry.case_id} production-safe evaluator determinism`);
        assertBenchmarkSchemaInstance(safeFirst, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} production-safe private fragment` });
        assert.deepEqual(evaluatorSemanticProjection(safeFirst), evaluatorSemanticProjection(first), `${entry.case_id} direct/production-safe semantic projection`);
      }
      assert.deepEqual(first.requirement_results.map(({ earned_points }) => earned_points), entry.expected_points, `${entry.case_id} requirement points`);
      assert.equal(first.classification, entry.expected_classification, `${entry.case_id} classification`);
      if (entry.expected_finding_ids) assert.deepEqual(first.findings.map(({ finding_id }) => finding_id), entry.expected_finding_ids, `${entry.case_id} evaluator finding IDs`);
      assert.equal(first.scoring_ready, false);
    }

    const matrix = readJson(resolve(caseRoot, "concept-family-matrix.json"));
    assert.equal(matrix.fixture_id, "mp-ci-evidence-gap");
    assert.equal(matrix.schema_version, "1.0.0");
    const baseReview = readJson(resolve(caseRoot, matrix.base_review));
    let regressionProbeIndex = 0;
    const evaluateReviewProbe = async ({ probeId, review }) => {
      const index = regressionProbeIndex;
      regressionProbeIndex += 1;
      const frozen = resolve(work, `${probeId}-frozen`);
      const candidate = resolve(work, `${probeId}-candidate`);
      cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
      cpSync(frozen, candidate, { recursive: true });
      const reviewBytes = Buffer.from(`${JSON.stringify(review, null, 2)}\n`);
      writeFileSync(resolve(candidate, "review.json"), reviewBytes);
      const lineage = {
        run_instance_id: `31431431-4314-4314-8314-${String(index + 1).padStart(12, "0")}`,
        case_id: `case-3143143143143143-${String(index + 101).padStart(16, "0")}`,
        attempt: "0001",
        final_output_digest: `sha256:${createHash("sha256").update(reviewBytes).digest("hex")}`,
        final_output_bytes: reviewBytes.length,
      };
      const normalizedResult = {
        normalized_result_digest: canonicalDigest({ fixture_id: "mp-ci-evidence-gap", probe_id: probeId, authority: "review-regression" }),
        lineage,
        command_evidence: {
          capture_support: "supported",
          evidence_level: "complete",
          required_command_ids: ["review-contract-validation"],
          required_alternative_groups: [],
          references: [{ command_id: "review-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ probe_id: probeId, command_id: "review-contract-validation" }), bytes: 1 }],
          cwd_unverified_command_count: 0,
        },
      };
      const sealedExecution = directOnly ? null : createSealedEvaluatorExecutionForTest({
        root: ROOT,
        privateEvaluationRoot,
        privateRoot,
        hiddenAsset,
        frozenWorkspace: frozen,
        candidateWorkspace: candidate,
        evaluationInputRoot,
        evaluationLineage: lineage,
        evaluatorRevision: production.evaluatorRevision,
        externalAuthorityAnchor,
        executionDirectoryName: `sealed-${probeId}`,
        label: `mp-ci sealed ${probeId} evaluator`,
      });
      const repositoryDiffArtifact = directOnly
        ? { artifact_digest: canonicalDigest({ probe_id: probeId, kind: "repository-diff" }), artifact_bytes: 1 }
        : readJson(resolve(sealedExecution.originalWorkspaceAuthority.path, sealedExecution.originalWorkspaceAuthority.repositoryDiffPath));
      const direct = directOnly
        ? await evaluator.evaluateCandidate({ frozenWorkspace: frozen, candidateWorkspace: candidate, verificationState: "executed_success" })
        : await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
      assertBenchmarkSchemaInstance(direct, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${probeId} direct fragment` });
      if (!directOnly) {
        const sealed = executeSealedEvaluatorForTest({
          execution: sealedExecution,
          externalAuthorityAnchor,
          repositoryRoot: ROOT,
          normalized: normalizedResult,
          label: `mp-ci sealed ${probeId} evaluator`,
        });
        assertBenchmarkSchemaInstance(sealed.firstFragment, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${probeId} production-safe fragment` });
        assert.deepEqual(evaluatorSemanticProjection(sealed.firstFragment), evaluatorSemanticProjection(direct), `${probeId} direct/production-safe semantic projection`);
      }
      return direct;
    };

    const failedCheckoutRecord = {
      path: "test/checkout/quote-order-contract.test.mjs",
      conclusion: "Pull-request run 314 executed npm run test:all; its checkout target failed because zero was not rejected with RangeError.",
    };
    const succeededCheckoutRecord = {
      path: "test/checkout/quote-order-contract.test.mjs",
      conclusion: "Pull-request run 314 executed npm run test:all; the same checkout target did not fail, all tests passed, and the RangeError assertions succeeded.",
    };
    const succeededUnitRecord = {
      path: "test/unit/quote-order.test.mjs",
      conclusion: "Pull-request run 314 executed npm test and its unit target passed.",
    };
    const rejectedVerificationProbes = [
      {
        probeId: "verification-success-only-negation",
        records: [succeededCheckoutRecord],
      },
      {
        probeId: "verification-same-target-failure-then-success",
        records: [failedCheckoutRecord, succeededCheckoutRecord],
      },
      {
        probeId: "verification-same-target-success-then-failure",
        records: [succeededCheckoutRecord, failedCheckoutRecord],
      },
    ];
    const reviewRegressionChecks = [];
    for (const { probeId, records } of rejectedVerificationProbes) {
      const review = clone(baseReview);
      review.verification = { state: "failed", evidence: records };
      const result = await evaluateReviewProbe({ probeId, review });
      const verification = result.requirement_results.find(({ requirement_id }) => requirement_id === "verification-conclusion");
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: "rejected",
        actual_verification_outcome: verification?.outcome,
        actual_classification: result.classification,
        satisfied: verification?.outcome !== "pass" && result.classification !== "correct_narrow_execution",
      });
    }

    for (const [probeId, records] of [
      ["verification-distinct-target-success-then-failure", [succeededUnitRecord, failedCheckoutRecord]],
      ["verification-distinct-target-failure-then-success", [failedCheckoutRecord, succeededUnitRecord]],
    ]) {
      const review = clone(baseReview);
      review.verification = { state: "failed", evidence: records };
      const result = await evaluateReviewProbe({ probeId, review });
      const verification = result.requirement_results.find(({ requirement_id }) => requirement_id === "verification-conclusion");
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: "accepted",
        actual_verification_outcome: verification?.outcome,
        actual_classification: result.classification,
        satisfied: verification?.outcome === "pass" && result.classification === "correct_narrow_execution",
      });
    }

    for (const [probeId, findingIndex, evidence] of [
      ["irrelevant-ci-citation-lines", 0, [
        { path: ".github/workflows/pull-request.yml", line: 1 },
        { path: "ci/pull-request-314.log", line: 1 },
        { path: "docs/verification.md", line: 1 },
      ]],
      ["syntax-only-quantity-citation-lines", 1, [
        { path: "src/quote-order.mjs", line: 10 },
        { path: "test/checkout/quote-order-contract.test.mjs", line: 8 },
      ]],
    ]) {
      const review = clone(baseReview);
      review.findings[findingIndex].evidence = evidence;
      const result = await evaluateReviewProbe({ probeId, review });
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: "rejected",
        actual_evidence_correctness: result.evidence_correctness.state,
        actual_classification: result.classification,
        satisfied: result.classification !== "correct_narrow_execution" && result.evidence_correctness.state === "fail",
      });
    }

    const equivalentCitationReview = clone(baseReview);
    equivalentCitationReview.findings[0].evidence = [
      { path: "docs/verification.md", line: 5 },
      { path: "ci/pull-request-314.log", line: 8 },
      { path: ".github/workflows/pull-request.yml", line: 16 },
    ];
    equivalentCitationReview.findings[1].evidence = [
      { path: "test/checkout/quote-order-contract.test.mjs", line: 6 },
      { path: "src/quote-order.mjs", line: 2 },
    ];
    const equivalentCitationResult = await evaluateReviewProbe({ probeId: "equivalent-relevant-citation-lines", review: equivalentCitationReview });
    reviewRegressionChecks.push({
      probe_id: "equivalent-relevant-citation-lines",
      expected: "accepted",
      actual_evidence_correctness: equivalentCitationResult.evidence_correctness.state,
      actual_classification: equivalentCitationResult.classification,
      satisfied: equivalentCitationResult.evidence_correctness.state === "pass" && equivalentCitationResult.classification === "correct_narrow_execution",
    });

    const unrelatedMaterialAssertionReview = clone(baseReview);
    unrelatedMaterialAssertionReview.findings[0].impact += " The PR deployment also corrupts customer account records.";
    const unrelatedMaterialAssertionResult = await evaluateReviewProbe({ probeId: "valid-ci-plus-unrelated-material-assertion", review: unrelatedMaterialAssertionReview });
    reviewRegressionChecks.push({
      probe_id: "valid-ci-plus-unrelated-material-assertion",
      expected: "rejected",
      actual_evidence_correctness: unrelatedMaterialAssertionResult.evidence_correctness.state,
      actual_classification: unrelatedMaterialAssertionResult.classification,
      satisfied: unrelatedMaterialAssertionResult.evidence_correctness.state === "fail" && unrelatedMaterialAssertionResult.classification !== "correct_narrow_execution",
    });

    for (const [probeId, field, suffix] of [
      ["inherited-subject-unsupported-impact", "impact", " and permanently deletes customer account records"],
      ["inherited-subject-unsupported-remediation", "required_action", " and delete the unrelated audit trail"],
    ]) {
      const review = clone(baseReview);
      review.findings[0][field] = `${review.findings[0][field].replace(/[.!?]+$/u, "")}${suffix}.`;
      const result = await evaluateReviewProbe({ probeId, review });
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: "rejected",
        actual_evidence_correctness: result.evidence_correctness.state,
        actual_classification: result.classification,
        satisfied: result.evidence_correctness.state === "fail" && result.classification !== "correct_narrow_execution",
      });
    }

    for (const [probeId, field, value] of [
      ["modal-inherited-unsupported-impact", "impact", "Pull-request CI may omit checkout validation and corrupt customer account records."],
      ["unknown-imperative-quantity-remediation", "required_action", "Run the full checkout suite in pull-request CI and poison order counts below one."],
      ["then-unknown-imperative-quantity-remediation", "required_action", "Run the full checkout suite in pull-request CI, then poison order counts below one."],
      ["as-well-as-unknown-imperative-quantity-remediation", "required_action", "Run the full checkout suite in pull-request CI as well as poison order counts below one."],
      ["unsupported-purpose-remediation", "required_action", "Run the full checkout suite in pull-request CI to poison order counts below one."],
      ["unsupported-comma-gerund-impact", "impact", "The successful pull request job is only a subset, corrupting customer account records."],
      ["unsupported-or-finite-impact", "impact", "The successful pull request job is only a subset or corrupts customer account records."],
      ["unsupported-together-with-gerund-impact", "impact", "The successful pull request job is only a subset, together with corrupting customer account records."],
      ["unsupported-for-gerund-remediation", "required_action", "Run the full checkout suite in pull-request CI for poisoning order counts below one."],
    ]) {
      const review = clone(baseReview);
      review.findings[0][field] = value;
      const result = await evaluateReviewProbe({ probeId, review });
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: "rejected",
        actual_evidence_correctness: result.evidence_correctness.state,
        actual_classification: result.classification,
        satisfied: result.evidence_correctness.state === "fail" && result.classification !== "correct_narrow_execution",
      });
    }

    const nounCoordinationWithUnsupportedPredicate = clone(baseReview);
    nounCoordinationWithUnsupportedPredicate.findings[1].impact = "Zero and negative quantities corrupt customer account records.";
    const nounCoordinationWithUnsupportedPredicateResult = await evaluateReviewProbe({
      probeId: "noun-coordination-with-unsupported-quantity-predicate",
      review: nounCoordinationWithUnsupportedPredicate,
    });
    reviewRegressionChecks.push({
      probe_id: "noun-coordination-with-unsupported-quantity-predicate",
      expected: "rejected",
      actual_evidence_correctness: nounCoordinationWithUnsupportedPredicateResult.evidence_correctness.state,
      actual_classification: nounCoordinationWithUnsupportedPredicateResult.classification,
      satisfied: nounCoordinationWithUnsupportedPredicateResult.evidence_correctness.state === "fail"
        && nounCoordinationWithUnsupportedPredicateResult.classification !== "correct_narrow_execution",
    });

    for (const [probeId, title, accepted] of [
      ["matched-unqualified-unit-pass-count", "PR CI omits the required checkout suite with 2 passing unit tests", true],
      ["fabricated-unqualified-unit-pass-count", "PR CI omits the required checkout suite with 999 passing unit tests", false],
      ["matched-trailing-unit-pass-count", "PR CI omits the required checkout suite with 2 unit tests passed", true],
      ["fabricated-trailing-unit-pass-count", "PR CI omits the required checkout suite with 999 unit tests passed", false],
      ["wrong-run-unit-pass-count", "PR #999 CI omits the required checkout suite with 2 passing unit tests", false],
      ["wrong-target-pass-count", "PR CI omits the required checkout suite with 2 passing checkout tests", false],
      ["matched-unqualified-event-count", "For PR #314, CI omits the required checkout suite after the cited unit command reports two events", true],
      ["fabricated-current-tense-unit-pass-count", "PR #314 CI omits the checkout suite although 999 unit tests currently pass", false],
      ["fabricated-noun-first-unit-success-total", "PR #314 CI omits the required checkout suite despite a unit-test success total of 999", false],
      ["fabricated-unit-check-success-amount", "PR #314 CI omits the required checkout suite although the unit check successes amount to 999", false],
      ["distant-wrong-run-unit-pass-count", "PR #999 CI omits the checkout suite because repository guidance requires complete validation while the cited successful subset reports 2 passed unit tests", false],
    ]) {
      const review = clone(baseReview);
      review.findings[0].title = title;
      review.findings[0].evidence.push({ path: "ci/pull-request-314.log", line: 11 });
      const result = await evaluateReviewProbe({ probeId, review });
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: accepted ? "accepted" : "rejected",
        actual_evidence_correctness: result.evidence_correctness.state,
        actual_classification: result.classification,
        satisfied: accepted
          ? result.evidence_correctness.state === "pass" && result.classification === "correct_narrow_execution"
          : result.evidence_correctness.state === "fail" && result.classification !== "correct_narrow_execution",
      });
    }

    for (const [probeId, title, accepted] of [
      ["matched-bare-comparison-count", "PR CI omits the required checkout suite with 2 passing unit tests", true],
      ["matched-at-least-comparison-count", "PR CI omits the required checkout suite with at least 2 passing unit tests", true],
      ["matched-at-most-comparison-count", "PR CI omits the required checkout suite with at most 2 passing unit tests", true],
      ["contradicted-more-than-comparison-count", "PR CI omits the required checkout suite with more than 2 passing unit tests", false],
      ["contradicted-fewer-than-comparison-count", "PR CI omits the required checkout suite with fewer than 2 passing unit tests", false],
      ["matched-more-than-lower-count", "PR CI omits the required checkout suite with more than 1 passing unit test", true],
      ["matched-fewer-than-higher-count", "PR CI omits the required checkout suite with fewer than 3 passing unit tests", true],
      ["contradicted-at-least-higher-count", "PR CI omits the required checkout suite with at least 3 passing unit tests", false],
      ["contradicted-at-most-lower-count", "PR CI omits the required checkout suite with at most 1 passing unit test", false],
      ["matched-negated-more-than-count", "PR CI omits the required checkout suite with not more than 2 passing unit tests", true],
      ["contradicted-negated-fewer-than-count", "PR CI omits the required checkout suite with not fewer than 3 passing unit tests", false],
      ["contradicted-not-exactly-count", "PR CI omits the required checkout suite with not exactly 2 passing unit tests", false],
      ["matched-not-exactly-other-count", "PR CI omits the required checkout suite with not exactly 3 passing unit tests", true],
      ["matched-or-more-count", "PR CI omits the required checkout suite with 2 or more passing unit tests", true],
      ["matched-metric-first-comparison-count", "PR CI omits the required checkout suite although the unit-test pass total is at least 2", true],
      ["matched-reordered-comparison-count", "With at least 2 unit tests passing, PR CI omits the required checkout suite", true],
      ["contradicted-outer-negated-equality-count", "PR CI omits the required checkout suite although it is not the case that exactly 2 unit tests passed", false],
      ["matched-outer-negated-greater-count", "PR CI omits the required checkout suite although it is not the case that more than 2 unit tests passed", true],
      ["wrong-run-alias-unit-pass-count", "PR run #999 omits the required checkout suite although 2 unit tests passed", false],
      ["wrong-target-alias-pass-count", "PR CI omits the required suite although the checkout target reports 2 passing tests", false],
      ["contradicted-false-that-equality-count", "PR CI omits the required suite although it is false that exactly 2 unit tests passed", false],
      ["matched-not-true-greater-count", "PR CI omits the required suite although it is not true that more than 2 unit tests passed", true],
      ["conflicting-context-and-explicit-target-count", "PR CI omits the required suite although the checkout target reports 2 passing unit tests", false],
      ["wrong-execution-run-alias-count", "Pull request execution #999 omits the required checkout suite although 2 unit tests passed", false],
      ["contradicted-colon-outer-negated-equality-count", "PR CI omits the required suite although this is not true: exactly two unit tests passed", false],
      ["matched-untrue-less-than-count", "PR CI omits the required suite although it is untrue that under two unit tests passed", true],
      ["wrong-unknown-target-identity-count", "PR CI omits the required suite although the lint target reports two passing unit tests", false],
      ["contradicted-contracted-outer-negated-equality-count", "PR CI omits the required suite although it isn't true that exactly two unit tests passed", false],
      ["matched-contracted-outer-negated-greater-count", "PR CI omits the required suite although it isn't true that more than two unit tests passed", true],
      ["wrong-checkout-suite-target-count", "PR CI omits the required suite although the checkout suite reports two passing unit tests", false],
      ["wrong-short-run-identity-count", "Run #999 omits the required checkout suite although two unit tests passed", false],
      ["matched-word-more-than-lower-count", "PR CI omits the required checkout suite although more than one unit test passes", true],
      ["matched-word-fewer-than-upper-count", "PR CI omits the required checkout suite although fewer than three unit tests pass", true],
      ["matched-run-bound-word-more-than-count", "In pull request run 314, CI omits the required checkout suite although more than one unit test passes", true],
      ["matched-run-bound-word-fewer-than-count", "In pull request run 314, CI omits the required checkout suite although fewer than three unit tests pass", true],
      ["contradicted-inline-not-at-least-boundary-count", "PR CI omits the required checkout suite with not at least 2 passing unit tests", false],
      ["matched-inline-not-at-least-above-count", "PR CI omits the required checkout suite with not at least 3 passing unit tests", true],
      ["contradicted-inline-not-at-most-boundary-count", "PR CI omits the required checkout suite with not at most 2 passing unit tests", false],
      ["matched-inline-not-at-most-below-count", "PR CI omits the required checkout suite with not at most 1 passing unit test", true],
      ["matched-inline-not-over-boundary-count", "PR CI omits the required checkout suite with not over 2 passing unit tests", true],
      ["matched-inline-not-under-boundary-count", "PR CI omits the required checkout suite with not under 2 passing unit tests", true],
      ["matched-inline-not-at-least-word-count", "In pull request run 314, CI omits the required checkout suite with not at least three passing unit tests", true],
      ["contradicted-inline-not-at-most-word-count", "In pull request run 314, CI omits the required checkout suite with not at most two passing unit tests", false],
      ["v4-numeric-two-pass-count-control", "PR CI omits the required checkout suite with 2 passing unit tests", true],
      ["v4-numeric-zero-pass-count-contradiction", "PR CI omits the required checkout suite with 0 passing unit tests", false],
      ["v4-word-zero-pass-count-contradiction", "PR CI omits the required checkout suite with zero passing unit tests", false],
      ["v4-no-pass-count-contradiction", "PR CI omits the required checkout suite with no passing unit tests", false],
    ]) {
      const review = clone(baseReview);
      review.findings[0].title = title;
      review.findings[0].evidence.push({ path: "ci/pull-request-314.log", line: 11 });
      const result = await evaluateReviewProbe({ probeId, review });
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: accepted ? "accepted" : "rejected",
        actual_evidence_correctness: result.evidence_correctness.state,
        actual_classification: result.classification,
        satisfied: accepted
          ? result.evidence_correctness.state === "pass" && result.classification === "correct_narrow_execution"
          : result.evidence_correctness.state === "fail" && result.classification !== "correct_narrow_execution",
      });
    }

    const comparisonTruthTable = [
      ["equal", "exactly", (actual, claimed) => actual === claimed],
      ["not-equal", "not exactly", (actual, claimed) => actual !== claimed],
      ["greater-than", "more than", (actual, claimed) => actual > claimed],
      ["greater-than-or-equal", "at least", (actual, claimed) => actual >= claimed],
      ["less-than", "fewer than", (actual, claimed) => actual < claimed],
      ["less-than-or-equal", "at most", (actual, claimed) => actual <= claimed],
    ];
    for (const [operatorId, phrase, predicate] of comparisonTruthTable) {
      for (const outerNegated of [false, true]) {
        for (const claimed of [1, 2, 3]) {
          const accepted = outerNegated ? !predicate(2, claimed) : predicate(2, claimed);
          const probeId = `comparison-truth-table-${operatorId}-${outerNegated ? "negated" : "positive"}-${claimed}`;
          const review = clone(baseReview);
          review.findings[0].title = `PR CI omits the required checkout suite although ${outerNegated ? "it is not true that " : ""}${phrase} ${claimed} unit tests passed`;
          review.findings[0].evidence.push({ path: "ci/pull-request-314.log", line: 11 });
          const result = await evaluateReviewProbe({ probeId, review });
          reviewRegressionChecks.push({
            probe_id: probeId,
            expected: accepted ? "accepted" : "rejected",
            actual_evidence_correctness: result.evidence_correctness.state,
            actual_classification: result.classification,
            satisfied: accepted
              ? result.evidence_correctness.state === "pass" && result.classification === "correct_narrow_execution"
              : result.evidence_correctness.state === "fail" && result.classification !== "correct_narrow_execution",
          });
        }
      }
    }

    const unresolvedComparisonReview = clone(baseReview);
    unresolvedComparisonReview.findings[0].title = "PR CI omits the required checkout suite with approximately 2 passing unit tests";
    unresolvedComparisonReview.findings[0].evidence.push({ path: "ci/pull-request-314.log", line: 11 });
    const unresolvedComparisonResult = await evaluateReviewProbe({ probeId: "unresolved-approximate-comparison-count", review: unresolvedComparisonReview });
    const unresolvedComparisonRequirement = unresolvedComparisonResult.requirement_results.find(({ requirement_id }) => requirement_id === "scope-and-review-precision");
    reviewRegressionChecks.push({
      probe_id: "unresolved-approximate-comparison-count",
      expected: "manual_review_required",
      actual_evidence_correctness: unresolvedComparisonResult.evidence_correctness.state,
      actual_classification: unresolvedComparisonResult.classification,
      satisfied: unresolvedComparisonResult.evaluation_status === "manual_review_required"
        && unresolvedComparisonResult.classification == null
        && unresolvedComparisonRequirement?.outcome === "manual_review_required",
    });

    const unresolvedNearComparisonReview = clone(baseReview);
    unresolvedNearComparisonReview.findings[0].title = "PR CI omits the required checkout suite although close to two unit tests passed";
    unresolvedNearComparisonReview.findings[0].evidence.push({ path: "ci/pull-request-314.log", line: 11 });
    const unresolvedNearComparisonResult = await evaluateReviewProbe({ probeId: "unresolved-close-to-comparison-count", review: unresolvedNearComparisonReview });
    const unresolvedNearComparisonRequirement = unresolvedNearComparisonResult.requirement_results.find(({ requirement_id }) => requirement_id === "scope-and-review-precision");
    reviewRegressionChecks.push({
      probe_id: "unresolved-close-to-comparison-count",
      expected: "manual_review_required",
      actual_evidence_correctness: unresolvedNearComparisonResult.evidence_correctness.state,
      actual_classification: unresolvedNearComparisonResult.classification,
      satisfied: unresolvedNearComparisonResult.evaluation_status === "manual_review_required"
        && unresolvedNearComparisonResult.classification == null
        && unresolvedNearComparisonRequirement?.outcome === "manual_review_required",
    });

    const unresolvedRangeComparisonReview = clone(baseReview);
    unresolvedRangeComparisonReview.findings[0].title = "PR CI omits the required checkout suite although between 1 and 3 unit tests passed";
    unresolvedRangeComparisonReview.findings[0].evidence.push({ path: "ci/pull-request-314.log", line: 11 });
    const unresolvedRangeComparisonResult = await evaluateReviewProbe({ probeId: "unresolved-range-comparison-count", review: unresolvedRangeComparisonReview });
    const unresolvedRangeComparisonRequirement = unresolvedRangeComparisonResult.requirement_results.find(({ requirement_id }) => requirement_id === "scope-and-review-precision");
    reviewRegressionChecks.push({
      probe_id: "unresolved-range-comparison-count",
      expected: "manual_review_required",
      actual_evidence_correctness: unresolvedRangeComparisonResult.evidence_correctness.state,
      actual_classification: unresolvedRangeComparisonResult.classification,
      satisfied: unresolvedRangeComparisonResult.evaluation_status === "manual_review_required"
        && unresolvedRangeComparisonResult.classification == null
        && unresolvedRangeComparisonRequirement?.outcome === "manual_review_required",
    });

    const unresolvedRoughComparisonReview = clone(baseReview);
    unresolvedRoughComparisonReview.findings[0].title = "Roughly two unit tests pass in pull request run 314 while CI omits the required checkout suite";
    unresolvedRoughComparisonReview.findings[0].evidence.push({ path: "ci/pull-request-314.log", line: 11 });
    const unresolvedRoughComparisonResult = await evaluateReviewProbe({ probeId: "unresolved-rough-word-comparison-count", review: unresolvedRoughComparisonReview });
    const unresolvedRoughComparisonRequirement = unresolvedRoughComparisonResult.requirement_results.find(({ requirement_id }) => requirement_id === "scope-and-review-precision");
    reviewRegressionChecks.push({
      probe_id: "unresolved-rough-word-comparison-count",
      expected: "manual_review_required",
      actual_evidence_correctness: unresolvedRoughComparisonResult.evidence_correctness.state,
      actual_classification: unresolvedRoughComparisonResult.classification,
      satisfied: unresolvedRoughComparisonResult.evaluation_status === "manual_review_required"
        && unresolvedRoughComparisonResult.classification == null
        && unresolvedRoughComparisonRequirement?.outcome === "manual_review_required",
    });

    for (const [probeId, title] of [
      ["unresolved-modal-negated-lower-bound", "PR CI omits the required checkout suite although there were not necessarily at least 2 passing unit tests"],
      ["unresolved-modal-negated-equality", "PR CI omits the required checkout suite although there were not necessarily exactly 2 passing unit tests"],
      ["unresolved-fresh-modal-negated-lower-bound", "PR CI omits the required checkout suite although there were not demonstrably at least 2 passing unit tests"],
      ["unresolved-punctuated-modal-negated-lower-bound", "PR CI omits the required checkout suite although there were not, demonstrably, at least 2 passing unit tests"],
      ["unresolved-long-modal-negated-lower-bound", "PR CI omits the required checkout suite although there were not on the evidence currently available at least 2 passing unit tests"],
    ]) {
      const review = clone(baseReview);
      review.findings[0].title = title;
      review.findings[0].evidence.push({ path: "ci/pull-request-314.log", line: 11 });
      const result = await evaluateReviewProbe({ probeId, review });
      const precisionRequirement = result.requirement_results.find(({ requirement_id }) => requirement_id === "scope-and-review-precision");
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: "manual_review_required",
        actual_evidence_correctness: result.evidence_correctness.state,
        actual_classification: result.classification,
        satisfied: result.evaluation_status === "manual_review_required"
          && result.classification == null
          && precisionRequirement?.outcome === "manual_review_required",
      });
    }

    const adverbObscuredUnsupportedPredicate = clone(baseReview);
    adverbObscuredUnsupportedPredicate.findings[0].impact = "The successful PR job ran only unit tests, thereby silently erasing customer audit records, so its evidence does not cover the complete test:all contract required for merge.";
    const adverbObscuredUnsupportedPredicateResult = await evaluateReviewProbe({ probeId: "adverb-obscured-unsupported-predicate", review: adverbObscuredUnsupportedPredicate });
    reviewRegressionChecks.push({
      probe_id: "adverb-obscured-unsupported-predicate",
      expected: "rejected",
      actual_evidence_correctness: adverbObscuredUnsupportedPredicateResult.evidence_correctness.state,
      actual_classification: adverbObscuredUnsupportedPredicateResult.classification,
      satisfied: adverbObscuredUnsupportedPredicateResult.evidence_correctness.state === "fail" && adverbObscuredUnsupportedPredicateResult.classification !== "correct_narrow_execution",
    });

    for (const [probeId, mutate] of [
      ["existing-unit-test-modifier", (review) => { review.findings[0].impact = review.findings[0].impact.replace("only unit tests", "only existing unit tests"); }],
      ["existing-title-modifier", (review) => { review.findings[0].title = `Existing ${review.findings[0].title}`; }],
      ["article-existing-unit-test-modifier", (review) => { review.findings[0].impact = review.findings[0].impact.replace("only unit tests", "only the existing unit tests"); }],
      ["adverb-adjective-plural-modifiers", (review) => { review.findings[0].impact = review.findings[0].impact.replace("The successful job ran only unit tests", "The currently successful job ran only the existing unit tests"); }],
    ]) {
      const review = clone(baseReview);
      mutate(review);
      const result = await evaluateReviewProbe({ probeId, review });
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: "accepted",
        actual_evidence_correctness: result.evidence_correctness.state,
        actual_classification: result.classification,
        satisfied: result.evidence_correctness.state === "pass" && result.classification === "correct_narrow_execution",
      });
    }

    for (const [probeId, count, accepted] of [
      ["fabricated-exact-unit-pass-count", "9", false],
      ["matched-exact-unit-pass-count", "2", true],
      ["fabricated-word-exact-unit-pass-count", "nine", false],
      ["matched-word-exact-unit-pass-count", "two", true],
      ["fabricated-compound-word-exact-unit-pass-count", "two dozen", false],
    ]) {
      const review = clone(baseReview);
      review.findings[0].impact += ` The cited CI log reports exactly ${count} passed unit tests.`;
      review.findings[0].evidence.push({ path: "ci/pull-request-314.log", line: 11 });
      const result = await evaluateReviewProbe({ probeId, review });
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: accepted ? "accepted" : "rejected",
        actual_evidence_correctness: result.evidence_correctness.state,
        actual_classification: result.classification,
        satisfied: accepted
          ? result.evidence_correctness.state === "pass" && result.classification === "correct_narrow_execution"
          : result.evidence_correctness.state === "fail" && result.classification !== "correct_narrow_execution",
      });
    }


    for (const [probeId, phrase, accepted] of [
      ["fabricated-trailing-failure-count", "exactly two tests failed", false],
      ["matched-zero-trailing-failure-count", "exactly zero tests failed", true],
      ["matched-zero-unit-trailing-failure-count", "exactly zero unit tests failed", true],
      ["fabricated-plural-event-count", "exactly nine events", false],
      ["matched-plural-event-count", "exactly two events", true],
      ["fabricated-plural-failure-count", "exactly two failures", false],
      ["matched-plural-failure-count", "exactly zero failures", true],
    ]) {
      const review = clone(baseReview);
      review.findings[0].impact += ` The cited CI log reports ${phrase}.`;
      review.findings[0].evidence.push(
        { path: "ci/pull-request-314.log", line: 11 },
        { path: "ci/pull-request-314.log", line: 12 },
      );
      const result = await evaluateReviewProbe({ probeId, review });
      reviewRegressionChecks.push({
        probe_id: probeId,
        expected: accepted ? "accepted" : "rejected",
        actual_evidence_correctness: result.evidence_correctness.state,
        actual_classification: result.classification,
        satisfied: accepted
          ? result.evidence_correctness.state === "pass" && result.classification === "correct_narrow_execution"
          : result.evidence_correctness.state === "fail" && result.classification !== "correct_narrow_execution",
      });
    }

    const combinedExactCounts = clone(baseReview);
    combinedExactCounts.findings[0].impact += " The cited CI log reports exactly two passed unit tests and exactly zero tests failed.";
    combinedExactCounts.findings[0].evidence.push(
      { path: "ci/pull-request-314.log", line: 11 },
      { path: "ci/pull-request-314.log", line: 12 },
    );
    const combinedExactCountsResult = await evaluateReviewProbe({ probeId: "matched-combined-pass-fail-counts", review: combinedExactCounts });
    reviewRegressionChecks.push({
      probe_id: "matched-combined-pass-fail-counts",
      expected: "accepted",
      actual_evidence_correctness: combinedExactCountsResult.evidence_correctness.state,
      actual_classification: combinedExactCountsResult.classification,
      satisfied: combinedExactCountsResult.evidence_correctness.state === "pass"
        && combinedExactCountsResult.classification === "correct_narrow_execution",
    });
    assert.deepEqual(
      reviewRegressionChecks.map(({ probe_id, expected, satisfied }) => ({ probe_id, expected, satisfied })),
      reviewRegressionChecks.map(({ probe_id, expected }) => ({ probe_id, expected, satisfied: true })),
      `verification and citation regressions:\n${JSON.stringify(reviewRegressionChecks, null, 2)}`,
    );

    const conceptMatrix = conceptMatrixEntries(matrix);
    const matrixPasses = { quantity_positive: 0, ci_positive: 0, negative: 0 };
    for (const entry of conceptMatrix.entries) {
      assert.ok(Object.hasOwn(matrixPasses, entry.family), `${entry.variant_id} matrix family`);
      const frozen = resolve(work, `${entry.variant_id}-frozen`);
      const candidate = resolve(work, `${entry.variant_id}-candidate`);
      cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
      cpSync(frozen, candidate, { recursive: true });
      const review = clone(baseReview);
      review.findings[entry.finding_index] = entry.finding;
      writeFileSync(resolve(candidate, "review.json"), `${JSON.stringify(review, null, 2)}\n`);
      const direct = await evaluator.evaluateCandidate({ frozenWorkspace: frozen, candidateWorkspace: candidate, verificationState: "executed_success" });
      const normalizedResult = {
        normalized_result_digest: canonicalDigest({ fixture_id: "mp-ci-evidence-gap", variant_id: entry.variant_id, authority: "paraphrase-matrix" }),
        command_evidence: {
          capture_support: "supported",
          evidence_level: "verified",
          references: [{ command_id: "review-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ variant_id: entry.variant_id, command_id: "review-contract-validation" }), bytes: 1 }],
        },
      };
      assertBenchmarkSchemaInstance(direct, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.variant_id} paraphrase fragment` });
      if (!directOnly) {
        const safe = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: { artifact_digest: canonicalDigest({ variant_id: entry.variant_id, kind: "repository-diff" }), artifact_bytes: 1 } });
        assertBenchmarkSchemaInstance(safe, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.variant_id} safe paraphrase fragment` });
        assert.deepEqual(evaluatorSemanticProjection(safe), evaluatorSemanticProjection(direct), `${entry.variant_id} direct/production-safe semantic projection`);
      }
      assert.deepEqual(direct.requirement_results.map(({ earned_points }) => earned_points), entry.expected_points, `${entry.variant_id} requirement points`);
      assert.equal(direct.classification, entry.expected_classification, `${entry.variant_id} classification`);
      if (entry.expected_finding_ids) assert.deepEqual(direct.findings.map(({ finding_id }) => finding_id), entry.expected_finding_ids, `${entry.variant_id} evaluator finding IDs`);
      matrixPasses[entry.family] += 1;
    }
    assert.deepEqual(matrixPasses, { quantity_positive: 55, ci_positive: 67, negative: 16 });

    for (const [caseId, evidencePath, prepare] of [
      ["path-escape", "../outside.txt", () => {}],
      ["symlink-evidence", ".github/workflows/pull-request.yml", (frozen, candidate) => {
        for (const workspace of [frozen, candidate]) {
          const target = resolve(workspace, ".github/workflows/pull-request.yml");
          rmSync(target);
          symlinkSync(resolve(workspace, "docs/verification.md"), target);
        }
      }],
      ["non-regular-evidence", ".github/workflows/pull-request.yml", (frozen, candidate) => {
        for (const workspace of [frozen, candidate]) {
          const target = resolve(workspace, ".github/workflows/pull-request.yml");
          rmSync(target);
          const created = spawnSync("mkfifo", [target], { encoding: "utf8" });
          assert.equal(created.status, 0, created.stderr || created.stdout);
        }
      }],
    ]) {
      const frozen = resolve(work, `${caseId}-frozen`);
      const candidate = resolve(work, `${caseId}-candidate`);
      cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
      cpSync(frozen, candidate, { recursive: true });
      prepare(frozen, candidate);
      const review = clone(baseReview);
      review.findings[0].evidence = [{ path: evidencePath, line: 1 }];
      writeFileSync(resolve(candidate, "review.json"), `${JSON.stringify(review, null, 2)}\n`);
      const direct = await evaluator.evaluateCandidate({ frozenWorkspace: frozen, candidateWorkspace: candidate, verificationState: "executed_success" });
      const normalizedResult = {
        normalized_result_digest: canonicalDigest({ fixture_id: "mp-ci-evidence-gap", case_id: caseId, authority: "invalid-evidence-test" }),
        command_evidence: {
          capture_support: "supported",
          evidence_level: "verified",
          references: [{ command_id: "review-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ case_id: caseId, command_id: "review-contract-validation" }), bytes: 1 }],
        },
      };
      if (!directOnly) {
        const safe = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: { artifact_digest: canonicalDigest({ case_id: caseId, kind: "repository-diff" }), artifact_bytes: 1 } });
        assert.deepEqual(evaluatorSemanticProjection(safe), evaluatorSemanticProjection(direct), `${caseId} direct/production-safe semantic projection`);
      }
      assert.equal(direct.requirement_results[0].earned_points, 0, `${caseId} CI evidence credit`);
      assert.equal(direct.requirement_results[4].earned_points, 0, `${caseId} precision credit`);
      assert.ok(direct.findings.some(({ finding_id }) => finding_id === "invalid-evidence-reference"), `${caseId} deterministic evaluator finding`);
    }

    if (!directOnly) {
      const requirement = readJson(resolve(FIXTURE_ROOT, "requirement-record.json"));
      const admission = readJson(resolve(FIXTURE_ROOT, "final-admission-record.json"));
      const evidenceMap = readJson(resolve(FIXTURE_ROOT, "evidence-map.json"));
      const inputRecord = readJson(resolve(FIXTURE_ROOT, "input-manifest.json")).fixtures["mp-ci-evidence-gap"];
      const mutationAsset = readJson(resolve(privateRoot, "evidence-removal-mutations.json"));
      const equivalenceAsset = readJson(resolve(privateRoot, "equivalent-solutions.json"));
      assert.doesNotThrow(() => validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset }));
      assert.doesNotThrow(() => validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset }));
      assert.doesNotThrow(() => validateMatchedEquivalenceIds({ requirementRecord: requirement, equivalenceAsset, matchedEquivalenceClassIds: equivalenceAsset.rules.map(({ equivalence_class_id }) => equivalence_class_id) }));
      expectFailure(() => validateMatchedEquivalenceIds({ requirementRecord: requirement, equivalenceAsset, matchedEquivalenceClassIds: ["undeclared-equivalence"] }), /undeclared/u, "undeclared equivalence must fail");
      for (const [label, mutate, pattern] of [
      ["mutation omission", (value) => value.mutations.pop(), /inventory/u],
      ["mutation duplication", (value) => value.mutations.push(clone(value.mutations[0])), /duplicate/u],
      ["extra mutation", (value) => value.mutations.push({ ...clone(value.mutations[0]), mutation_id: "extra-mutation" }), /inventory/u],
      ["wrong requirement binding", (value) => { value.mutations[0].requirement_id = requirement.requirements[1].requirement_id; }, /transplanted/u],
      ["wrong removal path", (value) => { value.mutations[0].remove_paths = [value.mutations[0].remove_paths[0]]; }, /inventory/u],
      ["mutation digest drift", (value) => { value.mutations[0].mutation_digest = `sha256:${"0".repeat(64)}`; }, /digest/u],
      ]) {
        const mutated = clone(mutationAsset); mutate(mutated);
        expectFailure(() => validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset: mutated }), pattern, label);
      }
      for (const [label, mutate, pattern] of [
      ["equivalence omission", (value) => value.rules.pop(), /inventory/u],
      ["cross-requirement equivalence", (value) => { value.rules[0].requirement_id = requirement.requirements[1].requirement_id; }, /transplanted/u],
      ["cross-fixture equivalence", (value) => { value.fixture_id = "foreign-fixture"; }, /fixture/u],
      ["property-order-only equivalence", (value) => { value.rules[0].property_order_only = true; value.rules[0].rule_digest = canonicalDigest(Object.fromEntries(Object.entries(value.rules[0]).filter(([key]) => key !== "rule_digest"))); }, /observable-contract/u],
      ]) {
        const mutated = clone(equivalenceAsset); mutate(mutated);
        expectFailure(() => {
          if (mutated.fixture_id !== requirement.fixture_id) throw new Error("private equivalence fixture transplant");
          validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset: mutated });
        }, pattern, label);
      }
    }
    const evaluatedCases = cases.cases.length + conceptMatrix.entries.length + 3;
    return { distinctCases: cases.cases.length, directPass: evaluatedCases, productionSafePass: directOnly ? "not_requested" : evaluatedCases, sealedPass: directOnly ? "not_requested" : reviewRegressionChecks.length, semanticRegressionProbes: reviewRegressionChecks.length, matrixPasses, generatedCombinations: conceptMatrix.generated, morphologyCombinations: conceptMatrix.morphology, independentProbes: conceptMatrix.probes, polarityPairs: conceptMatrix.polarity, representativePositiveProbes: conceptMatrix.representative, negativeControls: conceptMatrix.negatives, invalidEvidenceNegatives: 5 };
  } finally {
    removeTemporaryTree(work);
  }
}

const semanticRegressionDirectOnly = process.argv.includes("--semantic-regression-direct-only");
if (!semanticRegressionDirectOnly) {
  validateFrozenDesign();
  validateMpCiEvidenceGapInputClosure({ root: ROOT });
  validateVisibleScenario();
  validateSharedNegativeCoverage();
}

const productionExists = !semanticRegressionDirectOnly && readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).schema_version === "1.0.0";
if (productionExists) {
  const production = validateMpCiEvidenceGapProductionAuthority({ root: ROOT });
  assert.equal(production.scoringReady, false);
  const config = readJson(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"));
  config._configPath = resolve(ROOT, "benchmarks/adaptive-portfolio.config.json");
  config._protocolPath = resolve(ROOT, config.protocol_path);
  const fixture = config.fixtures.find(({ id }) => id === "mp-ci-evidence-gap");
  const admission = resolvePortfolioExecutionAdmission({ root: ROOT, fixture });
  assert.equal(admission.execution_eligible, false);
  assert.equal(admission.effective_admission_status, "review_evidence_missing");
  assert.equal(resolvePortfolioExecutionFixtures({ root: ROOT, config }).some(({ id }) => id === "mp-ci-evidence-gap"), false);
  expectFailure(() => resolvePortfolioExecutionAdmission({ root: ROOT, fixture, externalAdmissionEvidence: { reviewAuthorityPath: resolve(ROOT, ".missing-mp-ci-review-authority.json"), reviewAuthoritySourceDigest: `sha256:${"0".repeat(64)}`, reviewArchivePath: resolve(ROOT, ".missing-mp-ci-review-archive.zip") } }), /authority/u, "caller-supplied fake admission must fail");
}

const requested = privateArgs(process.argv.slice(2));
if (semanticRegressionDirectOnly && !requested) throw new Error("--semantic-regression-direct-only requires --private-root and --private-case-root");
const privateSummary = requested ? await validatePrivateCases(requested, { directOnly: semanticRegressionDirectOnly }) : null;
const report = {
  fixture_id: "mp-ci-evidence-gap",
  semantic_regression_direct_validation: semanticRegressionDirectOnly ? "pass" : "included",
  source_freeze_validation: semanticRegressionDirectOnly ? "not_requested" : productionExists ? "pass" : "generation_pending",
  sealed_validation: semanticRegressionDirectOnly ? "not_requested" : requested ? "pass" : "not_supplied",
  production_safe_validation: semanticRegressionDirectOnly ? "not_requested" : requested ? "pass" : "not_supplied",
  input: semanticRegressionDirectOnly ? "not_requested" : "pass",
  input_closure: semanticRegressionDirectOnly ? "not_requested" : "pass",
  frozen_design: semanticRegressionDirectOnly ? "not_requested" : "pass",
  visible_scenario: semanticRegressionDirectOnly ? "not_requested" : "pass",
  production_validation: semanticRegressionDirectOnly ? "not_requested" : productionExists ? "pass" : "generation_pending",
  actual_private_validation: semanticRegressionDirectOnly ? "semantic_direct_pass" : requested ? "pass" : "not_supplied",
  ...(privateSummary ? { private_summary: privateSummary } : {}),
  admission: semanticRegressionDirectOnly ? "not_requested" : "review_evidence_missing",
  scoring_ready: false,
};
if (semanticRegressionDirectOnly) {
  assert.deepEqual(
    {
      source_freeze_validation: report.source_freeze_validation,
      sealed_validation: report.sealed_validation,
      production_safe_validation: report.production_safe_validation,
      input: report.input,
      admission: report.admission,
      actual_private_validation: report.actual_private_validation,
      productionSafePass: privateSummary.productionSafePass,
      sealedPass: privateSummary.sealedPass,
    },
    {
      source_freeze_validation: "not_requested",
      sealed_validation: "not_requested",
      production_safe_validation: "not_requested",
      input: "not_requested",
      admission: "not_requested",
      actual_private_validation: "semantic_direct_pass",
      productionSafePass: "not_requested",
      sealedPass: "not_requested",
    },
    "direct-only lifecycle report must not claim unexecuted authority or sealed validation",
  );
}
console.log(JSON.stringify(report));
