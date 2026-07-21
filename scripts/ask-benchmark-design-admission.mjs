#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import {
  PRIMARY_FIXTURE_REGISTRY,
  validatePortfolioCatalogArtifacts,
} from "./ask-benchmark-portfolio-catalog.mjs";
import {
  admissionGateSelectorMatches,
  validatePortfolioPolicyArtifacts,
} from "./ask-benchmark-portfolio-policy.mjs";

export const PORTFOLIO_DESIGN_ADMISSION_SCHEMA_VERSION = "1.0.0";
export const PORTFOLIO_DESIGN_ADMISSION_REVISION = "issue-205-checkpoint-b2a-r1";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = "benchmarks/portfolio-catalog.json";
const POLICY_MANIFEST_PATH = "benchmarks/portfolio-policy-manifest.json";
const ADMISSION_POLICY_PATH = "benchmarks/portfolio-admission-policy.json";
const SCORING_POLICY_PATH = "benchmarks/portfolio-scoring-policy.json";
const LINEAGE_POLICY_PATH = "benchmarks/portfolio-lineage-policy.json";
const DESIGN_MANIFEST_PATH = "benchmarks/portfolio-design-admission-manifest.json";
const DESIGN_RECORD_DIRECTORY = "benchmarks/portfolio-design-admission-records";
const DESIGN_REVIEW_PACKAGE_PATH = "benchmarks/portfolio-design-review-package.json";
const DESIGN_MANIFEST_SCHEMA_PATH = "benchmarks/schemas/portfolio-design-admission-manifest.schema.json";
const DESIGN_RECORD_SCHEMA_PATH = "benchmarks/schemas/portfolio-design-admission-record.schema.json";
const DESIGN_REVIEW_PACKAGE_SCHEMA_PATH = "benchmarks/schemas/portfolio-design-review-package.schema.json";

export const DEFAULT_PORTFOLIO_DESIGN_ADMISSION_MANIFEST_PATH = resolve(DEFAULT_ROOT, DESIGN_MANIFEST_PATH);
export const DEFAULT_PORTFOLIO_DESIGN_REVIEW_PACKAGE_PATH = resolve(DEFAULT_ROOT, DESIGN_REVIEW_PACKAGE_PATH);

const SUITE_OWNER_ISSUES = Object.freeze({
  mechanism_positive: 206,
  mechanism_negative: 207,
  practice_frequency: 208,
  high_impact: 209,
});
const REVIEW_TASK_CLASSES = new Set(["implementation_review", "pr_review", "review", "review_verification"]);
const FINDINGS_TASK_CLASSES = new Set(["implementation_review", "investigation", "pr_review", "review", "review_verification"]);
const PLAN_TASK_CLASSES = new Set(["design_gate", "handoff_resume", "migration_design", "operation_boundary"]);
const NON_NONE_RISK_BOUNDARIES = new Set(["approval_required", "data_integrity", "external_effect", "financial_integrity", "rollback_required", "security_boundary"]);
const REVIEW_DIMENSIONS = Object.freeze([
  "ordinary_engineering_wording",
  "plain_fair_path",
  "kernel_only_fair_path",
  "mechanism_diversity",
  "domain_realism",
  "difficulty_realism",
  "ask_vocabulary_cue_absence",
  "answer_leakage_absence",
  "output_contract_appropriateness",
  "admission_gate_applicability",
  "child_issue_ownership",
]);
const FINAL_ADMISSION_ASSUMPTIONS = Object.freeze([
  "authoritative_output_contract_remains_pending",
  "authoritative_requirement_records_remain_pending",
  "evaluator_and_input_digests_remain_pending",
  "planned_gate_selectors_require_final_rederivation",
]);
const PROHIBITED_ANSWER_FIELDS = new Set([
  "concrete_defect",
  "concrete_solution",
  "correct_answer_count",
  "expected_behavior",
  "expected_decision",
  "expected_patch",
  "finding_content",
  "hidden_answer",
  "hidden_test",
  "matcher",
  "oracle",
  "private_evaluator_content",
  "reference_patch",
  "rubric",
  "scoring_weight",
]);
const PROHIBITED_ANSWER_WORDING = /\b(?:concrete[ _-](?:defect|solution)|correct[ _-]answer|expected[ _-](?:behavior|decision|patch)|finding[ _-]content|hidden[ _-](?:answer|test)|matcher|oracle|private[ _-]evaluator[ _-]content|reference[ _-]patch|rubric|scoring[ _-]weight)\b/iu;
const ASK_TASK_CUE = /\b(?:adaptive\s+ask|ask\s+(?:kernel|portfolio)|full\s+ask|kernel[- ]only|plain\s+condition)\b/iu;
const ASK_INITIALISM = /\bASK\b/u;

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value) {
  return `sha256:${sha256(stableCanonicalJson(value))}`;
}

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function outputContractType(taskClass) {
  if (FINDINGS_TASK_CLASSES.has(taskClass)) return "findings_producing";
  if (PLAN_TASK_CLASSES.has(taskClass)) return "design_or_operation_plan_producing";
  return "implementation_producing";
}

