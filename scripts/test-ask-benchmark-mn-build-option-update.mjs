#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import {
  assertAnswerNeutralPublicValue,
  assertPrivateRootOutsideRepository,
  evaluateEvidenceRemoval,
  FIXTURE_ROOT_RELATIVE,
  validateMnBuildOptionUpdatePrivateFixture,
  validateMnBuildOptionUpdatePublicFixture,
  validateFairPaths,
  validateEquivalenceAuthority,
  validateMatchedEquivalenceIds,
  validateMutationAuthority,
  validatePendingIndependentReview,
} from "./ask-benchmark-mn-build-option-update.mjs";
import {
  computeFinalAdmissionRecordDigest,
  computeRequirementRecordDigest,
  computeScoringInputFreezeManifestDigest,
  validateScoringInputBindings,
} from "./ask-benchmark-scoring-contract.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import {
  buildCodexCommandEvidence,
  buildUnavailableCommandEvidence,
  projectVerifiedCommandEvidence,
  renderCommandEvent,
} from "./ask-benchmark-command-evidence.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = resolve(root, FIXTURE_ROOT_RELATIVE);
const REQUIRED_COMMAND_IDS_FOR_TEST = ["build-config-focused-test", "build-config-semantic-validator"];
const work = mkdtempSync(resolve(tmpdir(), "ask-mn-build-option-update-"));
const privateRootArgumentIndex = process.argv.indexOf("--private-root");
const privateRoot = privateRootArgumentIndex === -1 ? null : resolve(process.argv[privateRootArgumentIndex + 1]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function expectFailure(fn, pattern, label) {
  assert.throws(fn, pattern, label);
}

function boundaryRoots() {
  const roots = {};
  for (const [key, marker] of [
    ["materializedPath", "materialization-manifest.json"],
    ["selectionState", "selection-state.json"],
    ["runDir", "run-identity.json"],
    ["normalizedResultsPath", "normalized-results-root.json"],
    ["publicArtifactRoot", null],
  ]) {
    roots[key] = resolve(work, key);
    mkdirSync(roots[key]);
    if (marker) writeJson(resolve(roots[key], marker), { fixture_id: "synthetic-boundary" });
  }
  return roots;
}

function syntheticScoringInput() {
  const catalog = readJson(resolve(root, "benchmarks/portfolio-catalog.json"));
  const policyManifest = readJson(resolve(root, "benchmarks/portfolio-policy-manifest.json"));
  const scoringPolicy = readJson(resolve(root, "benchmarks/portfolio-scoring-policy.json"));
  const admissionRecord = readJson(resolve(fixtureRoot, "final-admission-record.json"));
  const requirementRecord = readJson(resolve(fixtureRoot, "requirement-record.json"));
  const outputContract = readJson(resolve(fixtureRoot, "output-contract.json"));
  const evaluatorReference = readJson(resolve(fixtureRoot, "evaluator-reference.json"));
  const freezeManifest = readJson(resolve(fixtureRoot, "scoring-input-freeze-manifest.json"));
  const freezeManifestSourceDigest = `sha256:${"a".repeat(64)}`;
  const normalizedResult = {
    lineage: {
      fixture_id: "mn-build-option-update",
      fixture_input_digest: evaluatorReference.fixture_input_digest,
      suite: "mechanism_negative",
      task_class: "configuration",
      plan_digest: `sha256:${"b".repeat(64)}`,
    },
  };
  const evaluatorResult = {
    scoring_input_freeze_manifest_source_digest: freezeManifestSourceDigest,
    scoring_input_freeze_manifest_digest: freezeManifest.manifest_digest,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    admission_record_digest: admissionRecord.admission_digest,
    requirement_record_digest: requirementRecord.requirement_record_digest,
    requirement_set_digest: requirementRecord.requirement_set_digest,
    output_contract_digest: outputContract.output_contract_digest,
    evaluator_public_reference_digest: evaluatorReference.public_metadata_digest,
    plan_digest: normalizedResult.lineage.plan_digest,
    evaluation_status: "completed",
    requirement_results: requirementRecord.requirements.map((requirement) => ({
      requirement_id: requirement.requirement_id,
      outcome: "pass",
      earned_points: requirement.max_points,
      matched_equivalence_class_ids: [requirement.equivalence_class_ids[0]],
      finding_ids: [],
      evidence_references: [{ kind: "normalized_result", digest: `sha256:${"c".repeat(64)}`, bytes: 1 }],
    })),
    findings: [],
    false_positives: [],
    scope_deviations: [],
  };
  return { freezeManifest, freezeManifestSourceDigest, catalog, policyManifest, scoringPolicy, admissionRecord, requirementRecord, outputContract, evaluatorReference, normalizedResult, evaluatorResult };
}

function admittedSyntheticScoringInput(source) {
  const scoring = structuredClone(source);
  const jsonDigest = (value) => `sha256:${createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex")}`;
  scoring.admissionRecord.admission_status = "admitted";
  scoring.admissionRecord.admission_digest = computeFinalAdmissionRecordDigest(scoring.admissionRecord);
  scoring.requirementRecord.admission_record_digest = scoring.admissionRecord.admission_digest;
  scoring.requirementRecord.requirement_record_digest = computeRequirementRecordDigest(scoring.requirementRecord);
  scoring.freezeManifest.admission_record.raw_byte_digest = jsonDigest(scoring.admissionRecord);
  scoring.freezeManifest.admission_record.semantic_digest = scoring.admissionRecord.admission_digest;
  scoring.freezeManifest.requirement_record.raw_byte_digest = jsonDigest(scoring.requirementRecord);
  scoring.freezeManifest.requirement_record.record_digest = scoring.requirementRecord.requirement_record_digest;
  scoring.freezeManifest.requirement_record.set_digest = scoring.requirementRecord.requirement_set_digest;
  scoring.freezeManifest.manifest_digest = computeScoringInputFreezeManifestDigest(scoring.freezeManifest);
  scoring.evaluatorResult.scoring_input_freeze_manifest_digest = scoring.freezeManifest.manifest_digest;
  scoring.evaluatorResult.admission_record_digest = scoring.admissionRecord.admission_digest;
  scoring.evaluatorResult.requirement_record_digest = scoring.requirementRecord.requirement_record_digest;
  return scoring;
}

function privateSemanticAuthority(privateRoot) {
  const manifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const asset = (role) => readJson(resolve(privateRoot, manifest.asset_inventory.find((entry) => entry.role === role).path));
  return {
    requirementRecord: readJson(resolve(fixtureRoot, "requirement-record.json")),
    admissionRecord: readJson(resolve(fixtureRoot, "final-admission-record.json")),
    evidenceMapArtifact: readJson(resolve(fixtureRoot, "evidence-map.json")),
    inputManifestRecord: readJson(resolve(fixtureRoot, "input-manifest.json")).fixtures["mn-build-option-update"],
    mutationAsset: asset("evidence_removal_mutations"),
    equivalenceAsset: asset("equivalent_solution_rules"),
  };
}

function closeMutation(mutation) {
  const closure = structuredClone(mutation);
  delete closure.mutation_digest;
  mutation.mutation_digest = canonicalDigest(closure);
}

function closeEquivalenceRule(rule) {
  const closure = structuredClone(rule);
  delete closure.rule_digest;
  rule.rule_digest = canonicalDigest(closure);
}

function runPrivateSemanticNegativeChecks(privateRoot) {
  const authority = privateSemanticAuthority(privateRoot);
  const mutationFailure = (label, mutate, pattern) => {
    const changed = structuredClone(authority);
    mutate(changed);
    expectFailure(() => validateMutationAuthority(changed), pattern, label);
  };
  mutationFailure("second mutation omission", ({ mutationAsset }) => mutationAsset.mutations.splice(1, 1), /inventory does not exactly match/u);
  mutationFailure("third mutation omission", ({ mutationAsset }) => mutationAsset.mutations.splice(2, 1), /inventory does not exactly match/u);
  mutationFailure("duplicate mutation", ({ mutationAsset }) => mutationAsset.mutations.push(structuredClone(mutationAsset.mutations[0])), /duplicate ID/u);
  mutationFailure("extra mutation", ({ mutationAsset }) => {
    const extra = structuredClone(mutationAsset.mutations[0]);
    extra.mutation_id = "extra-mutation";
    closeMutation(extra);
    mutationAsset.mutations.push(extra);
  }, /inventory does not exactly match/u);
  mutationFailure("mutation ID transplant", ({ mutationAsset }) => {
    [mutationAsset.mutations[0].mutation_id, mutationAsset.mutations[1].mutation_id] = [mutationAsset.mutations[1].mutation_id, mutationAsset.mutations[0].mutation_id];
    closeMutation(mutationAsset.mutations[0]);
    closeMutation(mutationAsset.mutations[1]);
  }, /transplanted across requirements/u);
  mutationFailure("target evidence map transplant", ({ mutationAsset }) => {
    mutationAsset.mutations[0].target_evidence_map_id = mutationAsset.mutations[1].target_evidence_map_id;
    closeMutation(mutationAsset.mutations[0]);
  }, /another requirement's evidence map/u);
  mutationFailure("remove path drift", ({ mutationAsset }) => {
    mutationAsset.mutations[0].remove_paths[0] = "workspace/package.json";
    closeMutation(mutationAsset.mutations[0]);
  }, /remove path inventory/u);
  mutationFailure("mutation digest drift", ({ mutationAsset }) => { mutationAsset.mutations[0].mutation_digest = `sha256:${"0".repeat(64)}`; }, /digest mismatch/u);

  const equivalenceFailure = (label, mutate, pattern) => {
    const changed = structuredClone(authority);
    mutate(changed);
    expectFailure(() => validateEquivalenceAuthority(changed), pattern, label);
  };
  equivalenceFailure("equivalence rule omission", ({ equivalenceAsset }) => equivalenceAsset.rules.splice(1, 1), /inventory does not exactly match/u);
  equivalenceFailure("duplicate equivalence rule", ({ equivalenceAsset }) => equivalenceAsset.rules.push(structuredClone(equivalenceAsset.rules[0])), /duplicate ID/u);
  equivalenceFailure("extra equivalence rule", ({ equivalenceAsset }) => {
    const extra = structuredClone(equivalenceAsset.rules[0]);
    extra.equivalence_class_id = "extra-equivalence";
    closeEquivalenceRule(extra);
    equivalenceAsset.rules.push(extra);
  }, /inventory does not exactly match/u);
  equivalenceFailure("unknown equivalence rule ID", ({ equivalenceAsset }) => {
    equivalenceAsset.rules[0].equivalence_class_id = "unknown-equivalence";
    closeEquivalenceRule(equivalenceAsset.rules[0]);
  }, /inventory does not exactly match/u);
  equivalenceFailure("equivalence requirement transplant", ({ equivalenceAsset }) => {
    equivalenceAsset.rules[0].requirement_id = equivalenceAsset.rules[1].requirement_id;
    closeEquivalenceRule(equivalenceAsset.rules[0]);
  }, /transplanted across requirements/u);
  equivalenceFailure("equivalence rule digest drift", ({ equivalenceAsset }) => { equivalenceAsset.rules[0].rule_digest = `sha256:${"0".repeat(64)}`; }, /digest mismatch/u);
  expectFailure(() => validateMatchedEquivalenceIds({
    requirementRecord: authority.requirementRecord,
    equivalenceAsset: authority.equivalenceAsset,
    matchedEquivalenceClassIds: ["undeclared-equivalence"],
  }), /undeclared equivalence ID/u, "hidden evaluator undeclared equivalence ID");
}

async function runPrivateCandidateChecks(privateRoot) {
  const manifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
  const assetPath = (role) => resolve(privateRoot, manifest.asset_inventory.find((entry) => entry.role === role).path);
  const referenceContract = readJson(assetPath("oracle"));
  const automatedEvaluator = assetPath("hidden_tests");
  const evaluator = await import(pathToFileURL(automatedEvaluator));
  const requirementRecord = readJson(resolve(fixtureRoot, "requirement-record.json"));
  const commandContract = readJson(resolve(fixtureRoot, "verification-command-contract.json"));
  const baseWorkspace = resolve(fixtureRoot, "workspace");
  const candidate = (name) => {
    const path = resolve(work, name);
    cpSync(baseWorkspace, path, { recursive: true });
    return path;
  };
  const writeCandidateConfig = (path, sourceMap) => {
    const configPath = resolve(path, "build.config.json");
    const config = readJson(configPath);
    config.profiles.release.sourceMap = sourceMap;
    writeJson(configPath, config);
  };
  const evidenceIdentity = (run = "12345678-1234-4123-8123-123456789abc", attempt = "0001") => ({
    run_instance_id: run, case_id: "case-1111111111111111-2222222222222222", attempt, adapter: "codex", condition: "plain",
    fixture_id: "mn-build-option-update", repetition: 1, fixture_input_digest: commandContract.fixture_input_digest,
    verification_command_contract_digest: commandContract.contract_digest, runtime_identity_digest: `sha256:${"b".repeat(64)}`, effective_command_digest: `sha256:${"c".repeat(64)}`,
  });
  const stream = (records) => Buffer.from(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  const pair = (command, index, status = "completed", exitCode = 0) => [
    { type: "item.started", item: { id: `command-${index}`, type: "command_execution", command, status: "in_progress" } },
    { type: "item.completed", item: { id: `command-${index}`, type: "command_execution", command, status, exit_code: exitCode, aggregated_output: "synthetic\n" } },
  ];
  const normalized = ({ outcomes = ["completed", "completed"], unavailable = false, identity = evidenceIdentity() } = {}) => {
    const commandEvidence = unavailable
      ? buildUnavailableCommandEvidence({ identity, support: "supported", probe: "runtime_unavailable", reason: "runtime_unavailable" })
      : buildCodexCommandEvidence({
        identity, contract: commandContract,
        stream: stream([
          ...(outcomes.length === 0 ? [] : commandContract.commands.flatMap((command, index) => pair(renderCommandEvent(command), index, outcomes[index], outcomes[index] === "completed" ? 0 : outcomes[index] === "declined" ? null : 2))),
          { type: "turn.completed" },
        ]),
      });
    const base = {
      lineage: { run_instance_id: identity.run_instance_id, case_id: identity.case_id, attempt: identity.attempt, fixture_id: identity.fixture_id, fixture_input_digest: identity.fixture_input_digest },
      command_evidence: projectVerifiedCommandEvidence({ manifest: commandEvidence, contract: commandContract }),
    };
    const digest = canonicalDigest(base);
    return { ...base, normalized_result_id: `normalized-${digest.slice(7, 39)}`, normalized_result_digest: digest, _command_evidence: commandEvidence };
  };
  const noEvidence = normalized({ outcomes: [] });
  const cwdUnverified = structuredClone(normalized());
  cwdUnverified.command_evidence.references = cwdUnverified.command_evidence.references.map((entry) => ({ ...entry, command_id: null, match_state: "cwd_unverified" }));
  cwdUnverified.command_evidence.command_summaries = [];
  cwdUnverified.command_evidence.attempted_command_ids = [];
  cwdUnverified.command_evidence.succeeded_command_ids = [];
  cwdUnverified.command_evidence.unavailable_command_ids = [...REQUIRED_COMMAND_IDS_FOR_TEST];
  cwdUnverified.command_evidence.cwd_unverified_command_count = cwdUnverified.command_evidence.references.length;
  const evaluate = (workspace, evidence = normalized(), options = {}) => evaluator.evaluateCandidateSafe({ repositoryRoot: root, frozenWorkspace: baseWorkspace, candidateWorkspace: workspace, normalizedResult: evidence, skipFullNormalizedValidation: options.full !== true });
  const assertResult = (result, outcomes, classification) => {
    assert.deepEqual(result.requirement_results.map(({ outcome }) => outcome), outcomes);
    assert.deepEqual(result.requirement_results.map(({ earned_points }, index) => earned_points), outcomes.map((outcome, index) => outcome === "pass" ? requirementRecord.requirements[index].max_points : 0));
    assert.equal(result.requirement_results.every(({ evidence_references }) => evidence_references.length > 0), true);
    assert.equal(result.requirement_results.every(({ scope_deviation_references, verification_evidence_references }) => Array.isArray(scope_deviation_references) && Array.isArray(verification_evidence_references)), true);
    assert.equal(result.classification, classification);
    assert.equal(result.scoring_ready, false);
  };

  const contract = referenceContract.observable_contract.release_source_map;
  const solution = (name, sourceMap = { scripts: contract.scripts, styles: contract.styles }) => { const path = candidate(name); writeCandidateConfig(path, sourceMap); return path; };
  const cases = [];
  cases.push(["correct narrow candidate plus required command success", await evaluate(solution("case-01")), ["pass", "pass", "pass"], "correct_narrow_execution"]);
  cases.push(["correct candidate without verification evidence", await evaluate(solution("case-02"), noEvidence), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate with declined command", await evaluate(solution("case-03"), normalized({ outcomes: ["declined", "declined"] })), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate with failed command", await evaluate(solution("case-04"), normalized({ outcomes: ["failed", "failed"] })), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate with unavailable command evidence", await evaluate(solution("case-05"), normalized({ unavailable: true })), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["correct candidate with cwd-unverified evidence", await evaluate(solution("case-06"), cwdUnverified), ["pass", "pass", "fail"], "under_processing"]);
  cases.push(["configuration unchanged", await evaluate(candidate("case-07")), ["fail", "fail", "pass"], "under_processing"]);
  cases.push(["configuration incorrect", await evaluate(solution("case-08", { scripts: "invalid", styles: true })), ["fail", "pass", "pass"], "under_processing"]);
  const modified = solution("case-09"); writeFileSync(resolve(modified, "package.json"), `${readFileSync(resolve(modified, "package.json"), "utf8")} `); cases.push(["unrelated modification", await evaluate(modified), ["pass", "fail", "pass"], "over_processing"]);
  const added = solution("case-10"); writeFileSync(resolve(added, "unrelated.txt"), "x\n"); cases.push(["unrelated addition", await evaluate(added), ["pass", "fail", "pass"], "over_processing"]);
  const deleted = solution("case-11"); rmSync(resolve(deleted, "docs/build-options.md")); cases.push(["unrelated deletion", await evaluate(deleted), ["pass", "fail", "pass"], "over_processing"]);
  const protectedChange = solution("case-12"); writeFileSync(resolve(protectedChange, "test/build-config.test.mjs"), `${readFileSync(resolve(protectedChange, "test/build-config.test.mjs"), "utf8")}\n`); cases.push(["test authority modification", await evaluate(protectedChange), ["pass", "fail", "pass"], "over_processing"]);
  cases.push(["property-order-only equivalent solution", await evaluate(solution("case-13", { styles: contract.styles, scripts: contract.scripts })), ["pass", "pass", "pass"], "correct_narrow_execution"]);
  const crossRun = normalized({ identity: evidenceIdentity("22345678-1234-4123-8123-123456789abc") });
  const invalidRun = await evaluate(solution("case-14"), crossRun, { full: true }); cases.push(["command evidence cross-run transplant", invalidRun, ["fail", "fail", "fail"], "invalid_evidence"]);
  const crossAttempt = normalized({ identity: evidenceIdentity(undefined, "0002") });
  const invalidAttempt = await evaluate(solution("case-15"), crossAttempt, { full: true }); cases.push(["command evidence cross-attempt transplant", invalidAttempt, ["fail", "fail", "fail"], "invalid_evidence"]);
  const drift = structuredClone(normalized()); drift.normalized_result_digest = `sha256:${"0".repeat(64)}`; cases.push(["normalized result digest drift", await evaluate(solution("case-16"), drift, { full: true }), ["fail", "fail", "fail"], "invalid_evidence"]);
  const frozenDrift = candidate("frozen-drift"); writeFileSync(resolve(frozenDrift, "package.json"), "{}\n"); cases.push(["frozen workspace drift", await evaluator.evaluateCandidateSafe({ repositoryRoot: root, frozenWorkspace: frozenDrift, candidateWorkspace: solution("case-17"), normalizedResult: normalized(), skipFullNormalizedValidation: true }), ["fail", "fail", "fail"], "invalid_evidence"]);
  const spoofedScope = solution("case-18"); writeFileSync(resolve(spoofedScope, "unrelated.txt"), "x\n"); writeJson(resolve(work, "caller-changed-files.json"), ["build.config.json"]); cases.push(["caller changed-file JSON spoof", await evaluate(spoofedScope), ["pass", "fail", "pass"], "over_processing"]);
  writeJson(resolve(work, "caller-verification.json"), { test: "passed", validation: "passed" }); cases.push(["caller verification JSON spoof", await evaluate(solution("case-19"), noEvidence), ["pass", "pass", "fail"], "under_processing"]);
  const rerunOnly = await evaluate(solution("case-20"), noEvidence); assert.equal(rerunOnly.evaluator_rerun.results.every(({ outcome }) => outcome === "succeeded"), true); cases.push(["evaluator rerun success without agent evidence", rerunOnly, ["pass", "pass", "fail"], "under_processing"]);
  for (const [label, result, outcomes, classification] of cases) assertResult(result, outcomes, classification, label);
  assert.equal(cases.length, 20);

  const specialNode = solution("special-node");
  symlinkSync(resolve(specialNode, "build.config.json"), resolve(specialNode, "linked-build-config.json"));
  assertResult(await evaluate(specialNode), ["fail", "fail", "fail"], "invalid_evidence");
}

try {
  const summary = validateMnBuildOptionUpdatePublicFixture({ root });
  assert.equal(summary.reviewStatus, "pending_independent_review");
  assert.equal(summary.scoringReady, false);
  assert.equal(summary.applicableGateCount, 12);
  assert.equal(summary.nonApplicableGateCount, 3);

  expectFailure(() => assertAnswerNeutralPublicValue({ hidden_answer: "x" }), /answer-bearing field/u, "public answer-bearing fields must fail closed");
  expectFailure(() => assertPrivateRootOutsideRepository(root, fixtureRoot), /outside the repository/u, "repository-local private bundles must be rejected");
  expectFailure(() => validatePendingIndependentReview({ reviewer_status: "approved", author_self_approval: true, gates: [] }, { admission_status: "admitted" }), /self-approve/u, "self-approved independent review must fail closed");
  expectFailure(() => validateFairPaths({ fair_paths: { plain: { status: "pass", agent_visible_evidence: ["task.md"] } } }, new Set(["task.md"])), /kernel_only fair path is missing/u, "Plain and Kernel-only fair paths are both required");

  const evidenceMap = readJson(resolve(fixtureRoot, "evidence-map.json"));
  const target = evidenceMap.maps.find(({ evidence_map_id }) => evidence_map_id === evidenceMap.mutation_contracts[0].target_evidence_map_id);
  assert.equal(evaluateEvidenceRemoval({ evidenceMap: target, removedPaths: target.agent_visible_paths, expectedRecoverabilityState: "not_recoverable" }), "not_recoverable");
  expectFailure(() => evaluateEvidenceRemoval({ evidenceMap: target, removedPaths: target.agent_visible_paths, expectedRecoverabilityState: "recoverable" }), /expectation is invalid/u, "removed scored evidence must not remain recoverable");

  const inputManifest = readJson(resolve(fixtureRoot, "input-manifest.json"));
  const visiblePaths = inputManifest.fixtures["mn-build-option-update"].files.map(({ path }) => path);
  assert.equal(visiblePaths.includes("evaluator-reference.json"), false, "evaluator reference must not enter the pre-output agent-visible collection");
  assert.equal(visiblePaths.every((path) => path === "task.md" || path.startsWith("workspace/")), true);

  const pendingScoring = syntheticScoringInput();
  expectFailure(() => validateScoringInputBindings(pendingScoring), /requires an admitted/u, "checked-in pending admission must fail standalone scoring binding");
  const statusOnly = structuredClone(pendingScoring);
  statusOnly.admissionRecord.admission_status = "admitted";
  expectFailure(() => validateScoringInputBindings(statusOnly), /final admission record digest/u, "admitted status with a stale digest must fail closed");
  const admissionOnly = structuredClone(statusOnly);
  admissionOnly.admissionRecord.admission_digest = computeFinalAdmissionRecordDigest(admissionOnly.admissionRecord);
  expectFailure(() => validateScoringInputBindings(admissionOnly), /admission binding/u, "admission digest without downstream authority updates must fail closed");
  const scoring = admittedSyntheticScoringInput(pendingScoring);
  assert.equal(validateScoringInputBindings(scoring).scoringReady, true, "only a fully re-derived synthetic admitted authority may become scoring-ready");
  const replacedReference = structuredClone(scoring);
  replacedReference.evaluatorResult.evaluator_public_reference_digest = `sha256:${"d".repeat(64)}`;
  expectFailure(() => validateScoringInputBindings(replacedReference), /binding mismatch/u, "evaluator reference replacement must fail closed");
  const inputDrift = structuredClone(scoring);
  inputDrift.evaluatorReference.fixture_input_digest = `sha256:${"e".repeat(64)}`;
  expectFailure(() => validateScoringInputBindings(inputDrift), /input binding/u, "input identity drift must fail closed");
  const unknownRequirement = structuredClone(scoring);
  unknownRequirement.evaluatorResult.requirement_results[0].requirement_id = "unknown-requirement";
  expectFailure(() => validateScoringInputBindings(unknownRequirement), /unknown requirement/u, "unknown evaluator requirement must fail closed");
  const missingRequirement = structuredClone(scoring);
  missingRequirement.evaluatorResult.requirement_results.pop();
  expectFailure(() => validateScoringInputBindings(missingRequirement), /exactly cover/u, "missing evaluator requirement must fail closed");
  assert.equal(summary.scoringReady, false, "synthetic scoring consumption must not promote a review-pending real fixture");

  if (privateRoot) {
    const roots = boundaryRoots();
    const privateSummary = validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot, ...roots });
    assert.equal(privateSummary.evaluatorBundleDigest, summary.evaluatorBundleDigest);
    runPrivateSemanticNegativeChecks(privateRoot);
    await runPrivateCandidateChecks(privateRoot);

    const manifest = readJson(resolve(privateRoot, "private-evaluator-bundle.json"));
    const privateAsset = manifest.asset_inventory[0];
    const leakedAsset = resolve(roots.publicArtifactRoot, "unmanaged-private-material.bin");
    cpSync(resolve(privateRoot, privateAsset.path), leakedAsset);
    expectFailure(() => validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot, ...roots }), /byte-identical private evaluator material/u, "private material in the public artifact root must fail closed");
    rmSync(leakedAsset);

    const driftedRoot = resolve(work, "private-digest-drift");
    cpSync(privateRoot, driftedRoot, { recursive: true });
    const driftedManifestPath = resolve(driftedRoot, "private-evaluator-bundle.json");
    const driftedManifest = readJson(driftedManifestPath);
    driftedManifest.evaluator_bundle_digest = `sha256:${"f".repeat(64)}`;
    writeJson(driftedManifestPath, driftedManifest);
    expectFailure(() => validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot: driftedRoot, ...roots }), /digest closure|identity mismatch/u, "private bundle digest drift must fail closed");

    const statementDriftRoot = resolve(work, "private-independence-statement-drift");
    cpSync(privateRoot, statementDriftRoot, { recursive: true });
    const statementDriftManifest = readJson(resolve(statementDriftRoot, "private-evaluator-bundle.json"));
    const statementDriftAsset = statementDriftManifest.asset_inventory.find(({ role }) => role === "independence_provenance");
    const statementDriftPath = resolve(statementDriftRoot, statementDriftAsset.path);
    const statementDrift = readJson(statementDriftPath);
    statementDrift.measured_output_used = true;
    writeJson(statementDriftPath, statementDrift);
    expectFailure(() => validateMnBuildOptionUpdatePrivateFixture({ root, privateRoot: statementDriftRoot, ...roots }), /asset digest is invalid|digest mismatch|exclude measured evidence/u, "independence statement drift must fail closed");

    const cli = spawnSync(process.execPath, [resolve(root, "scripts/ask-benchmark-mn-build-option-update.mjs"), "--private-root", privateRoot], { encoding: "utf8" });
    assert.equal(cli.status, 1, "CLI private validation without explicit boundary roots must fail closed");
    assert.equal(`${cli.stdout}${cli.stderr}`.includes(privateRoot), false, "CLI output must not disclose the private root");
    assert.equal(`${cli.stdout}${cli.stderr}`.includes("observable_contract"), false, "CLI output must not disclose private evaluator content");
  }

  console.log(JSON.stringify({
    fixture_id: summary.fixtureId,
    evaluator_bundle_id: summary.evaluatorBundleId,
    evaluator_bundle_digest: summary.evaluatorBundleDigest,
    evaluator_byte_count: summary.evaluatorByteCount,
    public_validation: "pass",
    private_validation: privateRoot ? "pass" : "not_run",
    evidence_removal: "pass",
    equivalent_solution: privateRoot ? "pass" : "not_run",
    synthetic_interface: "pass",
    review_status: summary.reviewStatus,
    scoring_ready: false,
  }));
} finally {
  rmSync(work, { recursive: true, force: true });
}
