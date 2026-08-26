#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  registerAsset,
  resolveAsset,
  verifyAssetRegistry,
} from "./asset-registry.mjs";
import {
  canonicalDigest,
  listContentAddressedJson,
  readContentAddressedJson,
  readJsonFileStrict,
} from "./content-addressed-store.mjs";
import {
  applyApprovedEvolutionPortfolioAction,
  buildEvolutionCandidate,
  buildEvolutionExperiment,
  buildEvolutionHumanDecision,
  deriveEvolutionActionProposal,
  deriveEvolutionRecommendation,
  publishEvolutionActionProposal,
  publishEvolutionCandidate,
  publishEvolutionExperiment,
  publishEvolutionHumanDecision,
  publishEvolutionRecommendation,
  verifyEvolutionClosure,
} from "./evolution-loop.mjs";
import {
  applyPortfolioTransitions,
  buildPortfolioAuthorityContext,
  buildPortfolioSelectionContext,
  computePortfolioSelectionBasisDigest,
  createEmptyPortfolioLock,
  publishPortfolioManifest,
  resolvePortfolioSelection,
  verifyPortfolioLock,
  verifyPortfolioSelection,
} from "./portfolio-manager.mjs";
import {
  attestVerificationEvidence,
  buildVerificationRequirements,
  putVerificationEvidence,
  reuseIdentityFromEvidence,
  verificationCommandIdentity,
} from "./verification-evidence.mjs";

const REPOSITORY_ID = "github.com/ist-h-i/agent-spectrum-kernel";
const SCOPE_ID = "agent-spectrum-kernel";
const SOURCE_REVISION = "58b21338c0378a2f8ea8e955979eaa5041ac098e";
const PARENT_SOURCE_PATH = "adapters/codex/prompts/skill-verify.md";
const CANDIDATE_SOURCE_PATH = "docs/evolution-loop-sample-prompt-candidate.md";
const FOUNDATION_STABLE_ID = "ask.prompt-template.codex.skill-verify";
const SAMPLE_STABLE_ID = "ask.prompt-template.issue278.evolution-sample";
const BASELINE_VERSION = "278.0.0-baseline";
const CANDIDATE_VERSION = "278.0.0-candidate";
const TASK_CLASS = "implementation";
const MODEL = "gpt-5.6-sol";
const ADAPTER = "codex";
const STACK = "node";
const DOMAIN = "software-engineering";
const RISK_CLASS = "normal";
const CAPABILITY = "repository.read";
const OPERATION_SCOPE = "local_repository";
const BASE_PORTFOLIO_ID = "ask.portfolio.issue278.sample-runtime";
const CHALLENGER_PORTFOLIO_ID = "ask.portfolio.issue278.sample-evaluation";
const ORIGINAL_PORTFOLIO_OBJECT_COUNT = 21;

const repositoryRoot = resolve(import.meta.dirname, "..");
const portfolioFixtureRoot = resolve(repositoryRoot, "docs/fixtures/portfolio-manager");
const portfolioFixtureStoreRoot = resolve(portfolioFixtureRoot, "store");
const portfolioReferencePath = resolve(portfolioFixtureRoot, "reference.json");
const fixtureRoot = resolve(repositoryRoot, "docs/fixtures/evolution-loop");
const fixtureStoreRoot = resolve(fixtureRoot, "store");
const fixtureReferencePath = resolve(fixtureRoot, "reference.json");
const TREE_DIGEST = canonicalDigest({
  source_revision: SOURCE_REVISION,
  git_tree: gitText(["rev-parse", `${SOURCE_REVISION}^{tree}`]),
});
const fixtureProducerPrivateKey = createPrivateKey({
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    createHash("sha256").update("issue-278-evolution-loop-fixture-producer-v1").digest(),
  ]),
  format: "der",
  type: "pkcs8",
});

function gitBytes(path) {
  return execFileSync("git", ["show", `${SOURCE_REVISION}:${path}`], {
    cwd: repositoryRoot,
    encoding: null,
  });
}