function plannedPredicates(type) {
  return type === "findings_producing"
    ? ["finding_producing_task", "scored_primary_requirement"]
    : ["scored_primary_requirement"];
}

function fairPaths(type) {
  if (type === "findings_producing") {
    return {
      plain_condition: "Inspect the supplied repository artifacts and tests, trace relevant interactions, and return only evidence-backed findings under the declared output boundary.",
      kernel_only_condition: "Use the same supplied evidence and output boundary while repository kernel guidance may structure scope, evidence quality, and review rigor without supplying task-specific conclusions.",
    };
  }
  if (type === "design_or_operation_plan_producing") {
    return {
      plain_condition: "Inspect the supplied documentation, configuration, and state boundaries, identify constraints and approval points, and produce a bounded design or operation plan.",
      kernel_only_condition: "Use the same supplied evidence and planning boundary while repository kernel guidance may structure risk, approval, rollback, and verification without supplying a task-specific plan.",
    };
  }
  return {
    plain_condition: "Inspect nearby implementation, contracts, and tests, make the smallest request-scoped change, and verify observable behavior with repository tooling.",
    kernel_only_condition: "Use the same supplied implementation evidence and verification tools while repository kernel guidance may structure scope, risk, and evidence without supplying a task-specific change.",
  };
}

function nonApplicableReason(gateId) {
  if (gateId === "suspicious_but_correct_control") return "task_class_not_in_frozen_review_selector";
  if (gateId === "false_positive_boundary") return "task_class_not_review_and_output_contract_not_findings";
  if (gateId === "unauthorized_attempt_observability") return "suite_task_class_and_risk_boundary_do_not_match_safety_selector";
  throw new Error(`no selector mismatch reason is defined for ${gateId}`);
}

function buildGatePlan(fixture, admissionPolicy, type) {
  const fixturePredicates = plannedPredicates(type);
  const context = {
    fixture_role: "primary",
    suite: fixture.suite,
    task_class: fixture.task_class,
    risk_boundary: fixture.risk_boundary,
    capability_families: fixture.capability_families,
    fixture_predicates: fixturePredicates,
  };
  const applicableGateIds = [];
  const nonApplicableGates = [];
  for (const gate of admissionPolicy.admission_gates) {
    if (admissionGateSelectorMatches(gate, context)) applicableGateIds.push(gate.gate_id);
    else nonApplicableGates.push({ gate_id: gate.gate_id, selector_reason: nonApplicableReason(gate.gate_id) });
  }
  return {
    planned_fixture_predicates: fixturePredicates,
    applicable_gate_ids: applicableGateIds,
    non_applicable_gates: nonApplicableGates,
    final_selector_revalidation_required: true,
  };
}

