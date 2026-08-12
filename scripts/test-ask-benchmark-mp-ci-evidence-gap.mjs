import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
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
  for (const [label, coverage, source] of [
    ["quantity", quantityCoverage, quantity],
    ["CI", ciCoverage, ci],
  ]) {
    for (const [dimension, seen] of Object.entries(coverage)) assert.equal(seen.size, source[dimension].length, `${label} ${dimension} lexicon coverage`);
  }
  const probes = matrix.independent_probes.map((entry) => ({ ...entry, expected_points: [3, 3, 2, 1, 1], expected_classification: "correct_narrow_execution" }));
  return { entries: [...quantityEntries, ...ciEntries, ...probes, ...matrix.negative_controls], generated: { quantity: quantityEntries.length, ci: ciEntries.length }, probes: { quantity: probes.filter(({ family }) => family === "quantity_positive").length, ci: probes.filter(({ family }) => family === "ci_positive").length }, negatives: matrix.negative_controls.length };
}

async function validatePrivateCases({ privateRoot, caseRoot }) {
  const work = mkdtempSync(resolve(tmpdir(), "mp-ci-private-test-"));
  try {
    const boundaryRoots = createBoundaryRoots(work);
    const production = validateMpCiEvidenceGapProductionAuthority({ root: ROOT, privateRoot, boundaryRoots });
    assert.equal(production.scoringReady, false);
    assert.equal(production.admissionState, "admission_pending");
    const evaluator = await import(`${pathToFileURL(resolve(privateRoot, "hidden-evaluator.mjs")).href}?digest=${production.evaluatorBundleDigest}`);
    const cases = readJson(resolve(caseRoot, "cases.json"));
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
      const safeFirst = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
      const safeSecond = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
      assert.deepEqual(safeFirst, safeSecond, `${entry.case_id} production-safe evaluator determinism`);
      assertBenchmarkSchemaInstance(first, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} private fragment` });
      assertBenchmarkSchemaInstance(safeFirst, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} production-safe private fragment` });
      assert.deepEqual(evaluatorSemanticProjection(safeFirst), evaluatorSemanticProjection(first), `${entry.case_id} direct/production-safe semantic projection`);
      assert.deepEqual(first.requirement_results.map(({ earned_points }) => earned_points), entry.expected_points, `${entry.case_id} requirement points`);
      assert.equal(first.classification, entry.expected_classification, `${entry.case_id} classification`);
      if (entry.expected_finding_ids) assert.deepEqual(first.findings.map(({ finding_id }) => finding_id), entry.expected_finding_ids, `${entry.case_id} evaluator finding IDs`);
      assert.equal(first.scoring_ready, false);
    }

    const matrix = readJson(resolve(caseRoot, "concept-family-matrix.json"));
    assert.equal(matrix.fixture_id, "mp-ci-evidence-gap");
    assert.equal(matrix.schema_version, "1.0.0");
    const baseReview = readJson(resolve(caseRoot, matrix.base_review));
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
      const safe = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: { artifact_digest: canonicalDigest({ variant_id: entry.variant_id, kind: "repository-diff" }), artifact_bytes: 1 } });
      assertBenchmarkSchemaInstance(direct, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.variant_id} paraphrase fragment` });
      assertBenchmarkSchemaInstance(safe, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.variant_id} safe paraphrase fragment` });
      assert.deepEqual(evaluatorSemanticProjection(safe), evaluatorSemanticProjection(direct), `${entry.variant_id} direct/production-safe semantic projection`);
      assert.deepEqual(direct.requirement_results.map(({ earned_points }) => earned_points), entry.expected_points, `${entry.variant_id} requirement points`);
      assert.equal(direct.classification, entry.expected_classification, `${entry.variant_id} classification`);
      if (entry.expected_finding_ids) assert.deepEqual(direct.findings.map(({ finding_id }) => finding_id), entry.expected_finding_ids, `${entry.variant_id} evaluator finding IDs`);
      matrixPasses[entry.family] += 1;
    }
    assert.deepEqual(matrixPasses, { quantity_positive: 32, ci_positive: 29, negative: 5 });

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
      const safe = await evaluator.evaluateCandidateSafe({ frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: { artifact_digest: canonicalDigest({ case_id: caseId, kind: "repository-diff" }), artifact_bytes: 1 } });
      assert.deepEqual(evaluatorSemanticProjection(safe), evaluatorSemanticProjection(direct), `${caseId} direct/production-safe semantic projection`);
      assert.equal(direct.requirement_results[0].earned_points, 0, `${caseId} CI evidence credit`);
      assert.equal(direct.requirement_results[4].earned_points, 0, `${caseId} precision credit`);
      assert.ok(direct.findings.some(({ finding_id }) => finding_id === "invalid-evidence-reference"), `${caseId} deterministic evaluator finding`);
    }

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
    const evaluatedCases = cases.cases.length + conceptMatrix.entries.length + 3;
    return { distinctCases: cases.cases.length, directPass: evaluatedCases, productionSafePass: evaluatedCases, matrixPasses, generatedCombinations: conceptMatrix.generated, independentProbes: conceptMatrix.probes, negativeControls: conceptMatrix.negatives, invalidEvidenceNegatives: 5 };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

validateFrozenDesign();
validateMpCiEvidenceGapInputClosure({ root: ROOT });
validateVisibleScenario();
validateSharedNegativeCoverage();

const productionExists = readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).schema_version === "1.0.0";
if (productionExists) {
  const production = validateMpCiEvidenceGapProductionAuthority({ root: ROOT });
  assert.equal(production.scoringReady, false);
  const config = readJson(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"));
  config._configPath = resolve(ROOT, "benchmarks/adaptive-portfolio.config.json");
  config._protocolPath = resolve(ROOT, config.protocol_path);
  const fixture = config.fixtures.find(({ id }) => id === "mp-ci-evidence-gap");
  const admission = resolvePortfolioExecutionAdmission({ root: ROOT, fixture });
  assert.equal(admission.execution_eligible, false);
  assert.equal(admission.effective_admission_status, "admission_pending");
  assert.equal(resolvePortfolioExecutionFixtures({ root: ROOT, config }).some(({ id }) => id === "mp-ci-evidence-gap"), false);
  expectFailure(() => resolvePortfolioExecutionAdmission({ root: ROOT, fixture, externalAdmissionEvidence: { reviewAuthorityPath: "/tmp/fake", reviewAuthoritySourceDigest: `sha256:${"0".repeat(64)}`, reviewArchivePath: "/tmp/fake.zip" } }), /cannot create admission|overlay/u, "caller-supplied fake admission must fail");
}

const requested = privateArgs(process.argv.slice(2));
const privateSummary = requested ? await validatePrivateCases(requested) : null;

console.log(JSON.stringify({ fixture_id: "mp-ci-evidence-gap", input_closure: "pass", frozen_design: "pass", visible_scenario: "pass", production_validation: productionExists ? "pass" : "generation_pending", actual_private_validation: requested ? "pass" : "not_supplied", ...(privateSummary ? { private_summary: privateSummary } : {}), admission: "pending", scoring_ready: false }));