function gitText(args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function exactAssetRef(asset) {
  return {
    asset_type: asset.asset_type,
    stable_id: asset.stable_id,
    version: asset.version,
    record_digest: asset.record_digest,
    content_digest: asset.content_digest,
  };
}

function exactPortfolioRef(publication) {
  return {
    portfolio_id: publication.portfolio_id,
    revision: publication.revision,
    manifest_digest: publication.manifest_digest,
    asset_set_digest: publication.asset_set_digest,
  };
}

function lockedPortfolioRef(publication, lockDigest) {
  return { ...exactPortfolioRef(publication), lock_digest: lockDigest };
}

function manifestTransition(publication, fromState, toState) {
  return { manifest: exactPortfolioRef(publication), from_state: fromState, to_state: toState };
}

function bounded(included) {
  return { status: "bounded", included, excluded: [] };
}

function selectors() {
  return {
    task_classes: bounded([TASK_CLASS]),
    projects: bounded([REPOSITORY_ID]),
    models: bounded([MODEL]),
    adapters: bounded([ADAPTER]),
    stacks: bounded([STACK]),
    domains: bounded([DOMAIN]),
    capabilities: bounded([CAPABILITY]),
    risk_classes: bounded([RISK_CLASS]),
  };
}

function selectionContextAllowlist() {
  return {
    task_classes: [TASK_CLASS],
    projects: [REPOSITORY_ID],
    models: [MODEL],
    adapters: [ADAPTER],
    stacks: [STACK],
    domains: [DOMAIN],
    risk_classes: [RISK_CLASS],
    capabilities: [CAPABILITY],
    operation_scopes: [OPERATION_SCOPE],
  };
}

function metadataAuthority() {
  const identity = {
    kind: "deterministic_local_fixture_metadata_authority",
    authority_id: "issue-278-sample-eligibility-metadata",
    authority_revision: SOURCE_REVISION,
    scope: "fixture_selection_eligibility_only",
  };
  return {
    ...identity,
    authority_evidence_digest: canonicalDigest(identity),
    scoring_evidence_implied: false,
    quality_evidence_implied: false,
    effectiveness_implied: false,
    production_eligibility_implied: false,
  };
}

function sampleDescriptor({ sourcePath, version, parent, metadata }) {
  const sourceBytes = readFileSync(resolve(repositoryRoot, sourcePath));
  const evidenceRef = `issue-278:fixture-eligibility:${metadata.authority_evidence_digest}`;
  const isBaseline = version === BASELINE_VERSION;
  return {
    schema_version: "1.0.0",
    asset_type: "prompt",
    stable_id: SAMPLE_STABLE_ID,
    version,
    version_scheme: "semantic",
    type_extension: {
      kind: "prompt_template",
      adapter: ADAPTER,
      entrypoint: sourcePath,
      rendered_runtime_content: false,
    },
    content: {
      package_format: "canonical_json_base64_files",
      files: [{
        path: sourcePath,
        media_type: "text/markdown; charset=utf-8",
        raw_digest: rawDigest(sourceBytes),
      }],
    },
    source: { kind: "git_repository", repository_id: REPOSITORY_ID, revision: SOURCE_REVISION },
    provenance: {
      origin: "repository_file",
      license: { status: "unknown", spdx_id: null, evidence_ref: null },
      owner: { status: "unknown", owner_id: null, evidence_ref: null },
    },
    derivation: isBaseline
      ? { kind: "root", parent: null, delta: null }
      : {
          kind: "full_content_revision",
          parent: exactAssetRef(parent),
          delta: {
            kind: "replacement",
            summary: "Replace the immediate sample baseline with the bounded Issue 278 sample candidate bytes.",
          },
        },
    dependencies: isBaseline
      ? [...structuredClone(parent.record.dependencies), exactAssetRef(parent)]
      : structuredClone(parent.record.dependencies),
    compatibility: { asset_contract_versions: ["1.0.0"], runtime_profiles: [] },
    applicability: {
      models: bounded([MODEL]),
      adapters: bounded([ADAPTER]),
      stacks: bounded([STACK]),
      domains: bounded([DOMAIN]),
      projects: bounded([REPOSITORY_ID]),
      task_classes: bounded([TASK_CLASS]),
      included_scopes: [OPERATION_SCOPE],
      excluded_scopes: [],
      required_capabilities: [CAPABILITY],
      notes: ["deterministic local Issue 278 contract fixture only"],
    },
    permissions_and_effects: {
      status: "supported",
      requested_permissions: [CAPABILITY],
      possible_effects: ["read_repository"],
      permission_refs: [evidenceRef],
      effect_refs: [evidenceRef],
    },
    safety: {
      status: "supported",
      classifications: ["local_contract_fixture_only"],
      constraint_refs: [evidenceRef],
    },
    mechanism_and_evidence: {
      status: "not_evaluated",
      mechanism_refs: [],
      evidence_refs: [],
    },
    evaluation_history: { status: "not_evaluated", evidence_refs: [], cost: null },
    maintenance: {
      stale_status: "fresh",
      refresh_conditions: ["source_revision_or_fixture_contract_changes"],
      regression_refs: [],
      retirement: null,
      rollback: {
        status: "requires_explicit_authority",
        target: isBaseline ? null : exactAssetRef(parent),
        authority_ref: null,
      },
    },
  };
}

function portfolioEntry({ entryId, asset, role, assuranceLane, exposure, evidenceRequirementIds = [] }) {
  const known = (value) => ({ status: "known", value });
  return {
    entry_id: entryId,
    role,
    assurance_lane: assuranceLane,
    asset: exactAssetRef(asset),
    expected_registry_state: "candidate",
    expected_scope_id: SCOPE_ID,
    selectors: selectors(),
    exposure,
    prohibited_task_classes: [],
    activation_requirement: "portfolio_activation",
    evidence_requirement_ids: evidenceRequirementIds,
    cost_estimate: {
      token_count: known(10),
      duration_ms: known(10),
      cost_microunits: known(10),
    },
    failure_actions: {
      inapplicable: "bypass",
      capability_missing: "downgrade",
      prohibited_task: "stop",
      evidence_missing: "bypass",
      evidence_stale: "downgrade",
      evidence_conflict: "stop",
      safety_unknown: "downgrade",
    },
  };
}

function manifestDraft({ portfolioId, revision, registry, entry, rollbackTarget = null, benchmarkCondition }) {
  const unbounded = () => ({ status: "unbounded", maximum: null });
  return {
    schema_version: "1.0.0",
    object_kind: "portfolio_manifest",
    portfolio_id: portfolioId,
    revision,
    source_revision: SOURCE_REVISION,
    repository_id: REPOSITORY_ID,
    scope_id: SCOPE_ID,
    kernel_foundation: {
      kind: "canonical_kernel",
      source_revision: SOURCE_REVISION,
      source_path: "AGENTS.md",
      content_digest: rawDigest(gitBytes("AGENTS.md")),
    },
    registry: {
      registry_id: registry.registry_id,
      repository_id: registry.repository_id,
      scope_id: registry.scope_id,
      snapshot_revision: registry.snapshot_revision,
      snapshot_digest: registry.snapshot_digest,
    },
    selectors: selectors(),
    selection_context_allowlist: selectionContextAllowlist(),
    entries: [entry],
    evidence_requirements: [],
    selection_policy: {
      portfolio_inapplicable_action: "bypass",
      selector_conflict_action: "stop",
      empty_selection_action: "stop",
    },
    budgets: {
      policy_limits: {
        token_count: unbounded(),
        duration_ms: unbounded(),
        cost_microunits: unbounded(),
      },
      unknown_value_action: "bypass",
      exceeded_action: "stop",
    },
    safety_guardrails: {
      unknown_safety_action: "downgrade",
      high_impact_without_approval_action: "stop",
      prohibited_effects: [],
    },
    unresolved_conflicts: [],
    rollback: {
      mode: rollbackTarget === null ? "none" : "exact",
      target: rollbackTarget,
      required_authority_kind: "external_portfolio_rollback_authority",
    },
    benchmark_compatibility: [{
      condition_id: benchmarkCondition,
      config_path: "benchmarks/adaptive-portfolio.config.json",
      config_digest: rawDigest(gitBytes("benchmarks/adaptive-portfolio.config.json")),
      frozen_results_mutated: false,
    }],
  };
}

function portfolioAuthority({ authorityId, evidenceDigest, revision }) {
  return {
    kind: "external_portfolio_activation_authority",
    authority_id: authorityId,
    authority_revision: String(revision),
    authority_evidence_digest: evidenceDigest,
  };
}

function activateInitialPortfolio({ storeRoot, publication, authorityId }) {
  const empty = createEmptyPortfolioLock({
    storeRoot,
    portfolioId: publication.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  const context = buildPortfolioAuthorityContext({
    portfolioId: publication.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: empty.lock_digest,
    transitions: [manifestTransition(publication, null, "current")],
    authority: portfolioAuthority({
      authorityId,
      evidenceDigest: canonicalDigest({ fixture_authority: authorityId, revision: 1 }),
      revision: 1,
    }),
  });
  const lock = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: empty.lock_digest,
    authorityContext: context,
  });
  return { empty, context, lock };
}

function selectorContext(lockDigest) {
  const known = (value) => ({ status: "known", value });
  return buildPortfolioSelectionContext({
    schema_version: "1.0.0",
    object_kind: "portfolio_selection_context",
    selection_phase: "pre_result",
    portfolio_lock_digest: lockDigest,
    repository_id: REPOSITORY_ID,
    project_id: REPOSITORY_ID,
    source_revision: SOURCE_REVISION,
    tree_digest: TREE_DIGEST,
    task_class: TASK_CLASS,
    model: MODEL,
    adapter: ADAPTER,
    stack: STACK,
    domain: DOMAIN,
    risk_class: RISK_CLASS,
    capabilities: [CAPABILITY],
    operation_scopes: [OPERATION_SCOPE],
    available_budget: {
      token_count: known(1000),
      duration_ms: known(1000),
      cost_microunits: known(1000),
    },
    current_state_refs: [],
  });
}

function selectPortfolio({ storeRoot, lockDigest, portfolioTrust }) {
  const context = selectorContext(lockDigest);
  const resolved = resolvePortfolioSelection({
    storeRoot,
    lockDigest,
    selectorContext: context,
    trustedPortfolioAuthorityContexts: portfolioTrust,
  });
  assert.equal(resolved.selection.decision, "selected");
  assert.equal(resolved.selection.selected_assets.length, 1);
  verifyPortfolioSelection({
    storeRoot,
    selectionObjectDigest: resolved.selection_object_digest,
    selectorContext: context,
    trustedPortfolioAuthorityContexts: portfolioTrust,
  });
  return resolved;
}

function verificationEvidenceDraft({ selectionBasisDigest }) {
  return {
    schema_version: "1.0.0",
    schema_path: "schemas/verification-evidence.schema.json",
    program: "ask_verification_evidence",
    gate: {
      gate_id: "issue-278-sample-canary-gate",
      contract_digest: canonicalDigest({ contract: "issue-278-sample-canary" }),
      category: "test",
    },
    target: {
      repository_id: REPOSITORY_ID,
      target_revision: SOURCE_REVISION,
      tree_digest: TREE_DIGEST,
    },
    consumed_inputs: [{
      kind: "manifest",
      path: "portfolio-selection-basis.json",
      digest: selectionBasisDigest,
    }],
    execution: {
      command: verificationCommandIdentity({
        executable: "node",
        argument_identities: [{
          kind: "public",
          identity_digest: canonicalDigest({ command: "issue-278-sample-canary-contract" }),
        }],
        working_directory: ".",
      }),
      runner: {
        runner_id: "issue-278-local-fixture",
        runner_version: "1.0.0",
        adapter_id: ADAPTER,
        adapter_version: "1.0.0",
        evidence_level: "behavior_verified",
      },
      toolchain: [{ name: "node", version: "24", identity_digest: canonicalDigest({ toolchain: "node-24" }) }],
      environment: {
        os: "portable",
        architecture: "portable",
        identity_digest: canonicalDigest({ environment: "portable-contract-fixture" }),
      },
      terminal: {
        status: "succeeded",
        exit_code: 0,
        duration_ms: 1,
        output_bytes: 0,
        output_digest: rawDigest(Buffer.alloc(0)),
      },
    },
    coverage: {
      obligation_refs: ["issue-278-sample-canary.contract-mechanics-only"],
      explicit_non_coverage: [
        "issue-278-sample-canary.product-effectiveness",
        "issue-278-sample-canary.prompt-v2-materialization",
      ],
    },
    invalidation: { mode: "exact_identity_only", unknown_dependencies_require_rerun: true },
    producer: { kind: "developer" },
    authority: { independent_review_status: "not_independent" },
    privacy: {
      classification: "internal",
      exportability: "exportable",
      raw_prompts_stored: false,
      transcripts_stored: false,
      raw_output_stored: false,
      secrets_stored: false,
      absolute_private_paths_stored: false,
      private_evaluators_stored: false,
      review_archives_stored: false,
    },
  };
}

function bindCanaryEvidence({ storeRoot, draft, entryId }) {
  const requirementId = "issue-278-sample-canary-evidence";
  const bound = structuredClone(draft);
  bound.entries = bound.entries.map((entry) => entry.entry_id === entryId
    ? { ...entry, evidence_requirement_ids: [requirementId] }
    : entry);
  const selectionBasisDigest = computePortfolioSelectionBasisDigest(bound);
  const evidence = attestVerificationEvidence(
    verificationEvidenceDraft({ selectionBasisDigest }),
    { privateKey: fixtureProducerPrivateKey },
  );
  const publication = putVerificationEvidence({ storeRoot, evidence });
  const requirements = buildVerificationRequirements({
    requiredGates: [{
      gate_id: evidence.gate.gate_id,
      reuse_identity: reuseIdentityFromEvidence(evidence),
      required_obligation_refs: structuredClone(evidence.coverage.obligation_refs),
      authority: {
        independent_judgment_required: false,
        accepted_producers: [{
          kind: evidence.producer.kind,
          identity_digest: evidence.producer.identity_digest,
        }],
        accepted_evidence_levels: ["behavior_verified"],
      },
      execution_availability: "available",
    }],
  });
  bound.evidence_requirements = [{
    requirement_id: requirementId,
    entry_ids: [entryId],
    requirements,
    allowed_dispositions: ["reuse_exact"],
    required_current_state_refs: [{ state_id: "repository-tree", state_digest: TREE_DIGEST }],
  }];
  return { draft: bound, evidence, evidenceObjectDigest: publication.evidence_digest };
}

function buildCandidate({ registry, parentAsset, candidateAsset, basePublication, baseLockDigest }) {
  const parentPortfolio = lockedPortfolioRef(basePublication, baseLockDigest);
  return buildEvolutionCandidate({
    schema_version: "1.0.0",
    object_kind: "evolution_candidate",
    candidate_id: "issue-278-local-contract-sample",
    parent_asset: exactAssetRef(parentAsset),
    parent_portfolio: parentPortfolio,
    candidate_asset: exactAssetRef(candidateAsset),
    registry: {
      registry_id: registry.registry_id,
      repository_id: registry.repository_id,
      scope_id: registry.scope_id,
      snapshot_revision: registry.snapshot_revision,
      snapshot_digest: registry.snapshot_digest,
    },
    delta: {
      kind: "full_content_revision",
      summary: "one bounded local sample prompt revision; not Prompt v2",
      delta_digest: canonicalDigest({
        parent: parentAsset.content_digest,
        candidate: candidateAsset.content_digest,
        fixture_only: true,
      }),
    },
    generation: {
      source: "human_authored_revision",
      actor: {
        kind: "human_author",
        actor_id: "issue-278-sample-author",
        authority_evidence_digest: canonicalDigest({ authority: "issue-278-sample-author" }),
      },
    },
    hypothesis: {
      intended_mechanism: "make verification and typed unknown boundaries explicit",
      applicability: "deterministic local contract-test fixture only",
    },
    factors: {
      design: "one_factor",
      changed: [{
        factor_id: "prompt_instruction_content",
        identity_digest: candidateAsset.content_digest,
      }],
      frozen: [
        { factor_id: "model", identity_digest: canonicalDigest({ model: MODEL }) },
        { factor_id: "fixture_set", identity_digest: canonicalDigest({ fixture_ids: ["issue-278-contract-sample"] }) },
      ],
    },
    evaluation_scope: {
      fixture_ids: ["issue-278-contract-sample"],
      task_classes: [TASK_CLASS],
      exclusions: ["product_evidence", "prompt_v2_vertical"],
    },
    assurance_lane: "challenger",
    expected_upside: ["exercise deterministic governed-evolution mechanics"],
    risks: ["synthetic fixture evidence is not effectiveness evidence"],
    retirement_condition: "fixture contract or source identity changes",
    rollback: {
      condition: "sample canary contract verification fails",
      parent_asset: exactAssetRef(parentAsset),
      parent_portfolio: parentPortfolio,
    },
    prohibited_effects: ["external_notification", "production_mutation"],
    authorities: {
      experiment: {
        kind: "external_evolution_experiment_authority",
        authority_id: "issue-278-sample-experiment-authority",
        authority_revision: 1,
        authority_evidence_digest: canonicalDigest({ authority: "issue-278-sample-experiment" }),
      },
      decision: {
        kind: "external_evolution_human_decision_authority",
        authority_id: "issue-278-sample-human-maintainer",
        authority_revision: 1,
        authority_evidence_digest: canonicalDigest({ requirement: "issue-278-sample-human-decision" }),
      },
    },
  });
}

function evolutionRole({ role, publication, lockDigest, selection, asset, registryDigest }) {
  return {
    role,
    portfolio: lockedPortfolioRef(publication, lockDigest),
    registry_snapshot_digest: registryDigest,
    selection_object_digest: selection.selection_object_digest,
    selection_digest: selection.selection.selection_digest,
    selected_asset: exactAssetRef(asset),
  };
}

function buildExperiment({ candidate, candidateObjectDigest, baselineRole, challengerRole, evaluatorAsset }) {
  return buildEvolutionExperiment({
    schema_version: "1.0.0",
    object_kind: "evolution_experiment",
    experiment_id: "issue-278-local-contract-sample-experiment",
    phase: "pre_result",
    results_accessed: false,
    candidate_digest: candidate.candidate_digest,
    candidate_object_digest: candidateObjectDigest,
    roles: { baseline: baselineRole, challenger: challengerRole },
    projection: {
      mode: "fixed_b1_exact",
      baseline_condition: "kernel_only",
      challenger_condition: "adaptive_ask",
      mapping_digest: canonicalDigest({ mapping: "fixture-only-b1", source_revision: SOURCE_REVISION }),
      projection_evidence_digest: canonicalDigest({ provenance: "synthetic-contract-fixture", external: false }),
    },
    protocol: {
      source_revision: SOURCE_REVISION,
      tree_digest: TREE_DIGEST,
      model: MODEL,
      cli: { name: "codex", version: "fixture", identity_digest: canonicalDigest({ cli: "codex-fixture" }) },
      adapter: { name: ADAPTER, version: "fixture", identity_digest: canonicalDigest({ adapter: "codex-fixture" }) },
      fixture_ids: ["issue-278-contract-sample"],
      task_classes: [TASK_CLASS],
      exclusions: structuredClone(candidate.evaluation_scope.exclusions),
      candidate_evaluation_scope_digest: canonicalDigest(candidate.evaluation_scope),
      repetitions: 3,
      evaluator: {
        stable_id: evaluatorAsset.stable_id,
        version: evaluatorAsset.version,
        record_digest: evaluatorAsset.record_digest,
        content_digest: evaluatorAsset.content_digest,
      },
      evaluator_contract_digest: canonicalDigest({ evaluator_contract: "fixture-only" }),
      scoring_policy_digest: canonicalDigest({ scoring_policy: "fixture-only" }),
      thresholds_digest: canonicalDigest({ thresholds: "fixture-only" }),
      weights_digest: canonicalDigest({ weights: "fixture-only" }),
      stop_conditions_digest: canonicalDigest({ stop_conditions: "fixture-only" }),
      privacy_boundary_digest: canonicalDigest({ privacy: "portable-no-raw-output" }),
    },
    causal_design: {
      mode: "one_factor",
      candidate_factors_digest: canonicalDigest(candidate.factors),
      changed_factor_ids: ["prompt_instruction_content"],
      ablation_evidence_digests: [],
    },
    recommendation_policy: {
      rules: [{
        rule_id: "fixture-only-expand-mechanics",
        match: {
          quality: ["improved"],
          safety: ["retained"],
          cost: ["retained"],
          variance: ["retained"],
          mechanism: ["observed"],
          external_outcome: ["unknown"],
        },
        recommendation: "expand",
        decision_scope: "portfolio_canary_only",
      }],
      no_match: "insufficient_evidence",
    },
    action_mapping: [
      { recommendation: "expand", actions: ["adopt_candidate"] },
      { recommendation: "retain", actions: ["retain_current"] },
      { recommendation: "simplify", actions: ["revise_candidate"] },
      { recommendation: "stop", actions: ["reject_candidate"] },
      { recommendation: "insufficient_evidence", actions: ["insufficient_evidence"] },
    ],
    prompt_outcome_mapping: [
      { prompt_outcome: "adopt_prompt_v2", action: "adopt_candidate" },
      { prompt_outcome: "insufficient_evidence", action: "insufficient_evidence" },
      { prompt_outcome: "retain_current", action: "retain_current" },
      { prompt_outcome: "revise_and_repeat", action: "revise_candidate" },
    ],
    authority: structuredClone(candidate.authorities.experiment),
  });
}

function syntheticEvaluationEvidence(experiment) {
  const artifact = (dimension) => canonicalDigest({
    fixture_only: true,
    dimension,
    scenario: "issue-278-expand-adopt-mechanics",
    executed_benchmark_result: false,
    product_evidence: false,
  });
  const dimension = (name, status, conclusion, sourceKind, causalCreditApplied = false) => ({
    status,
    conclusion,
    source_kind: sourceKind,
    artifact_id: `fixture-only-${name}-issue-278`,
    artifact_digest: artifact(name),
    causal_credit_applied: causalCreditApplied,
    factor_ids: causalCreditApplied ? ["prompt_instruction_content"] : [],
  });
  return {
    authority: {
      kind: "external_evolution_evaluation_authority",
      authority_id: "issue-278-synthetic-contract-verifier",
      authority_revision: 1,
      authority_evidence_digest: canonicalDigest({ authority: "issue-278-synthetic-contract-verifier" }),
      experiment_digest: experiment.experiment_digest,
      verification_mode: "full_verifier",
      artifact_inventory_digest: canonicalDigest({
        fixture_only: true,
        artifacts: ["quality", "safety", "cost", "variance", "mechanism", "external_outcome"],
      }),
    },
    dimensions: {
      quality: dimension("quality", "complete", "improved", "portfolio_aggregate_result", true),
      safety: dimension("safety", "complete", "retained", "paired_comparison_report"),
      cost: dimension("cost", "complete", "retained", "paired_comparison_report"),
      variance: dimension("variance", "complete", "retained", "repetition_report"),
      mechanism: dimension("mechanism", "complete", "observed", "mechanism_scorecard"),
      external_outcome: dimension("external-outcome", "insufficient_evidence", "unknown", "external_outcome_report"),
    },
    causal_attribution: {
      status: "supported",
      factor_ids: ["prompt_instruction_content"],
      evidence_digests: [artifact("quality")],
    },
    reason_codes: ["fixture_only_contract_mechanics"],
  };
}

function loadFoundation(storeRoot) {
  const reference = readJsonFileStrict(portfolioReferencePath, "Portfolio Manager fixture reference");
  const contextDigests = [...new Set([
    ...reference.kernel_only.required_portfolio_authority_context_digests,
    ...reference.adaptive_ask.required_portfolio_authority_context_digests,
  ])].sort(compareText);
  const contexts = contextDigests.map((digest) => readContentAddressedJson({ storeRoot, digest }).value);
  verifyPortfolioLock({
    storeRoot,
    lockDigest: reference.kernel_only.lock_digest,
    trustedPortfolioAuthorityContexts: contexts,
  });
  verifyPortfolioLock({
    storeRoot,
    lockDigest: reference.adaptive_ask.lock_digest,
    trustedPortfolioAuthorityContexts: contexts,
  });
  for (const exported of [reference.kernel_only, reference.adaptive_ask]) {
    for (const selectionRef of exported.selections) {
      const context = readContentAddressedJson({
        storeRoot,
        digest: selectionRef.context_object_digest,
      }).value;
      verifyPortfolioSelection({
        storeRoot,
        selectionObjectDigest: selectionRef.selection_object_digest,
        selectorContext: context,
        trustedPortfolioAuthorityContexts: contexts,
      });
    }
  }
  const registry = verifyAssetRegistry({ storeRoot, snapshotDigest: reference.registry_snapshot_digest });
  return { reference, contexts, registry };
}

function sourceIdentity(path) {
  const committed = gitBytes(path);
  const working = readFileSync(resolve(repositoryRoot, path));
  assert.deepEqual(working, committed, `${path} working bytes differ from exact source revision`);
  return { path, raw_digest: rawDigest(committed), byte_length: committed.length };
}

function assertOriginalParentBytes(parentAsset, identity) {
  assert.equal(parentAsset.stable_id, FOUNDATION_STABLE_ID);
  assert.equal(parentAsset.record.content.files.length, 1);
  assert.equal(parentAsset.record.content.files[0].path, identity.path);
  assert.equal(parentAsset.record.content.files[0].raw_digest, identity.raw_digest);
  const packaged = parentAsset.content.files.find(({ path }) => path === identity.path);
  assert.ok(packaged, "original parent content package is missing the exact source path");
  assert.equal(packaged.raw_digest, identity.raw_digest);
  assert.deepEqual(Buffer.from(packaged.bytes_base64, "base64"), gitBytes(identity.path));
}

function generateFixture() {
  const originalInventory = byteInventory(portfolioFixtureStoreRoot);
  assert.equal(originalInventory.size, ORIGINAL_PORTFOLIO_OBJECT_COUNT, "checked Portfolio fixture object count drifted");
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ask-evolution-loop-samples-"));
  const storeRoot = resolve(temporaryRoot, "store");
  cpSync(portfolioFixtureStoreRoot, storeRoot, { recursive: true });
  assertInventorySubsetUnchanged(originalInventory, byteInventory(storeRoot), "initial Portfolio fixture copy");

  const parentSource = sourceIdentity(PARENT_SOURCE_PATH);
  const candidateSource = sourceIdentity(CANDIDATE_SOURCE_PATH);
  const foundation = loadFoundation(storeRoot);
  const originalParentEntry = foundation.registry.assets.find(({ stable_id: stableId }) => stableId === FOUNDATION_STABLE_ID);
  assert.ok(originalParentEntry, "Portfolio foundation Registry is missing the exact parent prompt Asset");
  const originalParent = resolveAsset({
    storeRoot,
    snapshotDigest: foundation.registry.snapshot_digest,
    stableId: originalParentEntry.stable_id,
    version: originalParentEntry.version,
    state: originalParentEntry.state,
  });
  assertOriginalParentBytes(originalParent, parentSource);

  const metadata = metadataAuthority();
  const baselineRegistration = registerAsset({
    storeRoot,
    sourceRoot: repositoryRoot,
    predecessorSnapshotDigest: foundation.registry.snapshot_digest,
    descriptor: sampleDescriptor({
      sourcePath: PARENT_SOURCE_PATH,
      version: BASELINE_VERSION,
      parent: originalParent,
      metadata,
    }),
  });
  const baselineRegistry = verifyAssetRegistry({ storeRoot, snapshotDigest: baselineRegistration.snapshot_digest });
  const sampleBaseline = resolveAsset({
    storeRoot,
    snapshotDigest: baselineRegistry.snapshot_digest,
    stableId: SAMPLE_STABLE_ID,
    version: BASELINE_VERSION,
    state: "candidate",
  });
  assert.equal(sampleBaseline.content_digest, originalParent.content_digest, "source-identical sample baseline changed parent bytes");

  const candidateRegistration = registerAsset({
    storeRoot,
    sourceRoot: repositoryRoot,
    predecessorSnapshotDigest: baselineRegistry.snapshot_digest,
    descriptor: sampleDescriptor({
      sourcePath: CANDIDATE_SOURCE_PATH,
      version: CANDIDATE_VERSION,
      parent: sampleBaseline,
      metadata,
    }),
  });
  const registry = verifyAssetRegistry({ storeRoot, snapshotDigest: candidateRegistration.snapshot_digest });
  const candidateAsset = resolveAsset({
    storeRoot,
    snapshotDigest: registry.snapshot_digest,
    stableId: SAMPLE_STABLE_ID,
    version: CANDIDATE_VERSION,
    state: "candidate",
  });
  assert.notEqual(candidateAsset.content_digest, sampleBaseline.content_digest, "candidate must be the only content-changing child");
  assert.equal(candidateAsset.parent_closure.at(-1)?.record_digest, sampleBaseline.record_digest);

  const evaluatorEntry = registry.assets.find(({ stable_id: stableId }) => stableId === "ask.evaluator-reference.mn-build-option-update");
  assert.ok(evaluatorEntry, "foundation Registry is missing the exact evaluator reference");
  const evaluatorAsset = resolveAsset({
    storeRoot,
    snapshotDigest: registry.snapshot_digest,
    stableId: evaluatorEntry.stable_id,
    version: evaluatorEntry.version,
    state: evaluatorEntry.state,
  });

  const basePublication = publishPortfolioManifest({
    storeRoot,
    draft: manifestDraft({
      portfolioId: BASE_PORTFOLIO_ID,
      revision: "sample-baseline-v1",
      registry,
      entry: portfolioEntry({
        entryId: "sample-baseline-prompt",
        asset: sampleBaseline,
        role: "experimental",
        assuranceLane: "exploratory",
        exposure: { mode: "shadow", canary_percent: null },
      }),
      benchmarkCondition: "kernel_only",
    }),
  });
  const baseScenario = activateInitialPortfolio({
    storeRoot,
    publication: basePublication,
    authorityId: "issue-278-sample-bootstrap-authority",
  });
  const baseTrust = [baseScenario.context];
  const baselineSelection = selectPortfolio({
    storeRoot,
    lockDigest: baseScenario.lock.lock_digest,
    portfolioTrust: baseTrust,
  });

  const challengerPublication = publishPortfolioManifest({
    storeRoot,
    draft: manifestDraft({
      portfolioId: CHALLENGER_PORTFOLIO_ID,
      revision: "sample-challenger-v1",
      registry,
      entry: portfolioEntry({
        entryId: "sample-challenger-prompt",
        asset: candidateAsset,
        role: "experimental",
        assuranceLane: "exploratory",
        exposure: { mode: "shadow", canary_percent: null },
      }),
      benchmarkCondition: "adaptive_ask",
    }),
  });
  const challengerScenario = activateInitialPortfolio({
    storeRoot,
    publication: challengerPublication,
    authorityId: "issue-278-sample-evaluation-portfolio-authority",
  });
  const preResultPortfolioTrust = [baseScenario.context, challengerScenario.context];
  const challengerSelection = selectPortfolio({
    storeRoot,
    lockDigest: challengerScenario.lock.lock_digest,
    portfolioTrust: preResultPortfolioTrust,
  });

  const targetEntryId = "sample-candidate-canary";
  const targetDraft = manifestDraft({
    portfolioId: BASE_PORTFOLIO_ID,
    revision: "sample-candidate-canary-v2",
    registry,
    entry: portfolioEntry({
      entryId: targetEntryId,
      asset: candidateAsset,
      role: "challenger",
      assuranceLane: "challenger",
      exposure: { mode: "canary", canary_percent: 10 },
      evidenceRequirementIds: ["issue-278-sample-canary-evidence"],
    }),
    rollbackTarget: exactPortfolioRef(basePublication),
    benchmarkCondition: "adaptive_ask",
  });
  const targetWithEvidence = bindCanaryEvidence({ storeRoot, draft: targetDraft, entryId: targetEntryId });
  const targetPublication = publishPortfolioManifest({ storeRoot, draft: targetWithEvidence.draft });

  const candidate = buildCandidate({
    registry,
    parentAsset: sampleBaseline,
    candidateAsset,
    basePublication,
    baseLockDigest: baseScenario.lock.lock_digest,
  });
  const candidatePublication = publishEvolutionCandidate({ storeRoot, candidate });
  const experiment = buildExperiment({
    candidate,
    candidateObjectDigest: candidatePublication.object_digest,
    baselineRole: evolutionRole({
      role: "baseline",
      publication: basePublication,
      lockDigest: baseScenario.lock.lock_digest,
      selection: baselineSelection,
      asset: sampleBaseline,
      registryDigest: registry.snapshot_digest,
    }),
    challengerRole: evolutionRole({
      role: "challenger",
      publication: challengerPublication,
      lockDigest: challengerScenario.lock.lock_digest,
      selection: challengerSelection,
      asset: candidateAsset,
      registryDigest: registry.snapshot_digest,
    }),
    evaluatorAsset,
  });
  const experimentPublication = publishEvolutionExperiment({ storeRoot, experiment });
  const evaluationEvidence = syntheticEvaluationEvidence(experiment);
  const recommendation = deriveEvolutionRecommendation({ experiment, evidence: evaluationEvidence });
  assert.equal(recommendation.recommendation, "expand");
  const recommendationPublication = publishEvolutionRecommendation({ storeRoot, recommendation });
  const lifecyclePlan = {
    base_registry_snapshot_digest: registry.snapshot_digest,
    base_portfolio_lock_digest: baseScenario.lock.lock_digest,
    base_current_manifest: exactPortfolioRef(basePublication),
    target_manifest: exactPortfolioRef(targetPublication),
    portfolio_transitions: [
      manifestTransition(basePublication, "current", "superseded"),
      manifestTransition(targetPublication, null, "current"),
    ],
    asset_transitions: [],
    rollback_anchor: exactPortfolioRef(basePublication),
    reason_codes: ["fixture_only_bounded_canary_adoption"],
  };
  const proposal = deriveEvolutionActionProposal({ candidate, experiment, recommendation, lifecyclePlan });
  const proposalPublication = publishEvolutionActionProposal({ storeRoot, proposal });
  const experimentTrust = [candidate.authorities.experiment];
  const humanAuthority = structuredClone(candidate.authorities.decision);
  const decision = buildEvolutionHumanDecision({
    proposal,
    disposition: "approved",
    reasonCodes: ["fixture_only_human_approved_canary_mechanics"],
    authority: humanAuthority,
  });
  const decisionPublication = publishEvolutionHumanDecision({ storeRoot, decision });
  const activationContext = buildPortfolioAuthorityContext({
    portfolioId: BASE_PORTFOLIO_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: baseScenario.lock.lock_digest,
    transitions: lifecyclePlan.portfolio_transitions,
    authority: portfolioAuthority({
      authorityId: humanAuthority.authority_id,
      evidenceDigest: decisionPublication.object_digest,
      revision: 3,
    }),
  });
  const portfolioTrust = [...preResultPortfolioTrust, activationContext];
  const application = applyApprovedEvolutionPortfolioAction({
    storeRoot,
    decisionObjectDigest: decisionPublication.object_digest,
    proposalObjectDigest: proposalPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    portfolioAuthorityContext: activationContext,
    trustedHumanDecisionAuthorities: [decision],
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: [evaluationEvidence],
    trustedPortfolioAuthorityContexts: portfolioTrust,
  });
  verifyEvolutionClosure({
    storeRoot,
    receiptObjectDigest: application.object_digest,
    decisionObjectDigest: decisionPublication.object_digest,
    proposalObjectDigest: proposalPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    trustedHumanDecisionAuthorities: [decision],
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: [evaluationEvidence],
    trustedPortfolioAuthorityContexts: portfolioTrust,
  });

  assertInventorySubsetUnchanged(originalInventory, byteInventory(storeRoot), "generated shared store");
  const artifacts = {
    candidate: { object_digest: candidatePublication.object_digest, semantic_digest: candidate.candidate_digest },
    experiment: { object_digest: experimentPublication.object_digest, semantic_digest: experiment.experiment_digest },
    recommendation: { object_digest: recommendationPublication.object_digest, semantic_digest: recommendation.recommendation_digest },
    action_proposal: { object_digest: proposalPublication.object_digest, semantic_digest: proposal.proposal_digest },
    human_decision: { object_digest: decisionPublication.object_digest, semantic_digest: decision.decision_digest },
    application_receipt: { object_digest: application.object_digest, semantic_digest: application.artifact.receipt_digest },
  };
  const reference = {
    schema_version: "1.0.0",
    program: "ask_evolution_loop_samples",
    source_revision: SOURCE_REVISION,
    tree_digest: TREE_DIGEST,
    fixture_scope: "local_deterministic_contract_test_only",
    source_files: { parent: parentSource, candidate: candidateSource },
    foundation: {
      copied_portfolio_object_count: ORIGINAL_PORTFOLIO_OBJECT_COUNT,
      portfolio_reference: foundation.reference,
      portfolio_authority_contexts: foundation.contexts,
    },
    asset_lineage: {
      original_parent: exactAssetRef(originalParent),
      sample_baseline: exactAssetRef(sampleBaseline),
      sample_candidate: exactAssetRef(candidateAsset),
      registry_snapshot_digest: registry.snapshot_digest,
      original_parent_bytes_preserved: true,
      sample_baseline_content_changed: false,
      candidate_is_only_content_changing_child: true,
      eligibility_metadata_authority: metadata,
      asset_lifecycle_authority_contexts: [],
    },
    pre_result_roles: {
      baseline: experiment.roles.baseline,
      challenger: experiment.roles.challenger,
    },
    artifacts,
    application: {
      gate_evidence_object_digest: targetWithEvidence.evidenceObjectDigest,
      base_portfolio_lock_digest: baseScenario.lock.lock_digest,
      result_portfolio_lock_digest: application.lock_digest,
      rollback_anchor: exactPortfolioRef(basePublication),
    },
    trusted_contexts: {
      experiment: experimentTrust,
      evaluation: [evaluationEvidence],
      human_decision: [decision],
      asset_lifecycle: [],
      portfolio_lifecycle: portfolioTrust,
      high_impact_approval_grants: [],
    },
    contract_closure_meanings: [
      "six_artifact_full_closure_reconstructable",
      "untrusted_evaluation_authority_rejected",
      "untrusted_human_decision_authority_rejected",
      "decision_bound_portfolio_authority_preserves_rollback",
      "completed_receipt_binds_exact_successor_heads",
      "all_six_evolution_publications_are_idempotent",
      "semantic_digest_and_unknown_field_tamper_rejected",
      "missing_human_decision_rejected_before_mutation",
      "wrong_decision_evidence_digest_rejected",
      "stale_portfolio_predecessor_rejected",
      "untrusted_portfolio_activation_authority_rejected",
      "rollback_anchor_drift_rejected",
      "semantic_and_object_digests_remain_distinct",
      "insufficient_evidence_verified_exact_head_noop_without_implicit_retention",
      "evaluation_authority_experiment_transplant_rejected",
      "forged_completed_receipt_reconstruction_rejected",
      "target_portfolio_transplant_rejected",
      "candidate_reserved_experiment_authority_and_scope_closure",
      "evaluation_authority_role_collapse_rejected",
      "unreserved_human_decision_authority_rejected",
      "incomplete_evidence_affirmative_or_retention_mapping_rejected",
      "causal_and_dimension_source_semantics_closed",
    ],
    synthetic_evidence_provenance: {
      fixture_only: true,
      contract_test_scenario: "expand_to_adopt_candidate_mechanics",
      executed_benchmark_result: false,
      real_scoring_result: false,
      production_recommendation: false,
      generalization_allowed: false,
      external_outcome_evidence_present: false,
    },
    prompt_vertical: {
      sample_is_prompt_v2: false,
      status: "typed_stop",
      stop_code: "prompt_v2_materialization_unavailable",
      generic_issue_197_projection_available: false,
    },
    boundaries: {
      prompt_v2_vertical_completed: false,
      product_evidence_implied: false,
      external_outcome_claimed: false,
      autonomous_mutation: false,
      mutable_latest_pointer_used: false,
      frozen_benchmark_results_mutated: false,
    },
  };
  assertPortableReference(reference);
  assertReachableClosureEqualsStore({ storeRoot, reference });
  return {
    temporaryRoot,
    storeRoot,
    reference,
    finalReceiptObjectDigest: application.object_digest,
  };
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function listTree(root) {
  const result = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => compareText(left.name, right.name))) {
      const path = resolve(current, entry.name);
      const relativePath = relative(root, path).split(sep).join("/");
      assert.equal(entry.isSymbolicLink(), false, `fixture symlink is prohibited: ${relativePath}`);
      if (entry.isDirectory()) visit(path);
      else {
        assert.equal(entry.isFile(), true, `unsupported fixture entry: ${relativePath}`);
        result.push(relativePath);
      }
    }
  }
  visit(root);
  return result;
}