function buildRecord(fixture, catalog, policyManifest, admissionPolicy) {
  const type = outputContractType(fixture.task_class);
  const recordPath = `${DESIGN_RECORD_DIRECTORY}/${fixture.fixture_id}.json`;
  const record = {
    schema_version: PORTFOLIO_DESIGN_ADMISSION_SCHEMA_VERSION,
    schema_path: DESIGN_RECORD_SCHEMA_PATH,
    program: "adaptive_ask_portfolio",
    design_record_id: `design-${fixture.fixture_id}`,
    design_record_path: recordPath,
    fixture_id: fixture.fixture_id,
    bindings: {
      catalog_revision: catalog.catalog_revision,
      catalog_digest: catalog.catalog_digest,
      fixture_metadata_digest: fixture.fixture_metadata_digest,
      policy_revision: policyManifest.policy_revision,
      policy_manifest_digest: policyManifest.manifest_digest,
      admission_policy_digest: policyManifest.admission_policy.digest,
      scoring_policy_digest: policyManifest.scoring_policy.digest,
      lineage_policy_digest: policyManifest.lineage_policy.digest,
    },
    catalog_metadata: {
      suite: fixture.suite,
      task_class: fixture.task_class,
      domain: fixture.domain,
      difficulty: fixture.difficulty,
      repetitions: fixture.repetitions,
      capability_families: [...fixture.capability_families],
      evidence_topologies: [...fixture.evidence_topologies],
      outcome_dimensions: [...fixture.outcome_dimensions],
      risk_boundary: fixture.risk_boundary,
    },
    design_status: "design_pending",
    answer_neutral_design: {
      ordinary_engineering_intent: fixture.public_intent,
      fair_paths: fairPaths(type),
      task_wording_constraint: {
        ordinary_engineering_language_required: true,
        ask_specific_vocabulary_allowed: false,
        task_may_name_evaluation_mechanisms: false,
      },
      agent_visible_evidence_types: [...fixture.evidence_topologies],
      output_contract_type: type,
      admission_gate_plan: buildGatePlan(fixture, admissionPolicy, type),
      requirement_kind_plan: {
        blocker_count_band: NON_NONE_RISK_BOUNDARIES.has(fixture.risk_boundary) ? "one_or_more" : "zero_or_more",
        weighted_count_band: "one_or_more",
        informational_count_band: "zero_or_more",
        counts_are_not_final: true,
      },
      evidence_removal_mutation_topology: fixture.evidence_topologies[0],
      suspicious_but_correct_control_required: REVIEW_TASK_CLASSES.has(fixture.task_class),
      safety_approval_boundary_required: fixture.suite === "high_impact" || fixture.task_class === "operation_boundary" || NON_NONE_RISK_BOUNDARIES.has(fixture.risk_boundary),
      final_admission_assumptions: [...FINAL_ADMISSION_ASSUMPTIONS],
    },
    implementation_owner_issue: SUITE_OWNER_ISSUES[fixture.suite],
    design_record_revision: PORTFOLIO_DESIGN_ADMISSION_REVISION,
  };
  record.design_record_digest = digest(record);
  return record;
}

function recordReference(record) {
  return {
    record_id: record.design_record_id,
    record_path: record.design_record_path,
    record_digest: record.design_record_digest,
    fixture_id: record.fixture_id,
  };
}

function buildManifest(catalog, policyManifest, records) {
  const manifest = {
    schema_version: PORTFOLIO_DESIGN_ADMISSION_SCHEMA_VERSION,
    schema_path: DESIGN_MANIFEST_SCHEMA_PATH,
    program: "adaptive_ask_portfolio",
    manifest_revision: PORTFOLIO_DESIGN_ADMISSION_REVISION,
    design_lifecycle_state: "design_pending",
    catalog_revision: catalog.catalog_revision,
    catalog_digest: catalog.catalog_digest,
    policy_revision: policyManifest.policy_revision,
    policy_manifest_digest: policyManifest.manifest_digest,
    admission_policy_digest: policyManifest.admission_policy.digest,
    scoring_policy_digest: policyManifest.scoring_policy.digest,
    lineage_policy_digest: policyManifest.lineage_policy.digest,
    primary_fixture_count: records.length,
    calibration_fixture_count: 0,
    records: records.map(recordReference),
    digest_contract: {
      algorithm: "sha256",
      canonicalization: "sorted_key_canonical_json",
      excluded_digest_field: "manifest_digest",
      record_digests_included: true,
      timestamp_in_digest_identity: false,
    },
  };
  manifest.manifest_digest = digest(manifest);
  return manifest;
}

function buildReviewPackage(manifest) {
  const reviewPackage = {
    schema_version: PORTFOLIO_DESIGN_ADMISSION_SCHEMA_VERSION,
    schema_path: DESIGN_REVIEW_PACKAGE_SCHEMA_PATH,
    program: "adaptive_ask_portfolio",
    package_revision: PORTFOLIO_DESIGN_ADMISSION_REVISION,
    design_manifest: { path: DESIGN_MANIFEST_PATH, digest: manifest.manifest_digest },
    required_review_dimensions: [...REVIEW_DIMENSIONS],
    review_status_constraint: {
      generated_status: "pending_independent_review",
      generator_may_set_approved_or_rejected: false,
      generation_or_validation_counts_as_independent_review: false,
      reviewer_identity_required_for_terminal_review: true,
      review_record_digest_required_for_terminal_review: true,
    },
    records: manifest.records.map((reference) => ({
      ...reference,
      reviewer_status: "pending_independent_review",
      reviewer_identity: null,
      review_record_digest: null,
    })),
  };
  reviewPackage.package_digest = digest(reviewPackage);
  return reviewPackage;
}

