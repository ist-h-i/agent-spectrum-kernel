#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalPathSetDigest } from "./installer-lifecycle.mjs";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { verifyPromptV2PreregistrationFixture } from "./prompt-v2-preregistration-samples.mjs";
import { validatePortfolioCatalogArtifacts } from "./ask-benchmark-portfolio-catalog.mjs";
import { validatePortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import { validatePortfolioDesignAdmissionArtifacts } from "./ask-benchmark-design-admission.mjs";
import { validatePortfolioDesignIndependentReview, validatePortfolioDesignReviewedState } from "./ask-benchmark-design-review.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultOutput = resolve(root, "docs/fixtures/adapter-runtime-bundle.json");
const commonProfiles = ["daily", "organizational", "implementation", "investigation", "review", "observability", "full"];
const frozenLegacyCalibrationSources = Object.freeze([
  Object.freeze({ path: "benchmarks/results/checkpoint-b-2026-07-12.json", file_sha256: "6cc61a07b4da9640a8f1a1e7ea66352faaf4858cbdbd28e12458700fed88db46" }),
  Object.freeze({ path: "benchmarks/results/checkpoint-b2-2026-07-12.json", file_sha256: "80dd7a195dc8c9c1cbf3e793b18398bcf911d50bf17151e8981d8d8508c98cae" }),
  Object.freeze({ path: "benchmarks/results/checkpoint-c-2026-07-14.json", file_sha256: "d0a6281abf113d7eb73d60cdcf9b27a2efd222189a9709d0869973ff7d342fdc" }),
]);
const frozenLegacyCalibrationMigrations = Object.freeze([
  Object.freeze({ path: "benchmarks/results/checkpoint-b-2026-07-12.migration.json", file_sha256: "c972505bc96bd3334c0ed088d630b448d60e1909c50b96c1d009c16ca291fbf5" }),
  Object.freeze({ path: "benchmarks/results/checkpoint-b2-2026-07-12.migration.json", file_sha256: "83bcabc0424afc298b1fcd63f3d4d611f02f4ffae7ec11e8c0abfa155bbfdf64" }),
  Object.freeze({ path: "benchmarks/results/checkpoint-c-2026-07-14.migration.json", file_sha256: "a6f23fa5f4f7a250f29552705dc95f33ab7f1d63ae036051cc65e6d8ca4194d2" }),
]);

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
}

function parseArgs(argv) {
  const args = { check: false, write: false, checkAdapters: false, writeAdapters: false, output: defaultOutput };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") args.check = true;
    else if (arg === "--write") args.write = true;
    else if (arg === "--check-adapters") args.checkAdapters = true;
    else if (arg === "--write-adapters") args.writeAdapters = true;
    else if (arg === "--output") args.output = resolve(argv[++index]);
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/adapter-runtime-bundle.mjs [--check | --write | --check-adapters | --write-adapters] [--output <path>]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if ([args.check, args.write, args.checkAdapters, args.writeAdapters].filter(Boolean).length > 1) throw new Error("bundle modes are mutually exclusive");
  return args;
}

function projectionRecord(adapterId, plan) {
  const assetCounts = {};
  for (const asset of plan.projectedManagedAssets) assetCounts[asset.asset_kind] = (assetCounts[asset.asset_kind] ?? 0) + 1;
  return {
    adapter_id: adapterId,
    renderer_id: plan.renderer_id,
    renderer_version: plan.renderer_version,
    renderer_profile: plan.renderer_profile,
    profile_fingerprint: plan.fingerprint,
    canonical_subset_digest: plan.canonical_source_digest,
    canonical_source_count: plan.renderer_inputs.canonical.length,
    projected_asset_count: plan.projectedManagedAssets.length,
    projected_asset_digest: plan.managed_inventory_digest,
    projected_asset_counts: Object.fromEntries(Object.entries(assetCounts).sort(([left], [right]) => left.localeCompare(right))),
    lifecycle_operations: ["install", "update", "rollback", "detach"],
  };
}

