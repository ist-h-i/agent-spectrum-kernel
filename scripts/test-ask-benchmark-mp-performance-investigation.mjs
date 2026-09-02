import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { resolveRepositoryAdmissionDecision } from "./ask-benchmark-admission-decision.mjs";
import {
  createSealedEvaluatorExecutionForTest,
  executeSealedEvaluatorForTest,
  readEvaluatorAuthorityAnchorFromFreeze,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { resolvePortfolioExecutionAdmission, resolvePortfolioExecutionFixtures } from "./ask-benchmark-plan.mjs";
import { computeResultProfileDigest } from "./ask-benchmark-scoring-contract.mjs";
import { validateEquivalenceAuthority, validateMatchedEquivalenceIds, validateMutationAuthority } from "./ask-benchmark-mn-build-option-update.mjs";
import { validateMpPerformanceInvestigationInputClosure } from "./ask-benchmark-mp-performance-investigation.mjs";
import { validateMpPerformanceInvestigationProductionAuthority } from "./ask-benchmark-mp-performance-investigation-authority.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ID = "mp-performance-investigation";
const FIXTURE_ROOT = resolve(ROOT, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`);
const REQUIREMENT_COUNT = 5;
const REQUIRED_COVERAGE = Object.freeze(["evidence_removal", "scope", "causal_hypothesis", "competing_hypothesis", "bounded_next_check", "equivalence", "malformed"]);
const SUCCESSOR_CASE_MATRIX = Object.freeze([
  "fresh-valid-investigation|positive|11111", "fresh-causal-evidence-removed|evidence_removal|01110", "fresh-wrong-leading-cause|causal_hypothesis|01111", "fresh-unsupported-competing-cause|competing_hypothesis|10111", "fresh-overclaimed-causality|confidence|11011", "fresh-unsafe-next-check|bounded_next_check|11101", "fresh-scope-expansion|scope|11110", "fresh-equivalent-hypothesis-label|equivalence|11111", "fresh-overconfident-leading-hypothesis|confidence|01011", "fresh-next-check-signal-drift|bounded_next_check|11101", "fresh-next-check-stop-drift|bounded_next_check|11101", "fresh-evidence-line-drift|evidence_removal|01110", "fresh-protected-mode-change|scope|11110", "fresh-malformed-investigation|malformed|00000",
]);
const CASE_FIELDS = Object.freeze(["case_id", "coverage_class", "mutations", "expected_passes", "expected_findings", "expected_scope_deviations", "expected_evaluation_status", "expected_verification_correctness", "expected_evidence_correctness", "expected_under_processing", "expected_over_processing", "expected_classification", "expected_public_validation", "extra_candidate_path", "mode_change_candidate_path", "control"]);
const FRESH_CASE_PAYLOAD_DIGEST = "sha256:c47d88d8ec83de671d4629c535837e37c4162445e83a1a14cc4c05ab30d3b476";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function stableCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function repositoryDiffArtifactForEntries(diffEntries, lineage) {
  return { run_instance_id: lineage.run_instance_id, case_id: lineage.case_id, attempt: lineage.attempt, artifact_digest: canonicalDigest(diffEntries), artifact_bytes: Buffer.byteLength(stableCanonicalJson(diffEntries)) || 1, diff_entries: diffEntries };
}

function directRepositoryDiffArtifact(entry, lineage) {
  const diffEntries = [{ path: "investigation.json", change_type: "addition", before: null, after: { file_type: "file" } }];
  if (entry.extra_candidate_path) diffEntries.push({ path: entry.extra_candidate_path, change_type: "addition", before: null, after: { file_type: "file" } });
  if (entry.mode_change_candidate_path) diffEntries.push({ path: entry.mode_change_candidate_path, change_type: "modification", before: { file_type: "file", mode: 0o644 }, after: { file_type: "file", mode: 0o755 } });
  return repositoryDiffArtifactForEntries(diffEntries, lineage);
}

function validateFreshPrivateSourceContract({ privateRoot, caseRoot }, { sourceOnly }) {
  const sourceNames = ["false-positive-boundaries.json", "hidden-evaluator.mjs", "human-instructions.md", "oracle.json", "rubric.md", "scope-boundaries.json"];
  const generatedNames = ["dependency-graph.json", "equivalent-solutions.json", "evidence-removal-mutations.json", "independence.json", "private-evaluator-bundle.json"];
  assert.deepEqual(readdirSync(privateRoot).sort(), [...sourceNames, ...(sourceOnly ? [] : generatedNames)].sort(), "fresh performance private root inventory must be closed for its generation phase");
  for (const name of sourceNames) {
    const entry = lstatSync(resolve(privateRoot, name));
    assert.ok(entry.isFile() && !entry.isSymbolicLink(), `${name} must be a regular source file`);
  }
  assert.deepEqual(readdirSync(caseRoot).sort(), ["cases.json"], "fresh performance case root inventory must be closed");
  const cases = readJson(resolve(caseRoot, "cases.json"));
  validateFreshCases(cases);
  for (const name of ["oracle.json", "scope-boundaries.json", "false-positive-boundaries.json"]) assert.equal(readJson(resolve(privateRoot, name)).fixture_id, FIXTURE_ID, `${name} fixture identity`);
  assert.equal(readJson(resolve(privateRoot, "scope-boundaries.json")).historical_private_material_used, false);
  const authoritySource = readFileSync(resolve(ROOT, "scripts/ask-benchmark-mp-performance-investigation-authority.mjs"), "utf8");
  for (const marker of ["current_canonical_public_contracts", "historical_private_case_review_bytes_unavailable", "historical_private_case_review_bytes_not_reconstructed", "measured_agent_output", "measured_scoring_result"]) assert.ok(authoritySource.includes(marker), `authority writer must retain ${marker} provenance`);
  return { cases: cases.cases.length, source_files: sourceNames.length };
}

function validateFreshCases(cases) {
  assert.equal(canonicalDigest(cases), FRESH_CASE_PAYLOAD_DIGEST, "fresh performance behavior-bearing case payload must remain independently frozen");
  const duplicatedPayload = clone(cases);
  duplicatedPayload.cases[1].mutations = clone(duplicatedPayload.cases[0].mutations);
  assert.notEqual(canonicalDigest(duplicatedPayload), FRESH_CASE_PAYLOAD_DIGEST, "fresh performance payload duplication must invalidate the independent case digest");
  assert.deepEqual(Object.keys(cases).sort(), ["base_output", "cases", "fixture_id"], "private cases top-level contract must be closed");
  assert.equal(cases.fixture_id, FIXTURE_ID);
  assert.ok(Array.isArray(cases.cases) && cases.cases.length > 0);
  const ids = new Set();
  const coverage = new Set();
  const failed = new Set();
  for (const entry of cases.cases) {
    assert.deepEqual(Object.keys(entry).filter((field) => !CASE_FIELDS.includes(field)), [], `${entry.case_id} unknown case fields`);
    for (const field of ["case_id", "coverage_class", "mutations", "expected_passes", "expected_findings", "expected_evaluation_status", "expected_verification_correctness", "expected_evidence_correctness", "expected_under_processing", "expected_over_processing", "expected_classification"]) assert.ok(Object.hasOwn(entry, field), `${entry.case_id ?? "case"} missing ${field}`);
    assert.match(entry.case_id, /^[a-z0-9][a-z0-9_-]*$/u);
    assert.ok(!ids.has(entry.case_id), `duplicate private case ID: ${entry.case_id}`);
    ids.add(entry.case_id);
    assert.match(entry.coverage_class, /^[a-z0-9][a-z0-9_]*$/u);
    coverage.add(entry.coverage_class);
    assert.ok(Array.isArray(entry.mutations));
    for (const mutation of entry.mutations) {
      assert.ok(["set", "delete"].includes(mutation.operation) && Array.isArray(mutation.path) && mutation.path.length > 0);
      assert.deepEqual(Object.keys(mutation).sort(), mutation.operation === "set" ? ["operation", "path", "value"] : ["operation", "path"]);
    }
    assert.ok(Array.isArray(entry.expected_passes) && entry.expected_passes.length === REQUIREMENT_COUNT && entry.expected_passes.every((value) => typeof value === "boolean"), `${entry.case_id} expected_passes must be a five-boolean vector`);
    entry.expected_passes.forEach((passes, index) => { if (!passes) failed.add(index); });
    assert.ok(Array.isArray(entry.expected_findings));
    if (entry.expected_public_validation !== undefined) assert.equal(typeof entry.expected_public_validation, "boolean");
    if (entry.expected_scope_deviations !== undefined) assert.ok(Array.isArray(entry.expected_scope_deviations));
    for (const pathField of ["extra_candidate_path", "mode_change_candidate_path"]) if (entry[pathField] !== undefined) assert.match(entry[pathField], /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+$/u);
  }
  for (const required of REQUIRED_COVERAGE) assert.ok(coverage.has(required), `private cases missing ${required} coverage`);
  assert.equal(failed.size, REQUIREMENT_COUNT, "private cases must fail every weighted requirement at least once");
  assert.deepEqual(cases.cases.map((entry) => `${entry.case_id}|${entry.coverage_class}|${entry.expected_passes.map(Number).join("")}`), SUCCESSOR_CASE_MATRIX, "fresh successor semantic-boundary inventory must remain exact");
}

function applyMutations(value, mutations) {
  for (const mutation of mutations) {
    let parent = value;
    for (const segment of mutation.path.slice(0, -1)) parent = parent[segment];
    const key = mutation.path.at(-1);
    if (mutation.operation === "set") parent[key] = clone(mutation.value);
    else delete parent[key];
  }
}

function validateHistoricalAuthority() {
  const decisionPath = `benchmarks/fixtures/admission-decision/${FIXTURE_ID}-admission-decision.json`;
  const decisionBytes = spawnSync("git", ["show", `HEAD:${decisionPath}`], { cwd: ROOT, encoding: null }).stdout;
  const decision = JSON.parse(decisionBytes.toString("utf8"));
  assert.equal(`sha256:${createHash("sha256").update(decisionBytes).digest("hex")}`, "sha256:ab2f9ceb18e27a7968cfeab1afde90a920f0dbf1a06a023559272128716f611c");
  assert.equal(decision.decision_id, "admission-decision-1b5e0ac3b2086d93ff6b50c3a8c32f4a");
  assert.equal(decision.decision_digest, "sha256:7adcf6d11c4d1786689e52957a28ed3591d501eb26fbcb3117472e601190758f");
  for (const authority of [decision.frozen_admission_authority, decision.frozen_requirement_record, decision.frozen_scoring_input_manifest]) {
    const result = spawnSync("git", ["show", `${decision.reviewed_head_revision}:${authority.path}`], { cwd: ROOT, encoding: null });
    assert.equal(result.status, 0, `${authority.path} historical Git bytes must remain reconstructable`);
    assert.equal(`sha256:${createHash("sha256").update(result.stdout).digest("hex")}`, authority.raw_byte_digest);
  }
  const referenceResult = spawnSync("git", ["show", `${decision.reviewed_head_revision}:benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/evaluator-reference.json`], { cwd: ROOT, encoding: "utf8" });
  assert.equal(referenceResult.status, 0);
  const reference = JSON.parse(referenceResult.stdout);
  assert.equal(reference.evaluator_revision, decision.evaluator.evaluator_revision);
  assert.equal(reference.evaluator_bundle_id, decision.evaluator.evaluator_bundle_id);
  assert.equal(reference.evaluator_bundle_digest, decision.evaluator.evaluator_bundle_digest);
}

function evaluatorSemanticProjection(result) {
  return {
    evaluation_status: result.evaluation_status,
    requirement_results: result.requirement_results.map(({ requirement_id, outcome, earned_points, matched_equivalence_class_ids, finding_ids, evidence_references, scope_deviation_references, verification_evidence_references, verification_evidence_state }) => ({
      requirement_id,
      outcome,
      earned_points,
      matched_equivalence_class_ids,
      finding_ids,
      evidence_references,
      scope_deviation_references,
      verification_evidence_references,
      verification_evidence_state,
    })),
    findings: result.findings.map(({ finding_id, category, severity, evidence_references }) => ({ finding_id, category, severity, evidence_references })),
    scope_deviations: result.scope_deviations.map(({ finding_id, category, severity, evidence_references }) => ({ finding_id, category, severity, evidence_references })),
    verification_correctness: result.verification_correctness,
    evidence_correctness: result.evidence_correctness,
    under_processing: result.under_processing,
    over_processing: result.over_processing,
    classification_present: Object.hasOwn(result, "classification"),
    classification: result.classification ?? null,
    result_profile: result.result_profile,
    scoring_ready: result.scoring_ready,
  };
}

function expectedSemanticProjection(entry, { normalizedResult, repositoryDiffArtifact }) {
  const requirementIds = [
    "cache-key-causal-hypothesis",
    "competing-hypothesis-falsification",
    "causal-confidence-calibration",
    "bounded-next-check",
    "evidence-and-scope-precision",
  ];
  const maxPoints = [4, 2, 1, 2, 1];
  const equivalenceIds = [
    "equivalent-request-id-cache-fragmentation",
    "equivalent-stable-traffic-db-falsification",
    "equivalent-supported-not-proven-assessment",
    "equivalent-isolated-cache-key-replay",
    "equivalent-evidence-bounded-investigation",
  ];
  const expectedScopeDeviations = entry.expected_scope_deviations ?? [];
  const scopeDeviationIds = expectedScopeDeviations.map(({ finding_id }) => finding_id);
  const normalizedReference = { kind: "normalized_result", digest: normalizedResult.normalized_result_digest, bytes: 1 };
  const diffReference = { kind: "repository_diff", digest: repositoryDiffArtifact.artifact_digest, bytes: repositoryDiffArtifact.artifact_bytes };
  const verificationSource = normalizedResult.command_evidence.references[0];
  const verificationReference = { kind: "execution_event", digest: verificationSource.digest, bytes: verificationSource.bytes };
  const standardReferences = [normalizedReference, diffReference, verificationReference];
  const observation = (state, verificationObservation = false) => ({
    state,
    evidence_references: verificationObservation ? [verificationReference] : standardReferences,
  });
  return {
    evaluation_status: entry.expected_evaluation_status,
    requirement_results: requirementIds.map((requirement_id, index) => ({
      requirement_id,
      outcome: entry.expected_passes[index] ? "pass" : "fail",
      earned_points: entry.expected_passes[index] ? maxPoints[index] : 0,
      matched_equivalence_class_ids: entry.expected_passes[index] ? [equivalenceIds[index]] : [],
      finding_ids: entry.expected_passes[index] ? [] : [`fresh-${requirement_id}`],
      evidence_references: standardReferences,
      scope_deviation_references: scopeDeviationIds,
      verification_evidence_references: [verificationReference],
      verification_evidence_state: "executed_success",
    })),
    findings: entry.expected_findings.map((finding) => ({ ...finding, evidence_references: standardReferences })),
    scope_deviations: expectedScopeDeviations.map((finding) => ({ ...finding, evidence_references: standardReferences })),
    verification_correctness: observation(entry.expected_verification_correctness, true),
    evidence_correctness: observation(entry.expected_evidence_correctness),
    under_processing: observation(entry.expected_under_processing),
    over_processing: observation(entry.expected_over_processing),
    classification_present: true,
    classification: entry.expected_classification,
    result_profile: { name: "binary_scope_verification_v1", digest: computeResultProfileDigest() },
    scoring_ready: false,
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
  const record = readJson(resolve(ROOT, "benchmarks/portfolio-design-admission-records/mp-performance-investigation.json"));
  assert.deepEqual(record.catalog_metadata, {
    suite: "mechanism_positive",
    task_class: "investigation",
    domain: "performance",
    difficulty: "hard",
    repetitions: 5,
    capability_families: ["hypothesis_testing", "performance_diagnosis"],
    evidence_topologies: ["observability_signals", "runtime_measurements"],
    outcome_dimensions: ["causal_confidence", "performance_stability"],
    risk_boundary: "none",
  });
  assert.equal(record.answer_neutral_design.output_contract_type, "findings_producing");
  assert.equal(record.answer_neutral_design.evidence_removal_mutation_topology, "observability_signals");
  assert.equal(record.answer_neutral_design.suspicious_but_correct_control_required, false);
  assert.equal(record.answer_neutral_design.safety_approval_boundary_required, false);
}

function validateVisibleScenario() {
  const workspace = resolve(FIXTURE_ROOT, "workspace");
  const unit = spawnSync(process.execPath, ["--test", "test/unit/cache-key.test.mjs"], { cwd: workspace, encoding: "utf8" });
  assert.equal(unit.status, 0, unit.stderr || unit.stdout);
  const integration = spawnSync(process.execPath, ["--test", "test/integration/summary-replay.test.mjs"], { cwd: workspace, encoding: "utf8" });
  assert.equal(integration.status, 0, integration.stderr || integration.stdout);
  const replay = spawnSync(process.execPath, ["scripts/replay-summary.mjs"], { cwd: workspace, encoding: "utf8" });
  assert.equal(replay.status, 0, replay.stderr || replay.stdout);
  assert.deepEqual(JSON.parse(replay.stdout), {
    requests: 3,
    hits: 0,
    builds: 3,
    keys: ["tenant-a:15:req-1", "tenant-a:15:req-2", "tenant-a:15:req-3"],
  });
  const contract = readFileSync(resolve(workspace, "docs/investigation-contract.md"), "utf8");
  assert.match(contract, /tenantId.+windowMinutes|requestId.+trace metadata/isu, "contract must define reusable identity independently from trace identity");
}

function validateWorkspaceValidatorParity() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-performance-investigation-validator-"));
  const workspace = resolve(FIXTURE_ROOT, "workspace");
  const schemaPath = resolve(workspace, "investigation.schema.json");
  const validatorPath = resolve(workspace, "scripts/validate-investigation.mjs");
  const valid = {
    overall_assessment: {
      status: "supported_not_proven",
      leading_hypothesis_id: "cache-key",
      causal_basis: "association_only",
    },
    hypotheses: [
      {
        id: "cache-key",
        mechanism: "request_scoped_cache_identity",
        state: "supported",
        confidence: "high",
        evidence: [{ path: "src/cache-key.mjs", line: 5, source_excerpt: "return `${tenantId}:${windowMinutes}:${requestId}`;" }],
      },
      {
        id: "traffic",
        mechanism: "traffic_volume",
        state: "weakened",
        confidence: "high",
        evidence: [{ path: "observability/request-windows.csv", line: 3, source_excerpt: "2026-08-16T10:00:00Z,2026.08.16-1,203.4,782,0.003,0.04,614,44,6" }],
      },
    ],
    next_check: {
      hypothesis_id: "cache-key",
      environment: "local_replay",
      action_type: "compare_cache_identity_variants",
      candidate_identity: "tenant_window",
      expected_signals: ["cache_reuse_increase", "summary_builds_decrease", "latency_decrease"],
      stop_condition: "signals_do_not_move_together",
      read_only: true,
      customer_traffic_change: false,
      runtime_configuration_change: false,
      live_cache_mutation: false,
    },
    scope: { changes_made: false, production_action_authorized: false },
  };
  const validPath = resolve(work, "valid.json");
  writeFileSync(validPath, `${JSON.stringify(valid, null, 2)}\n`);
  assert.doesNotThrow(() => assertBenchmarkSchemaInstance(valid, { schemaPath, label: "valid performance investigation" }));
  const validResult = spawnSync(process.execPath, [validatorPath, validPath], { encoding: "utf8" });
  assert.equal(validResult.status, 0, validResult.stderr || validResult.stdout);

  const invalidCases = [
    ["too-few-hypotheses", (value) => { value.hypotheses.pop(); }],
    ["empty-evidence", (value) => { value.hypotheses[0].evidence = []; }],
    ["blank-evidence-path", (value) => { value.hypotheses[0].evidence[0].path = " "; }],
    ["blank-source-excerpt", (value) => { value.hypotheses[0].evidence[0].source_excerpt = " "; }],
    ["invalid-evidence-line", (value) => { value.hypotheses[0].evidence[0].line = 0; }],
    ["invalid-mechanism", (value) => { value.hypotheses[0].mechanism = "scheduler_starvation"; }],
    ["invalid-next-check-action", (value) => { value.next_check.action_type = "reroute_customer_requests"; }],
    ["duplicate-expected-signal", (value) => { value.next_check.expected_signals.push("latency_decrease"); }],
    ["non-boolean-safety-field", (value) => { value.next_check.live_cache_mutation = "false"; }],
    ["free-text-overall-field", (value) => { value.overall_assessment.summary = "Scheduler starvation drove the regression."; }],
    ["free-text-hypothesis-field", (value) => { value.hypotheses[0].rationale = "A narrative claim."; }],
    ["free-text-action-field", (value) => { value.next_check.action = "Evict the live cache."; }],
    ["unsafe-scope", (value) => { value.scope.production_action_authorized = true; }],
  ];
  for (const [name, mutate] of invalidCases) {
    const value = clone(valid);
    mutate(value);
    const path = resolve(work, `${name}.json`);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
    assert.throws(() => assertBenchmarkSchemaInstance(value, { schemaPath, label: name }), /JSON Schema validation/u, `${name} schema rejection`);
    const result = spawnSync(process.execPath, [validatorPath, path], { encoding: "utf8" });
    assert.notEqual(result.status, 0, `${name} runtime validator rejection`);
  }

  for (const [name, mutate] of [
    ["duplicate-hypothesis-id", (value) => { value.hypotheses[1].id = value.hypotheses[0].id; }],
    ["duplicate-hypothesis-mechanism", (value) => { value.hypotheses[1].mechanism = value.hypotheses[0].mechanism; }],
    ["unknown-leading-hypothesis", (value) => { value.overall_assessment.leading_hypothesis_id = "missing"; }],
    ["unknown-next-check-target", (value) => { value.next_check.hypothesis_id = "missing"; }],
    ["wrong-source-excerpt", (value) => { value.hypotheses[0].evidence[0].source_excerpt = "requestId is included"; }],
    ["cross-line-source-excerpt", (value) => {
      value.hypotheses[1].evidence[0].line = 3;
      value.hypotheses[1].evidence[0].source_excerpt = "2026-08-16T09:00:00Z,2026.08.15-3,201.7,118,0.002,0.91,18,42,5";
    }],
    ["unavailable-evidence-path", (value) => { value.hypotheses[0].evidence[0].path = "README.md"; }],
  ]) {
    const value = clone(valid);
    mutate(value);
    const path = resolve(work, `${name}.json`);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
    const result = spawnSync(process.execPath, [validatorPath, path], { encoding: "utf8" });
    assert.notEqual(result.status, 0, `${name} requires relational validator rejection`);
  }

  const workspacePrefixed = clone(valid);
  workspacePrefixed.hypotheses[0].evidence[0].path = "workspace/src/cache-key.mjs";
  const workspacePrefixedPath = resolve(work, "workspace-prefixed.json");
  writeFileSync(workspacePrefixedPath, `${JSON.stringify(workspacePrefixed, null, 2)}\n`);
  const workspacePrefixedResult = spawnSync(process.execPath, [validatorPath, workspacePrefixedPath], { encoding: "utf8" });
  assert.equal(workspacePrefixedResult.status, 0, workspacePrefixedResult.stderr || workspacePrefixedResult.stdout);

  const unresolved = clone(valid);
  unresolved.hypotheses.push({
    id: "network-scheduler",
    mechanism: "network_or_scheduler",
    state: "unresolved",
    confidence: "low",
    evidence: [{ path: "docs/investigation-contract.md", line: 13, source_excerpt: "No network, scheduler, memory, or other unlisted mechanism measurements are supplied; such mechanisms may be recorded only as unresolved." }],
  });
  const unresolvedPath = resolve(work, "unresolved-hypothesis.json");
  writeFileSync(unresolvedPath, `${JSON.stringify(unresolved, null, 2)}\n`);
  assert.doesNotThrow(() => assertBenchmarkSchemaInstance(unresolved, { schemaPath, label: "unresolved performance hypothesis" }));
  const unresolvedResult = spawnSync(process.execPath, [validatorPath, unresolvedPath], { encoding: "utf8" });
  assert.equal(unresolvedResult.status, 0, unresolvedResult.stderr || unresolvedResult.stdout);
}

function validatePublicNegativeCoverage() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-performance-investigation-public-negative-"));
  const copy = (name) => {
    const root = resolve(work, name);
    const cloned = spawnSync("git", ["clone", "--shared", "--quiet", ROOT, root], { encoding: "utf8" });
    assert.equal(cloned.status, 0, cloned.stderr || cloned.stdout);
    return root;
  };
  const vocabulary = copy("vocabulary");
  writeFileSync(resolve(vocabulary, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/task.md`), "Review this benchmark task.\n");
  expectFailure(() => validateMpPerformanceInvestigationInputClosure({ root: vocabulary }), /benchmark-specific vocabulary/u, "public vocabulary leakage");

  const inventory = copy("inventory");
  writeFileSync(resolve(inventory, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/workspace/notes.txt`), "drift\n");
  expectFailure(() => validateMpPerformanceInvestigationInputClosure({ root: inventory }), /inventory/u, "agent-visible inventory drift");

  const privateLeak = copy("private-leak");
  writeFileSync(resolve(privateLeak, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/workspace/oracle.json`), "{}\n");
  expectFailure(() => validateMpPerformanceInvestigationInputClosure({ root: privateLeak }), /prohibited/u, "private material leakage");

  const inputDrift = copy("input-drift");
  const inputPath = resolve(inputDrift, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/input-manifest.json`);
  const input = readJson(inputPath);
  input.fixtures[FIXTURE_ID].files[0].sha256 = "0".repeat(64);
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  expectFailure(() => validateMpPerformanceInvestigationInputClosure({ root: inputDrift }), /inventory/u, "input digest drift");

  const verificationDrift = copy("verification-drift");
  const verificationPath = resolve(verificationDrift, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/verification-command-contract.json`);
  const verification = readJson(verificationPath);
  verification.fixture_input_digest = `sha256:${"0".repeat(64)}`;
  writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
  expectFailure(() => validateMpPerformanceInvestigationInputClosure({ root: verificationDrift }), /digest|binding/u, "verification/input mismatch");
}