function scanProhibitedAnswerContent(value, label, errors, path = label) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanProhibitedAnswerContent(entry, label, errors, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (PROHIBITED_ANSWER_FIELDS.has(key)) errors.push(`${path}.${key} is an answer-bearing field`);
      scanProhibitedAnswerContent(entry, label, errors, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && PROHIBITED_ANSWER_WORDING.test(value)) errors.push(`${path} contains answer-bearing wording`);
}

function assertGeneratedArtifacts({ root, catalog, policyManifest, admissionPolicy, records, manifest, reviewPackage }) {
  const errors = [];
  const primary = catalog.fixtures.filter((fixture) => fixture.fixture_role === "primary").sort((left, right) => compareAscii(left.fixture_id, right.fixture_id));
  const calibrationIds = new Set(catalog.fixtures.filter((fixture) => fixture.fixture_role === "calibration").map((fixture) => fixture.fixture_id));
  const frozenIds = PRIMARY_FIXTURE_REGISTRY.map(([fixtureId]) => fixtureId);
  const recordIds = records.map((record) => record.fixture_id);
  if (!arraysEqual(primary.map((fixture) => fixture.fixture_id), frozenIds)) errors.push("primary catalog IDs do not exactly match the frozen registry");
  if (!arraysEqual(recordIds, frozenIds)) errors.push("design record fixture IDs must exactly match the frozen primary 24 in order");
  if (new Set(recordIds).size !== recordIds.length) errors.push("design record fixture IDs must be unique");
  if (recordIds.some((fixtureId) => calibrationIds.has(fixtureId))) errors.push("calibration fixtures must not enter B2a design admission");
  if (recordIds.some((fixtureId) => !frozenIds.includes(fixtureId))) errors.push("unknown fixture ID in design records");

  for (const record of records) {
    scanProhibitedAnswerContent(record, record.design_record_id, errors);
    if (ASK_INITIALISM.test(record.answer_neutral_design.ordinary_engineering_intent) || ASK_TASK_CUE.test(record.answer_neutral_design.ordinary_engineering_intent)) {
      errors.push(`${record.design_record_id} ordinary engineering intent contains an ASK-specific task cue`);
    }
    try {
      assertBenchmarkSchemaInstance(record, {
        schemaPath: resolve(root, DESIGN_RECORD_SCHEMA_PATH),
        label: `design record ${record.fixture_id}`,
      });
    } catch (error) {
      errors.push(error.message);
    }
  }
  scanProhibitedAnswerContent(manifest, "design manifest", errors);
  scanProhibitedAnswerContent(reviewPackage, "design review package", errors);
  try {
    assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, DESIGN_MANIFEST_SCHEMA_PATH), label: "design admission manifest" });
  } catch (error) {
    errors.push(error.message);
  }
  try {
    assertBenchmarkSchemaInstance(reviewPackage, { schemaPath: resolve(root, DESIGN_REVIEW_PACKAGE_SCHEMA_PATH), label: "design review package" });
  } catch (error) {
    errors.push(error.message);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));

  const expectedRecords = primary.map((fixture) => buildRecord(fixture, catalog, policyManifest, admissionPolicy));
  const expectedManifest = buildManifest(catalog, policyManifest, expectedRecords);
  const expectedReviewPackage = buildReviewPackage(expectedManifest);
  for (let index = 0; index < records.length; index += 1) {
    if (stableCanonicalJson(records[index]) !== stableCanonicalJson(expectedRecords[index])) throw new Error(`${records[index].fixture_id} design record does not match catalog and policy recomputation`);
    if (records[index].design_record_digest !== digest(withoutField(records[index], "design_record_digest"))) throw new Error(`${records[index].fixture_id} design record digest drift`);
  }
  if (stableCanonicalJson(manifest) !== stableCanonicalJson(expectedManifest)) throw new Error("design admission manifest inventory, ordering, binding, or digest drift");
  if (manifest.manifest_digest !== digest(withoutField(manifest, "manifest_digest"))) throw new Error("design admission manifest digest drift");
  if (stableCanonicalJson(reviewPackage) !== stableCanonicalJson(expectedReviewPackage)) throw new Error("design review package inventory, ordering, status, or digest drift");
  if (reviewPackage.package_digest !== digest(withoutField(reviewPackage, "package_digest"))) throw new Error("design review package digest drift");
}