function byteInventory(root) {
  return new Map(listTree(root).map((path) => [path, rawDigest(readFileSync(resolve(root, path)))]));
}

function assertInventorySubsetUnchanged(expected, actual, label) {
  assert.equal(expected.size, ORIGINAL_PORTFOLIO_OBJECT_COUNT, `${label}: original inventory count drifted`);
  for (const [path, digest] of expected) assert.equal(actual.get(path), digest, `${label}: ${path} bytes changed`);
}

function assertPortableReference(value, location = "reference") {
  if (typeof value === "string") {
    assert.equal(isAbsolute(value), false, `${location} contains an absolute path`);
    assert.equal(/(?:^|[._-])latest(?:[._-]|$)/iu.test(value), false, `${location} contains a mutable latest label`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPortableReference(entry, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/(?:^|_)latest(?:_|$)/iu.test(key)) assert.equal(entry, false, `${location}.${key} must deny mutable latest use`);
      assert.equal(/timestamp|created_at|updated_at/iu.test(key), false, `${location}.${key} is time-dependent`);
      assertPortableReference(entry, `${location}.${key}`);
    }
  }
}

function collectObjectDigests(value, available, output) {
  if (typeof value === "string") {
    if (available.has(value)) output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectObjectDigests(entry, available, output));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => collectObjectDigests(entry, available, output));
  }
}