function validateProductionNegativeCoverage() {
  const work = mkdtempSync(resolve(tmpdir(), "mp-performance-investigation-production-negative-"));
  const copy = (name) => {
    const root = resolve(work, name);
    const cloned = spawnSync("git", ["clone", "--shared", "--quiet", ROOT, root], { encoding: "utf8" });
    assert.equal(cloned.status, 0, cloned.stderr || cloned.stdout);
    cpSync(FIXTURE_ROOT, resolve(root, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`), { recursive: true, force: true });
    cpSync(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"), resolve(root, "benchmarks/adaptive-portfolio.config.json"), { force: true });
    return root;
  };
  for (const [name, relativePath, mutate, pattern] of [
    ["missing-requirement-evidence", "requirement-record.json", (value) => { value.requirements[0].evidence_map_ids = []; }, /requirement|evidence|digest/u],
    ["evaluator-reference-mismatch", "evaluator-reference.json", (value) => { value.evaluator_authority_manifest_digest = `sha256:${"0".repeat(64)}`; }, /digest|binding|transplanted/u],
    ["stale-source-freeze", "source-freeze-candidate.json", (value) => { value.public_bindings.input_manifest.raw_sha256 = `sha256:${"0".repeat(64)}`; }, /state|digest|binding/u],
  ]) {
    const root = copy(name);
    const path = resolve(root, `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}/${relativePath}`);
    const value = readJson(path);
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
    expectFailure(() => validateMpPerformanceInvestigationProductionAuthority({ root }), pattern, name);
  }
}

async function validatePrivateCases({ privateRoot, caseRoot, productionExists }) {
  const work = mkdtempSync(resolve(tmpdir(), "mp-performance-investigation-private-test-"));
  const boundaryRoots = productionExists ? createBoundaryRoots(work) : null;
  const production = productionExists ? validateMpPerformanceInvestigationProductionAuthority({ root: ROOT, privateRoot, boundaryRoots }) : null;
  if (production) { assert.equal(production.scoringReady, false); assert.equal(production.admissionState, "admission_pending"); }
  const evaluator = await import(`${pathToFileURL(resolve(privateRoot, "hidden-evaluator.mjs")).href}?digest=${createHash("sha256").update(readFileSync(resolve(privateRoot, "hidden-evaluator.mjs"))).digest("hex")}`);
  const cases = readJson(resolve(caseRoot, "cases.json"));
  validateFreshCases(cases);
  const requirement = readJson(resolve(FIXTURE_ROOT, "requirement-record.json"));
  const bundle = production ? readJson(resolve(privateRoot, "private-evaluator-bundle.json")) : null;
  const independence = production ? readJson(resolve(privateRoot, "independence.json")) : null;
  if (independence) {
    assert.ok(independence.source_classification.includes("current_canonical_public_contracts"));
    for (const value of ["historical_private_case_review_bytes_unavailable", "historical_private_case_review_bytes_not_reconstructed", "measured_agent_output", "measured_scoring_result"]) assert.ok(independence.excluded_source_classification.includes(value));
    assert.equal(independence.measured_output_used, false);
    assert.equal(independence.measured_result_used, false);
  }
  const hiddenAsset = bundle?.asset_inventory.find(({ role }) => role === "hidden_tests") ?? null;
  if (production) assert.ok(hiddenAsset, "private bundle requires a hidden evaluator asset");
  const freezePath = resolve(FIXTURE_ROOT, "scoring-input-freeze-manifest.json");
  const externalAuthorityAnchor = production ? readEvaluatorAuthorityAnchorFromFreeze({
    root: ROOT,
    freezeManifestPath: freezePath,
    freezeManifestSourceDigest: `sha256:${createHash("sha256").update(readFileSync(freezePath)).digest("hex")}`,
    referencePath: resolve(FIXTURE_ROOT, "evaluator-reference.json"),
    label: "mp-performance-investigation private regression authority",
  }) : null;
  const privateEvaluationRoot = production ? resolve(work, "sealed-authority") : null;
  const evaluationInputRoot = production ? resolve(work, "sealed-input") : null;
  if (production) { mkdirSync(privateEvaluationRoot); mkdirSync(evaluationInputRoot); writeFileSync(resolve(evaluationInputRoot, "private-regression-authority.json"), "{\"measured_execution\":false,\"scoring_ready\":false}\n"); }
  for (const [index, entry] of cases.cases.entries()) {
    const frozen = resolve(work, `${entry.case_id}-frozen`);
    const candidate = resolve(work, `${entry.case_id}-candidate`);
    cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
    cpSync(frozen, candidate, { recursive: true });
    const investigation = clone(cases.base_output);
    applyMutations(investigation, entry.mutations);
    if (entry.coverage_class !== "malformed") assertBenchmarkSchemaInstance(investigation, { schemaPath: resolve(FIXTURE_ROOT, "workspace/investigation.schema.json"), label: `${entry.case_id} investigation` });
    const investigationPath = resolve(work, `${entry.case_id}-investigation.json`);
    writeFileSync(investigationPath, `${JSON.stringify(investigation, null, 2)}\n`);
    const publicValidation = spawnSync(process.execPath, [resolve(FIXTURE_ROOT, "workspace/scripts/validate-investigation.mjs"), investigationPath], { encoding: "utf8" });
    assert.equal(publicValidation.status === 0, entry.expected_public_validation ?? (entry.coverage_class !== "malformed" && !["fresh-causal-evidence-removed", "fresh-evidence-line-drift"].includes(entry.case_id)), `${entry.case_id}: ${publicValidation.stderr || publicValidation.stdout}`);
    const investigationBytes = readFileSync(investigationPath);
    cpSync(investigationPath, resolve(candidate, "investigation.json"));
    if (entry.extra_candidate_path) writeFileSync(resolve(candidate, entry.extra_candidate_path), "unauthorized candidate change\n");
    if (entry.mode_change_candidate_path) {
      const modePath = resolve(candidate, entry.mode_change_candidate_path);
      assert.equal(lstatSync(modePath).mode & 0o111, 0, `${entry.case_id} source mode must begin non-executable`);
      chmodSync(modePath, 0o755);
      assert.notEqual(lstatSync(modePath).mode & 0o111, 0, `${entry.case_id} candidate mode must become executable`);
    }
    const lineage = {
      run_instance_id: `26726726-4264-4264-8264-${String(index + 1).padStart(12, "0")}`,
      case_id: `case-2672672642642642-${String(index + 101).padStart(16, "0")}`,
      attempt: "0001",
      final_output_digest: `sha256:${createHash("sha256").update(investigationBytes).digest("hex")}`,
      final_output_bytes: investigationBytes.length,
    };
    const normalizedResult = {
      normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, case_id: entry.case_id }),
      lineage,
      command_evidence: {
        capture_support: "supported",
        evidence_level: "complete",
        required_command_ids: ["investigation-contract-validation"],
        required_alternative_groups: [],
        references: [{ command_id: "investigation-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ case_id: entry.case_id, command: "investigation-contract-validation" }), bytes: 1 }],
        cwd_unverified_command_count: 0,
      },
    };
    const sealedExecution = production ? createSealedEvaluatorExecutionForTest({
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
      executionDirectoryName: `sealed-${entry.case_id}`,
      label: `mp-performance-investigation sealed ${entry.case_id} evaluator`,
    }) : null;
    const repositoryDiffArtifact = sealedExecution ? readJson(resolve(sealedExecution.originalWorkspaceAuthority.path, sealedExecution.originalWorkspaceAuthority.repositoryDiffPath)) : directRepositoryDiffArtifact(entry, lineage);
    if (entry.mode_change_candidate_path) {
      const modeDiff = repositoryDiffArtifact.diff_entries.find(({ path }) => path === entry.mode_change_candidate_path);
      assert.ok(modeDiff, `${entry.case_id} sealed original-workspace authority must retain the mode-only diff`);
      assert.notEqual(modeDiff.before?.mode, modeDiff.after?.mode, `${entry.case_id} sealed original-workspace authority must retain distinct before/after modes`);
    }
    const first = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    const second = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    assert.deepEqual(first, second, `${entry.case_id} evaluator determinism`);
    assertBenchmarkSchemaInstance(first, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} private fragment` });
    const expected = expectedSemanticProjection(entry, { normalizedResult, repositoryDiffArtifact });
    assert.deepEqual(evaluatorSemanticProjection(first), expected, `${entry.case_id} complete private evaluator projection`);
    if (index === 0) {
      const transplanted = clone(normalizedResult);
      transplanted.lineage.final_output_digest = `sha256:${"0".repeat(64)}`;
      await assert.rejects(
        evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult: transplanted, repositoryDiffArtifact }),
        /final output authority/u,
        "final-output authority transplant must fail closed",
      );
      for (const field of ["run_instance_id", "case_id", "attempt"]) {
        const wrongLineage = clone(repositoryDiffArtifact);
        wrongLineage[field] = `${wrongLineage[field]}-transplanted`;
        await assert.rejects(evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: wrongLineage }), /repository diff lineage authority/u, `performance repository diff ${field} transplant must fail closed`);
      }
      for (const [label, mutate] of [
        ["digest", (artifact) => { artifact.artifact_digest = `sha256:${"0".repeat(64)}`; }],
        ["bytes", (artifact) => { artifact.artifact_bytes += 1; }],
      ]) {
        const invalidDiff = clone(repositoryDiffArtifact);
        mutate(invalidDiff);
        await assert.rejects(evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: invalidDiff }), /repository diff byte authority/u, `performance repository diff ${label} transplant must fail closed`);
      }
      for (const [label, diffEntries] of [
        ["deletion", [{ path: "investigation.json", change_type: "deletion", before: { file_type: "file" }, after: null }]],
        ["modification", [{ path: "investigation.json", change_type: "modification", before: { file_type: "file" }, after: { file_type: "file" } }]],
        ["symlink", [{ path: "investigation.json", change_type: "addition", before: null, after: { file_type: "symlink" } }]],
      ]) {
        const invalidScope = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact: repositoryDiffArtifactForEntries(diffEntries, lineage) });
        assert.equal(invalidScope.classification, "over_processing", `performance repository diff ${label} must fail the closed scope`);
        assert.deepEqual(invalidScope.scope_deviations.map(({ finding_id }) => finding_id), ["fresh-scope-deviation"], `performance repository diff ${label} must emit the scope finding`);
      }
      const invalidCommand = clone(normalizedResult);
      invalidCommand.command_evidence.references[0] = { ...invalidCommand.command_evidence.references[0], command_id: "unrelated-command", match_state: "unmatched", outcome: "failed", exit_code: 1 };
      const invalidEvidence = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult: invalidCommand, repositoryDiffArtifact });
      assert.equal(invalidEvidence.verification_correctness.state, "fail", "invalid command evidence must not pass verification");
      assert.equal(invalidEvidence.classification, "invalid_evidence", "invalid command evidence must prevent a correct classification");
    }

    if (sealedExecution) {
      const sealed = executeSealedEvaluatorForTest({ execution: sealedExecution, externalAuthorityAnchor, repositoryRoot: ROOT, normalized: normalizedResult, label: `mp-performance-investigation sealed ${entry.case_id} evaluator` });
      assertBenchmarkSchemaInstance(sealed.firstFragment, { schemaPath: resolve(ROOT, "benchmarks/schemas/private-evaluator-fragment.schema.json"), label: `${entry.case_id} production-safe private fragment` });
      assert.deepEqual(evaluatorSemanticProjection(sealed.firstFragment), expected, `${entry.case_id} complete production-safe evaluator projection`);
      assert.deepEqual(evaluatorSemanticProjection(sealed.firstFragment), evaluatorSemanticProjection(first), `${entry.case_id} direct/production-safe evaluator agreement`);
    }
  }

  if (!production) return { cases: cases.cases.length, directPass: cases.cases.length, productionSafePass: 0, mutationBehaviorPass: 0, validatorParityPass: 0, falsePositiveControls: cases.cases.filter(({ control }) => control === "equivalent_solution").length };

  const admission = readJson(resolve(FIXTURE_ROOT, "final-admission-record.json"));
  const evidenceMap = readJson(resolve(FIXTURE_ROOT, "evidence-map.json"));
  const inputRecord = readJson(resolve(FIXTURE_ROOT, "input-manifest.json")).fixtures[FIXTURE_ID];
  const mutationAsset = readJson(resolve(privateRoot, "evidence-removal-mutations.json"));
  const equivalenceAsset = readJson(resolve(privateRoot, "equivalent-solutions.json"));
  assert.doesNotThrow(() => validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset }));
  assert.doesNotThrow(() => validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset }));
  assert.doesNotThrow(() => validateMatchedEquivalenceIds({ requirementRecord: requirement, equivalenceAsset, matchedEquivalenceClassIds: equivalenceAsset.rules.map(({ equivalence_class_id }) => equivalence_class_id) }));

  const referenceInvestigationBytes = Buffer.from(`${JSON.stringify(cases.base_output, null, 2)}\n`);
  for (const [index, mutation] of mutationAsset.mutations.entries()) {
    const frozen = resolve(work, `${mutation.mutation_id}-frozen`);
    const candidate = resolve(work, `${mutation.mutation_id}-candidate`);
    cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
    for (const path of mutation.remove_paths) {
      if (!path.startsWith("workspace/")) continue;
      const absolute = resolve(frozen, path.slice("workspace/".length));
      assert.ok(existsSync(absolute), `${mutation.mutation_id} removal source must exist: ${path}`);
      rmSync(absolute);
    }
    cpSync(frozen, candidate, { recursive: true });
    writeFileSync(resolve(candidate, "investigation.json"), referenceInvestigationBytes);
    const lineage = {
      run_instance_id: `26726726-4264-4264-8264-${String(index + 201).padStart(12, "0")}`,
      case_id: `case-2672672642642642-${String(index + 201).padStart(16, "0")}`,
      attempt: "0001",
      final_output_digest: `sha256:${createHash("sha256").update(referenceInvestigationBytes).digest("hex")}`,
      final_output_bytes: referenceInvestigationBytes.length,
    };
    const normalizedResult = {
      normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, mutation_id: mutation.mutation_id }),
      lineage,
      command_evidence: {
        references: [{ command_id: "investigation-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ mutation_id: mutation.mutation_id }), bytes: 1 }],
      },
    };
    const repositoryDiffArtifact = directRepositoryDiffArtifact({}, lineage);
    const result = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    const target = result.requirement_results.find(({ requirement_id }) => requirement_id === mutation.requirement_id);
    assert.equal(target?.outcome, "fail", `${mutation.mutation_id} must make ${mutation.requirement_id} unrecoverable`);
    assert.notEqual(result.classification, "correct_narrow_execution", `${mutation.mutation_id} must not preserve the reference classification`);
  }

  const invalidInvestigationCases = [
    ["too-few-hypotheses", (value) => { value.hypotheses = [value.hypotheses[0]]; }, "cache-key-causal-hypothesis"],
    ["duplicate-hypothesis-id", (value) => { value.hypotheses[1].id = value.hypotheses[0].id; }, "cache-key-causal-hypothesis"],
    ["duplicate-hypothesis-mechanism", (value) => { value.hypotheses[1].mechanism = value.hypotheses[0].mechanism; }, "cache-key-causal-hypothesis"],
    ["empty-evidence", (value) => { value.hypotheses[0].evidence = []; }, "cache-key-causal-hypothesis"],
    ["blank-evidence-path", (value) => { value.hypotheses[0].evidence[0].path = " "; }, "cache-key-causal-hypothesis"],
    ["blank-source-excerpt", (value) => { value.hypotheses[0].evidence[0].source_excerpt = " "; }, "cache-key-causal-hypothesis"],
    ["invalid-evidence-line", (value) => { value.hypotheses[0].evidence[0].line = 0; }, "cache-key-causal-hypothesis"],
    ["cross-line-source-excerpt", (value) => {
      value.hypotheses[0].evidence[0].line = 3;
      value.hypotheses[0].evidence[0].source_excerpt = "2026-08-16T09:00:00Z,2026.08.15-3,201.7,118,0.002,0.91,18,42,5";
    }, "cache-key-causal-hypothesis"],
    ["padded-source-excerpt", (value) => { value.hypotheses[0].evidence[0].source_excerpt = ` ${value.hypotheses[0].evidence[0].source_excerpt} `; }, "cache-key-causal-hypothesis"],
    ["nonallowlisted-existing-evidence-path", (value) => {
      value.hypotheses[0].evidence[0].path = "investigation.schema.json";
      value.hypotheses[0].evidence[0].line = 1;
      value.hypotheses[0].evidence[0].source_excerpt = "{";
    }, "cache-key-causal-hypothesis"],
    ["unknown-leading-hypothesis", (value) => { value.overall_assessment.leading_hypothesis_id = "missing"; }, "causal-confidence-calibration"],
    ["unknown-next-check-target", (value) => { value.next_check.hypothesis_id = "missing"; }, "bounded-next-check"],
    ["free-text-overall-field", (value) => { value.overall_assessment.summary = "Scheduler starvation drove the regression."; }, "cache-key-causal-hypothesis"],
    ["unsafe-scope", (value) => { value.scope.production_action_authorized = true; }, "cache-key-causal-hypothesis"],
  ];
  for (const [index, [name, mutate, failedRequirementId]] of invalidInvestigationCases.entries()) {
    const frozen = resolve(work, `private-validator-${name}-frozen`);
    const candidate = resolve(work, `private-validator-${name}-candidate`);
    cpSync(resolve(FIXTURE_ROOT, "workspace"), frozen, { recursive: true });
    cpSync(frozen, candidate, { recursive: true });
    const investigation = clone(cases.base_output);
    mutate(investigation);
    const bytes = Buffer.from(`${JSON.stringify(investigation, null, 2)}\n`);
    writeFileSync(resolve(candidate, "investigation.json"), bytes);
    const lineage = {
      run_instance_id: `26726726-4264-4264-8264-${String(index + 301).padStart(12, "0")}`,
      case_id: `case-2672672642642642-${String(index + 301).padStart(16, "0")}`,
      attempt: "0001",
      final_output_digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      final_output_bytes: bytes.length,
    };
    const normalizedResult = {
      normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, private_validator_case: name }),
      lineage,
      command_evidence: {
        references: [{ command_id: "investigation-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ private_validator_case: name }), bytes: 1 }],
      },
    };
    const repositoryDiffArtifact = directRepositoryDiffArtifact({}, lineage);
    const result = await evaluator.evaluateCandidateSafe({ repositoryRoot: ROOT, frozenWorkspace: frozen, candidateWorkspace: candidate, normalizedResult, repositoryDiffArtifact });
    assert.equal(result.requirement_results.find(({ requirement_id }) => requirement_id === failedRequirementId)?.outcome, "fail", `${name} private evaluator rejection`);
    assert.notEqual(result.classification, "correct_narrow_execution", `${name} private evaluator classification`);
  }

  const prefixedFrozen = resolve(work, "private-validator-workspace-prefix-frozen");
  const prefixedCandidate = resolve(work, "private-validator-workspace-prefix-candidate");
  cpSync(resolve(FIXTURE_ROOT, "workspace"), prefixedFrozen, { recursive: true });
  cpSync(prefixedFrozen, prefixedCandidate, { recursive: true });
  const prefixedInvestigation = clone(cases.base_output);
  prefixedInvestigation.hypotheses[0].evidence[0].path = "workspace/src/cache-key.mjs";
  const prefixedBytes = Buffer.from(`${JSON.stringify(prefixedInvestigation, null, 2)}\n`);
  writeFileSync(resolve(prefixedCandidate, "investigation.json"), prefixedBytes);
  const prefixedLineage = {
    run_instance_id: "26726726-4264-4264-8264-000000000399",
    case_id: "case-2672672642642642-0000000000000399",
    attempt: "0001",
    final_output_digest: `sha256:${createHash("sha256").update(prefixedBytes).digest("hex")}`,
    final_output_bytes: prefixedBytes.length,
  };
  const prefixedNormalizedResult = {
    normalized_result_digest: canonicalDigest({ fixture_id: FIXTURE_ID, private_validator_case: "workspace-prefix" }),
    lineage: prefixedLineage,
    command_evidence: {
      references: [{ command_id: "investigation-contract-validation", match_state: "matched", outcome: "succeeded", exit_code: 0, digest: canonicalDigest({ private_validator_case: "workspace-prefix" }), bytes: 1 }],
    },
  };
  const prefixedResult = await evaluator.evaluateCandidateSafe({
    repositoryRoot: ROOT,
    frozenWorkspace: prefixedFrozen,
    candidateWorkspace: prefixedCandidate,
    normalizedResult: prefixedNormalizedResult,
    repositoryDiffArtifact: directRepositoryDiffArtifact({}, prefixedLineage),
  });
  assert.ok(prefixedResult.requirement_results.every(({ outcome }) => outcome === "pass"), "workspace-prefixed evidence must preserve every private requirement");
  assert.equal(prefixedResult.classification, "correct_narrow_execution", "workspace-prefixed evidence private evaluator classification");

  const missingMutation = clone(mutationAsset);
  missingMutation.mutations.pop();
  expectFailure(() => validateMutationAuthority({ requirementRecord: requirement, admissionRecord: admission, evidenceMapArtifact: evidenceMap, inputManifestRecord: inputRecord, mutationAsset: missingMutation }), /inventory/u, "evidence-removal violation");
  const undeclaredEquivalence = clone(equivalenceAsset);
  undeclaredEquivalence.rules[0].equivalence_class_id = "undeclared-equivalence";
  expectFailure(() => validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset: undeclaredEquivalence }), /inventory|transplanted/u, "undeclared equivalence");
  const transplantedEquivalence = clone(equivalenceAsset);
  transplantedEquivalence.fixture_id = "foreign-fixture";
  expectFailure(() => {
    if (transplantedEquivalence.fixture_id !== requirement.fixture_id) throw new Error("private equivalence fixture transplant");
    validateEquivalenceAuthority({ requirementRecord: requirement, equivalenceAsset: transplantedEquivalence });
  }, /transplant/u, "cross-fixture transplant");
  return { cases: cases.cases.length, directPass: cases.cases.length, productionSafePass: cases.cases.length, mutationBehaviorPass: mutationAsset.mutations.length, validatorParityPass: invalidInvestigationCases.length, falsePositiveControls: cases.cases.filter(({ control }) => control === "equivalent_solution").length };
}