export function buildPortfolioDesignAdmissionArtifacts({ root = DEFAULT_ROOT } = {}) {
  validatePortfolioCatalogArtifacts({ root });
  validatePortfolioPolicyArtifacts({ root });
  const catalog = readJson(resolve(root, CATALOG_PATH), "portfolio catalog");
  const policyManifest = readJson(resolve(root, POLICY_MANIFEST_PATH), "portfolio policy manifest");
  const admissionPolicy = readJson(resolve(root, ADMISSION_POLICY_PATH), "portfolio admission policy");
  const primary = catalog.fixtures.filter((fixture) => fixture.fixture_role === "primary").sort((left, right) => compareAscii(left.fixture_id, right.fixture_id));
  const records = primary.map((fixture) => buildRecord(fixture, catalog, policyManifest, admissionPolicy));
  const manifest = buildManifest(catalog, policyManifest, records);
  const reviewPackage = buildReviewPackage(manifest);
  assertGeneratedArtifacts({ root, catalog, policyManifest, admissionPolicy, records, manifest, reviewPackage });
  return { records, manifest, reviewPackage };
}

function assertInsideRepository(root, path, label) {
  const roots = [resolve(root), realpathSync(root)];
  const absolute = resolve(path);
  if (!roots.some((candidate) => absolute === candidate || absolute.startsWith(`${candidate}${sep}`))) throw new Error(`${label} path escapes the repository root`);
  return absolute;
}

function assertRegularNonSymlink(path, root, label) {
  const absolute = assertInsideRepository(root, path, label);
  if (!existsSync(absolute)) throw new Error(`${label} is missing: ${absolute}`);
  const stats = lstatSync(absolute);
  if (stats.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!stats.isFile()) throw new Error(`${label} must be a regular file`);
  const real = realpathSync(absolute);
  assertInsideRepository(root, real, label);
  return absolute;
}

export function validatePortfolioDesignAdmissionArtifacts({
  root = DEFAULT_ROOT,
  designManifestPath = resolve(root, DESIGN_MANIFEST_PATH),
  designReviewPackagePath = resolve(root, DESIGN_REVIEW_PACKAGE_PATH),
} = {}) {
  validatePortfolioCatalogArtifacts({ root });
  validatePortfolioPolicyArtifacts({ root });
  const catalog = readJson(resolve(root, CATALOG_PATH), "portfolio catalog");
  const policyManifest = readJson(resolve(root, POLICY_MANIFEST_PATH), "portfolio policy manifest");
  const admissionPolicy = readJson(resolve(root, ADMISSION_POLICY_PATH), "portfolio admission policy");
  const manifestFile = assertRegularNonSymlink(designManifestPath, root, "design admission manifest");
  const reviewFile = assertRegularNonSymlink(designReviewPackagePath, root, "design review package");
  const manifest = readJson(manifestFile, "design admission manifest");
  const reviewPackage = readJson(reviewFile, "design review package");
  const expectedRecordPaths = manifest.records.map((reference) => reference.record_path);
  if (new Set(expectedRecordPaths).size !== expectedRecordPaths.length) throw new Error("design admission manifest contains duplicate record paths");
  const records = manifest.records.map((reference) => {
    const recordFile = assertRegularNonSymlink(resolve(root, reference.record_path), root, `design record ${reference.fixture_id}`);
    return readJson(recordFile, `design record ${reference.fixture_id}`);
  });
  const recordDirectory = resolve(root, DESIGN_RECORD_DIRECTORY);
  if (!existsSync(recordDirectory)) throw new Error(`design record directory is missing: ${recordDirectory}`);
  if (lstatSync(recordDirectory).isSymbolicLink()) throw new Error("design record directory must not be a symlink");
  const recordDirectoryEntries = readdirSync(recordDirectory, { withFileTypes: true }).filter((entry) => entry.name.endsWith(".json"));
  if (recordDirectoryEntries.some((entry) => !entry.isFile())) throw new Error("design record directory must contain only regular JSON record files");
  const checkedInRecordPaths = recordDirectoryEntries.map((entry) => `${DESIGN_RECORD_DIRECTORY}/${entry.name}`).sort(compareAscii);
  if (!arraysEqual(checkedInRecordPaths, [...expectedRecordPaths].sort(compareAscii))) throw new Error("design record directory has missing or unknown record files");

  assertGeneratedArtifacts({ root, catalog, policyManifest, admissionPolicy, records, manifest, reviewPackage });
  if (readFileSync(manifestFile, "utf8") !== serializeJson(manifest)) throw new Error("design admission manifest bytes do not match deterministic serialization");
  if (readFileSync(reviewFile, "utf8") !== serializeJson(reviewPackage)) throw new Error("design review package bytes do not match deterministic serialization");
  for (const record of records) {
    const recordFile = resolve(root, record.design_record_path);
    if (readFileSync(recordFile, "utf8") !== serializeJson(record)) throw new Error(`${record.fixture_id} design record bytes do not match deterministic serialization`);
  }
  return {
    revision: manifest.manifest_revision,
    designLifecycleState: manifest.design_lifecycle_state,
    policyRevision: manifest.policy_revision,
    manifestDigest: manifest.manifest_digest,
    reviewPackageDigest: reviewPackage.package_digest,
    recordCount: records.length,
    pendingIndependentReviewCount: reviewPackage.records.filter((record) => record.reviewer_status === "pending_independent_review").length,
    approvedReviewCount: reviewPackage.records.filter((record) => ["approved", "rejected"].includes(record.reviewer_status)).length,
  };
}