export function buildAdapterProjectionBundle() {
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  const profiles = [];
  const canonicalPaths = new Set(["AGENTS.md", "manifest.json"]);
  for (const profile of commonProfiles) {
    const claude = buildClaudeProjectionPlan({ profileName: profile });
    const codex = buildCodexProjectionPlan({ profileName: profile });
    for (const input of [...claude.renderer_inputs.canonical, ...codex.renderer_inputs.canonical]) canonicalPaths.add(input.path);
    profiles.push({
      profile,
      adapters: [projectionRecord("claude_code", claude), projectionRecord("codex", codex)],
    });
  }
  const sourcePaths = [...canonicalPaths].sort();
  return {
    schema_version: "1.0.0",
    canonical_contract: {
      revision: `ask-${manifest.version}`,
      source_digest: canonicalPathSetDigest(root, sourcePaths),
      source_paths: sourcePaths,
    },
    adapters: ["claude_code", "codex"],
    profiles,
    normalized_event_schema_registry: "schemas/normalized-event-schema-registry.json",
    conformance_fixture: "docs/fixtures/adapter-cross-conformance.json",
    migration_contract: "docs/adapter-runtime-migration.md",
  };
}

export function buildAdapterRuntimeBundle() {
  const projection = buildAdapterProjectionBundle();
  validatePortfolioCatalogArtifacts({ root });
  validatePortfolioPolicyArtifacts({ root });
  validatePortfolioDesignAdmissionArtifacts({ root });
  validatePortfolioDesignIndependentReview({ root });
  validatePortfolioDesignReviewedState({ root });
  const promptV2FixtureRoot = resolve(root, "docs/fixtures/prompt-v2-preregistration");
  const promptV2Summary = verifyPromptV2PreregistrationFixture({ root: promptV2FixtureRoot });
  const promptV2Binding = JSON.parse(readFileSync(resolve(promptV2FixtureRoot, "binding.json"), "utf8"));
  const promptV2Reference = JSON.parse(readFileSync(resolve(promptV2FixtureRoot, "reference.json"), "utf8"));
  const promptV2Preregistration = JSON.parse(readFileSync(resolve(root, "benchmarks/prompt-v2-preregistration.json"), "utf8"));
  const portfolioCatalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"), "utf8"));
  const portfolioSimilarity = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-similarity.json"), "utf8"));
  const portfolioPolicyManifest = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-policy-manifest.json"), "utf8"));
  const portfolioDesignManifest = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-design-admission-manifest.json"), "utf8"));
  const portfolioDesignReviewPackage = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-design-review-package.json"), "utf8"));
  const portfolioIndependentDesignReview = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-design-independent-review.json"), "utf8"));
  const portfolioDesignReviewedState = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-design-reviewed-state.json"), "utf8"));
  const mnBuildOptionMetadata = JSON.parse(readFileSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/metadata.json"), "utf8"));
  const mnBuildOptionReference = JSON.parse(readFileSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-reference.json"), "utf8"));
  const mnBuildOptionRequirement = JSON.parse(readFileSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/requirement-record.json"), "utf8"));
  const mnBuildOptionOutput = JSON.parse(readFileSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/output-contract.json"), "utf8"));
  const mnBuildOptionAdmission = JSON.parse(readFileSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/final-admission-record.json"), "utf8"));
  const mnBuildOptionFreeze = JSON.parse(readFileSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/scoring-input-freeze-manifest.json"), "utf8"));
  const mnBuildOptionReview = JSON.parse(readFileSync(resolve(root, "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/admission-review.json"), "utf8"));
  return {
    ...projection,
    benchmark_handoff: {
      issue: 171,
      checkpoint: "C",
      baseline_configs: ["benchmarks/checkpoint-b.config.json", "benchmarks/checkpoint-b2.config.json"],
      required_attribution: ["architecture", "model", "cli", "adapter", "repository"],
      portfolio_catalog: {
        issue: 205,
        checkpoint: "public_metadata_freeze",
        protocol_version: "3.7.0-portfolio-policy",
        catalog_path: "benchmarks/portfolio-catalog.json",
        catalog_file_sha256: fileSha256("benchmarks/portfolio-catalog.json"),
        catalog_digest: portfolioCatalog.catalog_digest,
        similarity_path: "benchmarks/portfolio-similarity.json",
        similarity_file_sha256: fileSha256("benchmarks/portfolio-similarity.json"),
        similarity_report_digest: portfolioSimilarity.report_digest,
      },
      portfolio_policy: {
        issue: 205,
        checkpoint: "policy_contract_freeze",
        protocol_version: "3.7.0-portfolio-policy",
        policy_revision: portfolioPolicyManifest.policy_revision,
        policy_manifest_path: "benchmarks/portfolio-policy-manifest.json",
        policy_manifest_file_sha256: fileSha256("benchmarks/portfolio-policy-manifest.json"),
        policy_manifest_digest: portfolioPolicyManifest.manifest_digest,
        admission_policy_digest: portfolioPolicyManifest.admission_policy.digest,
        scoring_policy_digest: portfolioPolicyManifest.scoring_policy.digest,
        lineage_policy_digest: portfolioPolicyManifest.lineage_policy.digest,
        policy_status: portfolioPolicyManifest.policy_status,
      },
      portfolio_scoring_input: {
        issue: 205,
        checkpoint: "scoring_input_authority_closure",
        policy_manifest_digest: portfolioPolicyManifest.manifest_digest,
        scoring_policy_digest: portfolioPolicyManifest.scoring_policy.digest,
        requirement_record_schema_path: "benchmarks/schemas/portfolio-requirement-record.schema.json",
        requirement_record_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-requirement-record.schema.json"),
        final_admission_record_schema_path: "benchmarks/schemas/portfolio-final-admission-record.schema.json",
        final_admission_record_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-final-admission-record.schema.json"),
        scoring_input_freeze_manifest_schema_path: "benchmarks/schemas/scoring-input-freeze-manifest.schema.json",
        scoring_input_freeze_manifest_schema_file_sha256: fileSha256("benchmarks/schemas/scoring-input-freeze-manifest.schema.json"),
        evaluator_result_schema_path: "benchmarks/schemas/evaluator-result-envelope.schema.json",
        evaluator_result_schema_file_sha256: fileSha256("benchmarks/schemas/evaluator-result-envelope.schema.json"),
        scoring_contract_validator_path: "scripts/ask-benchmark-scoring-contract.mjs",
        scoring_contract_validator_file_sha256: fileSha256("scripts/ask-benchmark-scoring-contract.mjs"),
        scoring_authority_validator_path: "scripts/ask-benchmark-evaluator-boundary.mjs",
        scoring_authority_validator_file_sha256: fileSha256("scripts/ask-benchmark-evaluator-boundary.mjs"),
        engineering_result_schema_path: "benchmarks/schemas/portfolio-engineering-result.schema.json",
        engineering_result_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-engineering-result.schema.json"),
        scoring_implementation_path: "scripts/ask-benchmark-portfolio-score.mjs",
        scoring_implementation_file_sha256: fileSha256("scripts/ask-benchmark-portfolio-score.mjs"),
        scoring_test_path: "scripts/test-ask-benchmark-portfolio-score.mjs",
        scoring_test_file_sha256: fileSha256("scripts/test-ask-benchmark-portfolio-score.mjs"),
        atomic_publication_implementation_path: "scripts/ask-benchmark-atomic-publication.mjs",
        atomic_publication_implementation_file_sha256: fileSha256("scripts/ask-benchmark-atomic-publication.mjs"),
        stable_file_implementation_path: "scripts/ask-benchmark-stable-file.mjs",
        stable_file_implementation_file_sha256: fileSha256("scripts/ask-benchmark-stable-file.mjs"),
        engineering_result_source_manifest_schema_path: "benchmarks/schemas/portfolio-engineering-result-source-manifest.schema.json",
        engineering_result_source_manifest_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-engineering-result-source-manifest.schema.json"),
        engineering_result_set_schema_path: "benchmarks/schemas/portfolio-engineering-result-set.schema.json",
        engineering_result_set_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-engineering-result-set.schema.json"),
        engineering_result_set_implementation_path: "scripts/ask-benchmark-portfolio-result-set.mjs",
        engineering_result_set_implementation_file_sha256: fileSha256("scripts/ask-benchmark-portfolio-result-set.mjs"),
        engineering_result_set_test_path: "scripts/test-ask-benchmark-portfolio-result-set.mjs",
        engineering_result_set_test_file_sha256: fileSha256("scripts/test-ask-benchmark-portfolio-result-set.mjs"),
        repetition_report_schema_path: "benchmarks/schemas/portfolio-repetition-report.schema.json",
        repetition_report_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-repetition-report.schema.json"),
        repetition_report_implementation_path: "scripts/ask-benchmark-portfolio-repetition-report.mjs",
        repetition_report_implementation_file_sha256: fileSha256("scripts/ask-benchmark-portfolio-repetition-report.mjs"),
        repetition_report_test_path: "scripts/test-ask-benchmark-portfolio-repetition-report.mjs",
        repetition_report_test_file_sha256: fileSha256("scripts/test-ask-benchmark-portfolio-repetition-report.mjs"),
        paired_comparison_report_schema_path: "benchmarks/schemas/portfolio-paired-comparison-report.schema.json",
        paired_comparison_report_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-paired-comparison-report.schema.json"),
        paired_comparison_report_implementation_path: "scripts/ask-benchmark-portfolio-paired-comparison-report.mjs",
        paired_comparison_report_implementation_file_sha256: fileSha256("scripts/ask-benchmark-portfolio-paired-comparison-report.mjs"),
        paired_comparison_report_test_path: "scripts/test-ask-benchmark-portfolio-paired-comparison-report.mjs",
        paired_comparison_report_test_file_sha256: fileSha256("scripts/test-ask-benchmark-portfolio-paired-comparison-report.mjs"),
        directional_outcome_report_schema_path: "benchmarks/schemas/portfolio-directional-outcome-report.schema.json",
        directional_outcome_report_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-directional-outcome-report.schema.json"),
        directional_outcome_report_implementation_path: "scripts/ask-benchmark-portfolio-directional-outcome-report.mjs",
        directional_outcome_report_implementation_file_sha256: fileSha256("scripts/ask-benchmark-portfolio-directional-outcome-report.mjs"),
        directional_outcome_report_test_path: "scripts/test-ask-benchmark-portfolio-directional-outcome-report.mjs",
        directional_outcome_report_test_file_sha256: fileSha256("scripts/test-ask-benchmark-portfolio-directional-outcome-report.mjs"),
        mechanism_scorecard_schema_path: "benchmarks/schemas/portfolio-mechanism-scorecard.schema.json",
        mechanism_scorecard_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-mechanism-scorecard.schema.json"),
        mechanism_scorecard_implementation_path: "scripts/ask-benchmark-portfolio-mechanism-scorecard.mjs",
        mechanism_scorecard_implementation_file_sha256: fileSha256("scripts/ask-benchmark-portfolio-mechanism-scorecard.mjs"),
        mechanism_scorecard_test_path: "scripts/test-ask-benchmark-portfolio-mechanism-scorecard.mjs",
        mechanism_scorecard_test_file_sha256: fileSha256("scripts/test-ask-benchmark-portfolio-mechanism-scorecard.mjs"),
        aggregate_result_schema_path: "benchmarks/schemas/portfolio-aggregate-result.schema.json",
        aggregate_result_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-aggregate-result.schema.json"),
        aggregate_result_implementation_path: "scripts/ask-benchmark-portfolio-aggregate-result.mjs",
        aggregate_result_implementation_file_sha256: fileSha256("scripts/ask-benchmark-portfolio-aggregate-result.mjs"),
        aggregate_result_test_path: "scripts/test-ask-benchmark-portfolio-aggregate-result.mjs",
        aggregate_result_test_file_sha256: fileSha256("scripts/test-ask-benchmark-portfolio-aggregate-result.mjs"),
        legacy_calibration_migration_schema_path: "benchmarks/schemas/portfolio-legacy-calibration-migration.schema.json",
        legacy_calibration_migration_schema_file_sha256: fileSha256("benchmarks/schemas/portfolio-legacy-calibration-migration.schema.json"),
        legacy_calibration_migration_implementation_path: "scripts/ask-benchmark-portfolio-legacy-calibration-migration.mjs",
        legacy_calibration_migration_implementation_file_sha256: fileSha256("scripts/ask-benchmark-portfolio-legacy-calibration-migration.mjs"),
        legacy_calibration_migration_test_path: "scripts/test-ask-benchmark-portfolio-legacy-calibration-migration.mjs",
        legacy_calibration_migration_test_file_sha256: fileSha256("scripts/test-ask-benchmark-portfolio-legacy-calibration-migration.mjs"),
        // These are pre-existing public authority identities. Keep them opaque so
        // result-blind preregistration checks never need to read measured bytes.
        legacy_calibration_sources: frozenLegacyCalibrationSources,
        legacy_calibration_migrations: frozenLegacyCalibrationMigrations,
        scoring_issue: 197,
        scoring_slice: "deterministic_aggregate_reporting",
        scoring_implemented: true,
        result_set_authority_implemented: true,
        unweighted_repetition_reporting_implemented: true,
        paired_comparison_reporting_implemented: true,
        directional_win_loss_tie_reporting_implemented: true,
        mechanism_observation_scorecard_implemented: true,
        aggregate_reporting_implemented: true,
        legacy_calibration_compatibility_migration_implemented: true,
        comparative_or_weighted_reporting_implemented: true,
        weighted_reporting_implemented: true,
        measured_aggregate_authority_implemented: false,
      },
      portfolio_design_admission: {
        issue: 205,
        checkpoint: "design_pre_admission",
        design_revision: portfolioDesignManifest.manifest_revision,
        lifecycle_state: portfolioDesignManifest.design_lifecycle_state,
        bound_policy_revision: portfolioDesignManifest.policy_revision,
        design_manifest_path: "benchmarks/portfolio-design-admission-manifest.json",
        design_manifest_file_sha256: fileSha256("benchmarks/portfolio-design-admission-manifest.json"),
        design_manifest_digest: portfolioDesignManifest.manifest_digest,
        design_record_count: portfolioDesignManifest.primary_fixture_count,
        review_package_path: "benchmarks/portfolio-design-review-package.json",
        review_package_file_sha256: fileSha256("benchmarks/portfolio-design-review-package.json"),
        review_package_digest: portfolioDesignReviewPackage.package_digest,
        reviewer_status: portfolioDesignReviewPackage.review_status_constraint.generated_status,
      },
      portfolio_design_review: {
        issue: 205,
        checkpoint: "independent_design_review",
        review_revision: portfolioIndependentDesignReview.review_revision,
        reviewed_head_sha: portfolioIndependentDesignReview.reviewed_input.reviewed_head_sha,
        reviewer_identity: portfolioIndependentDesignReview.reviewer_identity,
        reviewer_class: portfolioIndependentDesignReview.reviewer_class,
        human_review: portfolioIndependentDesignReview.human_review,
        independent_review_path: "benchmarks/portfolio-design-independent-review.json",
        independent_review_file_sha256: fileSha256("benchmarks/portfolio-design-independent-review.json"),
        independent_review_digest: portfolioIndependentDesignReview.review_record_digest,
        reviewed_state_path: "benchmarks/portfolio-design-reviewed-state.json",
        reviewed_state_file_sha256: fileSha256("benchmarks/portfolio-design-reviewed-state.json"),
        reviewed_state_digest: portfolioDesignReviewedState.projection_digest,
        projected_state: portfolioDesignReviewedState.projected_state,
        final_admission_implied: portfolioDesignReviewedState.final_admission_implied,
        implementation_authorized: portfolioDesignReviewedState.implementation_authorized,
      },
      prompt_v2_preregistration: {
        issue: 234,
        execution_issue: 235,
        phase: "pre_result",
        protocol: {
          path: "benchmarks/protocol-prompt-v2.md",
          file_sha256: fileSha256("benchmarks/protocol-prompt-v2.md"),
          raw_digest: promptV2Preregistration.protocol.raw_byte_digest,
        },
        preregistration: {
          path: "benchmarks/prompt-v2-preregistration.json",
          file_sha256: fileSha256("benchmarks/prompt-v2-preregistration.json"),
          preregistration_id: promptV2Preregistration.preregistration_id,
          preregistration_digest: promptV2Preregistration.preregistration_digest,
          expected_case_count: promptV2Preregistration.expected_case_count,
          prompt_roles: promptV2Preregistration.prompt_roles,
        },
        source_archive: {
          revision: promptV2Summary.source_revision,
          tree: promptV2Summary.source_tree,
          rendered_root: promptV2Binding.source.rendered_source_root,
          rendered_inventory_digest: promptV2Binding.source.rendered_source_inventory_digest,
        },
        generated_authority: {
          binding_path: "docs/fixtures/prompt-v2-preregistration/binding.json",
          binding_file_sha256: fileSha256("docs/fixtures/prompt-v2-preregistration/binding.json"),
          binding_digest: promptV2Summary.binding_digest,
          reference_path: "docs/fixtures/prompt-v2-preregistration/reference.json",
          reference_file_sha256: fileSha256("docs/fixtures/prompt-v2-preregistration/reference.json"),
          reference_digest: promptV2Summary.reference_digest,
          registry_snapshot_digest: promptV2Summary.registry_snapshot_digest,
          store_root: "docs/fixtures/prompt-v2-preregistration/store",
          object_count: promptV2Summary.object_count,
          object_inventory_digest: promptV2Summary.object_inventory_digest,
        },
        schemas: [
          "benchmarks/schemas/prompt-v2-preregistration.schema.json",
          "benchmarks/schemas/prompt-v2-execution-plan.schema.json",
          "benchmarks/schemas/prompt-v2-materialization-manifest.schema.json",
          "benchmarks/schemas/prompt-v2-resume-state.schema.json",
          "benchmarks/schemas/prompt-v2-normalized-result.schema.json",
          "benchmarks/schemas/prompt-v2-comparison-report.schema.json",
        ].map((path) => ({ path, file_sha256: fileSha256(path) })),
        implementations: [
          "scripts/ask-benchmark-prompt-v2.mjs",
          "scripts/test-ask-benchmark-prompt-v2.mjs",
          "scripts/prompt-v2-preregistration-samples.mjs",
          "scripts/test-prompt-v2-preregistration-samples.mjs",
        ].map((path) => ({ path, file_sha256: fileSha256(path) })),
        adapter_tracks: promptV2Reference.adapters.map((adapter) => ({
          adapter_track: adapter.adapter_track,
          selector_adapter: adapter.selector_adapter,
          baseline_asset_record_digest: adapter.baseline_asset.record_digest,
          candidate_asset_record_digest: adapter.candidate_asset.record_digest,
          baseline_selection_digest: adapter.baseline_selection.selection_digest,
          challenger_selection_digest: adapter.challenger_selection.selection_digest,
          candidate_digest: adapter.evolution.candidate_digest,
          experiment_digest: adapter.evolution.experiment_digest,
        })),
        handoff_path: "docs/prompt-v2-execution-handoff.md",
        boundaries: {
          measured_execution_authorized: false,
          results_accessed: promptV2Summary.results_accessed,
          runtime_activation_implied: promptV2Summary.runtime_activation_implied,
          recommendation_created: false,
          lifecycle_mutation_authorized: false,
          private_evaluator_content_included: false,
        },
      },
      portfolio_fixture_admission: {
        issue: 207,
        checkpoint: "first_vertical_fixture",
        fixture_id: mnBuildOptionMetadata.fixture_id,
        fixture_root: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update",
        runtime_config_path: "benchmarks/adaptive-portfolio.config.json",
        runtime_config_file_sha256: fileSha256("benchmarks/adaptive-portfolio.config.json"),
        input_manifest_path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/input-manifest.json",
        input_manifest_file_sha256: fileSha256("benchmarks/fixtures/checkpoint-b2/mn-build-option-update/input-manifest.json"),
        fixture_input_digest: mnBuildOptionReference.fixture_input_digest,
        metadata_path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/metadata.json",
        metadata_file_sha256: fileSha256("benchmarks/fixtures/checkpoint-b2/mn-build-option-update/metadata.json"),
        metadata_digest: mnBuildOptionMetadata.metadata_digest,
        evaluator_reference_path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-reference.json",
        evaluator_reference_file_sha256: fileSha256("benchmarks/fixtures/checkpoint-b2/mn-build-option-update/evaluator-reference.json"),
        evaluator_reference_digest: mnBuildOptionReference.public_metadata_digest,
        evaluator_bundle_id: mnBuildOptionReference.evaluator_bundle_id,
        evaluator_bundle_digest: mnBuildOptionReference.evaluator_bundle_digest,
        evaluator_byte_count: mnBuildOptionMetadata.evaluator_byte_count,
        requirement_record_path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/requirement-record.json",
        requirement_record_file_sha256: fileSha256("benchmarks/fixtures/checkpoint-b2/mn-build-option-update/requirement-record.json"),
        requirement_record_id: mnBuildOptionRequirement.requirement_record_id,
        requirement_record_digest: mnBuildOptionRequirement.requirement_record_digest,
        output_contract_path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/output-contract.json",
        output_contract_file_sha256: fileSha256("benchmarks/fixtures/checkpoint-b2/mn-build-option-update/output-contract.json"),
        output_contract_id: mnBuildOptionOutput.output_contract_id,
        output_contract_digest: mnBuildOptionOutput.output_contract_digest,
        final_admission_record_path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/final-admission-record.json",
        final_admission_record_file_sha256: fileSha256("benchmarks/fixtures/checkpoint-b2/mn-build-option-update/final-admission-record.json"),
        final_admission_record_digest: mnBuildOptionAdmission.admission_digest,
        scoring_input_freeze_path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/scoring-input-freeze-manifest.json",
        scoring_input_freeze_file_sha256: fileSha256("benchmarks/fixtures/checkpoint-b2/mn-build-option-update/scoring-input-freeze-manifest.json"),
        scoring_input_freeze_digest: mnBuildOptionFreeze.manifest_digest,
        admission_review_path: "benchmarks/fixtures/checkpoint-b2/mn-build-option-update/admission-review.json",
        admission_review_file_sha256: fileSha256("benchmarks/fixtures/checkpoint-b2/mn-build-option-update/admission-review.json"),
        admission_review_digest: mnBuildOptionReview.review_package_digest,
        reviewer_status: mnBuildOptionReview.reviewer_status,
        scoring_ready: false,
        measured_execution_performed: false,
        private_evaluator_included: false,
        validator_path: "scripts/ask-benchmark-mn-build-option-update.mjs",
        validator_file_sha256: fileSha256("scripts/ask-benchmark-mn-build-option-update.mjs"),
        focused_test_path: "scripts/test-ask-benchmark-mn-build-option-update.mjs",
        focused_test_file_sha256: fileSha256("scripts/test-ask-benchmark-mn-build-option-update.mjs"),
      },
    },
  };
}

function serializedBundle() {
  return `${JSON.stringify(buildAdapterRuntimeBundle(), null, 2)}\n`;
}

function adapterProjectionKeys() {
  return Object.keys(buildAdapterProjectionBundle());
}

function adapterProjectionFrom(value) {
  return Object.fromEntries(adapterProjectionKeys().map((key) => [key, value[key]]));
}

function checkedInBundle(path) {
  if (!existsSync(path)) throw new Error(`Adapter runtime bundle is missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeAdapterProjection(path) {
  const current = checkedInBundle(path);
  const projection = buildAdapterProjectionBundle();
  writeFileSync(path, `${JSON.stringify({ ...current, ...projection }, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.checkAdapters) {
      const current = adapterProjectionFrom(checkedInBundle(args.output));
      const expected = buildAdapterProjectionBundle();
      if (JSON.stringify(current) !== JSON.stringify(expected)) {
        console.error(`Adapter-owned runtime bundle projection is stale: ${args.output}`);
        process.exitCode = 1;
      } else {
        console.log("Adapter-owned runtime bundle projection is current");
      }
    } else if (args.writeAdapters) {
      writeAdapterProjection(args.output);
      console.log(`Adapter-owned runtime bundle projection written: ${args.output}`);
    } else if (args.check) {
      const content = serializedBundle();
      if (!existsSync(args.output) || readFileSync(args.output, "utf8") !== content) {
        console.error(`Adapter runtime bundle is missing or stale: ${args.output}`);
        process.exitCode = 1;
      } else {
        console.log("Adapter runtime bundle is current");
      }
    } else if (args.write) {
      const content = serializedBundle();
      writeFileSync(args.output, content);
      console.log(`Adapter runtime bundle written: ${args.output}`);
    } else {
      process.stdout.write(serializedBundle());
    }
  } catch (error) {
    console.error(`adapter-runtime-bundle failed: ${error.message}`);
    process.exitCode = 1;
  }
}