validateFrozenDesign();
validateHistoricalAuthority();
validateMpPerformanceInvestigationInputClosure({ root: ROOT });
validateVisibleScenario();
validateWorkspaceValidatorParity();
validatePublicNegativeCoverage();

const productionExists = readJson(resolve(FIXTURE_ROOT, "evaluator-reference.json")).schema_version === "1.0.0";
const publicContractOnly = process.argv.includes("--public-contract-only");
let effectiveAdmissionStatus = "admission_pending";
if (productionExists && !publicContractOnly) {
  const production = validateMpPerformanceInvestigationProductionAuthority({ root: ROOT });
  assert.equal(production.scoringReady, false);
  validateProductionNegativeCoverage();
  const config = readJson(resolve(ROOT, "benchmarks/adaptive-portfolio.config.json"));
  config._configPath = resolve(ROOT, "benchmarks/adaptive-portfolio.config.json");
  config._protocolPath = resolve(ROOT, config.protocol_path);
  const fixture = config.fixtures.find(({ id }) => id === FIXTURE_ID);
  const admission = resolvePortfolioExecutionAdmission({ root: ROOT, fixture });
  const repositoryRevision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const repositoryDecision = resolveRepositoryAdmissionDecision({ root: ROOT, repositoryRevision, fixtureId: FIXTURE_ID });
  assert.ok(repositoryDecision, "performance investigation admission decision overlay must exist");
  assert.equal(repositoryDecision.decision.decision_status, "admitted");
  assert.equal(admission.execution_eligible, false);
  assert.equal(admission.effective_admission_status, "review_evidence_missing");
  effectiveAdmissionStatus = admission.effective_admission_status;
  assert.equal(resolvePortfolioExecutionFixtures({ root: ROOT, config }).some(({ id }) => id === FIXTURE_ID), false);
}

const requested = privateArgs(process.argv.slice(2));
const sourceSummary = requested ? validateFreshPrivateSourceContract(requested, { sourceOnly: publicContractOnly }) : null;
const privateSummary = requested ? await validatePrivateCases({ ...requested, productionExists: productionExists && !publicContractOnly }) : null;
console.log(JSON.stringify({ fixture_id: FIXTURE_ID, input_closure: "pass", frozen_design: "pass", visible_scenario: "pass", negative_regressions: "pass", historical_admitted_authority: "pass", production_validation: publicContractOnly ? "not_requested" : productionExists ? "pass" : "generation_pending", actual_private_validation: requested ? publicContractOnly ? "source_behavior_pass" : "pass" : "not_supplied", ...(sourceSummary ? { fresh_source_summary: sourceSummary } : {}), ...(privateSummary ? { private_summary: privateSummary } : {}), admission: effectiveAdmissionStatus, scoring_ready: false }));