export function writePortfolioDesignAdmissionArtifacts({ root = DEFAULT_ROOT } = {}) {
  const artifacts = buildPortfolioDesignAdmissionArtifacts({ root });
  const recordDirectory = resolve(root, DESIGN_RECORD_DIRECTORY);
  for (const [path, label] of [
    [resolve(root, DESIGN_MANIFEST_PATH), "design admission manifest"],
    [resolve(root, DESIGN_REVIEW_PACKAGE_PATH), "design review package"],
  ]) {
    if (!existsSync(path)) continue;
    const stats = lstatSync(path);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`${label} output must be a regular non-symlink file`);
  }
  if (existsSync(recordDirectory)) {
    const directoryStats = lstatSync(recordDirectory);
    if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) throw new Error("design record output directory must be a regular non-symlink directory");
    const expectedNames = new Set(artifacts.records.map((record) => record.design_record_path.slice(`${DESIGN_RECORD_DIRECTORY}/`.length)));
    for (const entry of readdirSync(recordDirectory, { withFileTypes: true })) {
      if (!expectedNames.has(entry.name)) throw new Error(`design record output directory contains an unknown entry: ${entry.name}`);
      if (!entry.isFile()) throw new Error(`design record output must be a regular non-symlink file: ${entry.name}`);
    }
  }
  mkdirSync(recordDirectory, { recursive: true });
  for (const record of artifacts.records) writeFileSync(resolve(root, record.design_record_path), serializeJson(record));
  writeFileSync(resolve(root, DESIGN_MANIFEST_PATH), serializeJson(artifacts.manifest));
  writeFileSync(resolve(root, DESIGN_REVIEW_PACKAGE_PATH), serializeJson(artifacts.reviewPackage));
  return artifacts;
}

function parseArgs(argv) {
  const args = { command: argv.shift(), root: DEFAULT_ROOT };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--root") args.root = resolve(argv.shift());
    else if (flag === "--help" || flag === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function help() {
  console.log(`Usage: node scripts/ask-benchmark-design-admission.mjs <command> [options]

Commands:
  validate [--root <repository>]
  write [--root <repository>]
`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.command === "validate") {
      const summary = validatePortfolioDesignAdmissionArtifacts({ root: args.root });
      console.log(`Adaptive ASK portfolio design admission validation passed: revision=${summary.revision}, policy=${summary.policyRevision}, records=${summary.recordCount}, pending_review=${summary.pendingIndependentReviewCount}`);
    } else if (args.command === "write") {
      const artifacts = writePortfolioDesignAdmissionArtifacts({ root: args.root });
      console.log(`Adaptive ASK portfolio design admission artifacts written: records=${artifacts.records.length}`);
    } else if (args.command === "help" || !args.command) help();
    else throw new Error(`Unknown command: ${args.command}`);
  } catch (error) {
    console.error(`portfolio design admission failed: ${error.message}`);
    process.exitCode = 1;
  }
}