function assertReachableClosureEqualsStore({ storeRoot, reference }) {
  const objects = listContentAddressedJson({ storeRoot });
  const byDigest = new Map(objects.map(({ digest, value }) => [digest, value]));
  const reachable = new Set();
  collectObjectDigests(reference, byDigest, reachable);
  const queue = [...reachable];
  while (queue.length > 0) {
    const digest = queue.shift();
    const before = reachable.size;
    collectObjectDigests(byDigest.get(digest), byDigest, reachable);
    if (reachable.size > before) queue.push(...[...reachable].filter((candidate) => !queue.includes(candidate)));
  }
  assert.deepEqual([...reachable].sort(compareText), [...byDigest.keys()].sort(compareText), "Evolution reference reachable closure differs from actual shared CAS objects");
}

function expectedTree(generated) {
  const files = listTree(generated.storeRoot);
  const objectFiles = listContentAddressedJson({ storeRoot: generated.storeRoot })
    .map(({ digest }) => {
      const hex = digest.slice("sha256:".length);
      return `objects/sha256/${hex.slice(0, 2)}/${hex.slice(2)}.json`;
    })
    .sort(compareText);
  assert.deepEqual(files, objectFiles, "Evolution sample store contains files outside the shared CAS object set");
  return [...files.map((path) => `store/${path}`), "reference.json"].sort(compareText);
}

function referenceBytes(reference) {
  return Buffer.from(`${JSON.stringify(reference, null, 2)}\n`, "utf8");
}

function writeFixture(generated) {
  const portfolioBefore = byteInventory(portfolioFixtureStoreRoot);
  const expectedFiles = expectedTree(generated);
  rmSync(fixtureRoot, { recursive: true, force: true });
  for (const relativePath of expectedFiles) {
    const target = resolve(fixtureRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    if (relativePath === "reference.json") writeFileSync(target, referenceBytes(generated.reference));
    else copyFileSync(resolve(generated.storeRoot, relativePath.slice("store/".length)), target);
  }
  verifyCheckedInFixture(generated);
  assert.deepEqual(byteInventory(portfolioFixtureStoreRoot), portfolioBefore, "--write changed the existing Portfolio fixture bytes");
}

function verifyCheckedInFixture(generated) {
  assert.equal(existsSync(fixtureRoot), true, `missing checked-in fixture: ${fixtureRoot}`);
  assert.equal(lstatSync(fixtureRoot).isDirectory(), true, `fixture root is not a directory: ${fixtureRoot}`);
  const expectedFiles = expectedTree(generated);
  assert.deepEqual(listTree(fixtureRoot), expectedFiles, "checked-in Evolution fixture has missing or extra paths");
  for (const relativePath of expectedFiles) {
    const expectedBytes = relativePath === "reference.json"
      ? referenceBytes(generated.reference)
      : readFileSync(resolve(generated.storeRoot, relativePath.slice("store/".length)));
    assert.deepEqual(readFileSync(resolve(fixtureRoot, relativePath)), expectedBytes, `${relativePath} bytes are stale`);
  }
  const checkedReference = readJsonFileStrict(fixtureReferencePath, "Evolution loop fixture reference");
  assert.deepEqual(checkedReference, generated.reference, "checked-in Evolution reference differs from fresh generation");
  assert.equal(
    listContentAddressedJson({ storeRoot: fixtureStoreRoot }).length,
    listContentAddressedJson({ storeRoot: generated.storeRoot }).length,
  );
  assertReachableClosureEqualsStore({ storeRoot: fixtureStoreRoot, reference: checkedReference });
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--write") return "write";
  if (argv.length === 1 && argv[0] === "--check") return "check";
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return "help";
  throw new Error("Usage: node scripts/evolution-loop-samples.mjs --write | --check");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let generated;
  try {
    const mode = parseArgs(process.argv.slice(2));
    if (mode === "help") console.log("Usage: node scripts/evolution-loop-samples.mjs --write | --check");
    else {
      generated = generateFixture();
      if (mode === "write") writeFixture(generated);
      else verifyCheckedInFixture(generated);
      const objectCount = listContentAddressedJson({ storeRoot: generated.storeRoot }).length;
      console.log(`Evolution loop sample fixture ${mode === "write" ? "written" : "is current"}: ${objectCount} objects, receipt ${generated.finalReceiptObjectDigest}`);
    }
  } catch (error) {
    console.error(`evolution-loop-samples failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (generated?.temporaryRoot) rmSync(generated.temporaryRoot, { recursive: true, force: true });
  }
}
