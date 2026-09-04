#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  applyAssetLifecycleTransitions,
  buildAssetLifecycleAuthorityContext,
  createEmptyAssetRegistry,
  registerAsset,
  resolveAsset,
  verifyAssetRegistry,
} from "./asset-registry.mjs";
import { canonicalDigest, putContentAddressedJson } from "./content-addressed-store.mjs";
import {
  applyApprovedEvolutionPortfolioAction,
  buildEvolutionApplicationReceipt,
  buildEvolutionCandidate,
  buildEvolutionExperiment,
  buildEvolutionHumanDecision,
  buildEvolutionRecommendation,
  computeEvolutionApplicationReceiptDigest,
  computeEvolutionHumanDecisionDigest,
  deriveEvolutionActionProposal,
  deriveEvolutionRecommendation,
  publishEvolutionActionProposal,
  publishEvolutionApplicationReceipt,
  publishEvolutionCandidate,
  publishEvolutionExperiment,
  publishEvolutionHumanDecision,
  publishEvolutionRecommendation,
  recordEvolutionNoopReceipt,
  verifyEvolutionActionProposal,
  verifyEvolutionCandidate,
  verifyEvolutionClosure,
  verifyEvolutionExperiment,
  verifyEvolutionHumanDecision,
  verifyEvolutionRecommendation,
} from "./evolution-loop.mjs";
import {
  applyPortfolioTransitions,
  buildPortfolioAuthorityContext,
  buildPortfolioManifest,
  buildPortfolioSelectionContext,
  computePortfolioSelectionBasisDigest,
  createEmptyPortfolioLock,
  publishPortfolioManifest,
  resolvePortfolioSelection,
  verifyPortfolioLock,
} from "./portfolio-manager.mjs";
import {
  attestVerificationEvidence,
  buildVerificationRequirements,
  putVerificationEvidence,
  reuseIdentityFromEvidence,
  verificationCommandIdentity,
} from "./verification-evidence.mjs";

const REPOSITORY_ID = "github.com/ist-h-i/agent-spectrum-kernel";
const REGISTRY_ID = "issue-278-evolution-assets";
const SCOPE_ID = "agent-spectrum-kernel";
const SOURCE_REVISION = "88e34a7591fd9b61122f377c464fdc232fc4f6e0";
const TREE_DIGEST = digest("issue-278-integration-tree");
const TASK_CLASS = "implementation";
const MODEL = "gpt-5.6-sol";
const ADAPTER = "codex";
const STACK = "node";
const DOMAIN = "software-engineering";
const RISK_CLASS = "normal";
const CAPABILITY = "repository.read";
const OPERATION_SCOPE = "local_repository";
const producerKeys = generateKeyPairSync("ed25519");

let closureCount = 0;

function digest(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function closes(label, action) {
  action();
  closureCount += 1;
  process.stdout.write(`PASS ${label}\n`);
}

function rejects(label, action, pattern) {
  assert.throws(action, pattern, label);
  closureCount += 1;
  process.stdout.write(`PASS ${label}\n`);
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

function assetTransition(asset, fromState, toState) {
  return {
    asset: exactAssetRef(asset),
    from_state: fromState,
    to_state: toState,
  };
}

function assetDimension(included) {
  return { status: "bounded", included, excluded: [] };
}

function writePrompt(sourceRoot, version) {
  const path = `prompts/evolution-${version}.md`;
  const bytes = Buffer.from(`# Evolution ${version}\n\nBounded Issue 278 prompt fixture.\n`, "utf8");
  const target = resolve(sourceRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return { path, raw_digest: rawDigest(bytes) };
}

function assetDescriptor({ sourceFile, version, derivation, rollbackTarget = null }) {
  const evidenceRef = `issue-278:prompt:${version}`;
  return {
    schema_version: "1.0.0",
    asset_type: "prompt",
    stable_id: "ask.prompt-template.issue278.evolution",
    version,
    version_scheme: "semantic",
    type_extension: {
      kind: "prompt_template",
      adapter: ADAPTER,
      entrypoint: sourceFile.path,
      rendered_runtime_content: false,
    },
    content: {
      package_format: "canonical_json_base64_files",
      files: [{
        path: sourceFile.path,
        media_type: "text/markdown; charset=utf-8",
        raw_digest: sourceFile.raw_digest,
      }],
    },
    source: {
      kind: "git_repository",
      repository_id: REPOSITORY_ID,
      revision: SOURCE_REVISION,
    },
    provenance: {
      origin: "repository_file",
      license: { status: "unknown", spdx_id: null, evidence_ref: null },
      owner: { status: "unknown", owner_id: null, evidence_ref: null },
    },
    derivation,
    dependencies: [],
    compatibility: { asset_contract_versions: ["1.0.0"], runtime_profiles: [] },
    applicability: {
      models: assetDimension([MODEL]),
      adapters: assetDimension([ADAPTER]),
      stacks: assetDimension([STACK]),
      domains: assetDimension([DOMAIN]),
      projects: assetDimension([REPOSITORY_ID]),
      task_classes: assetDimension([TASK_CLASS]),
      included_scopes: [OPERATION_SCOPE],
      excluded_scopes: [],
      required_capabilities: [CAPABILITY],
      notes: [],
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
      classifications: [],
      constraint_refs: [evidenceRef],
    },
    mechanism_and_evidence: {
      status: "supported",
      mechanism_refs: [evidenceRef],
      evidence_refs: [evidenceRef],
    },
    evaluation_history: {
      status: "supported",
      evidence_refs: [evidenceRef],
      cost: null,
    },
    maintenance: {
      stale_status: "fresh",
      refresh_conditions: [],
      regression_refs: [],
      retirement: null,
      rollback: {
        status: "requires_explicit_authority",
        target: rollbackTarget,
        authority_ref: null,
      },
    },
  };
}

function assetAuthority({ predecessorSnapshotDigest, transitions, revision }) {
  return buildAssetLifecycleAuthorityContext({
    registryId: REGISTRY_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorSnapshotDigest,
    transitions,
    authority: {
      kind: "external_asset_lifecycle_authority",
      authority_id: "issue-278-asset-maintainer",
      authority_revision: String(revision),
      authority_evidence_digest: digest(`asset-authority:${revision}`),
    },
  });
}

function selectors() {
  const bounded = (included) => ({ status: "bounded", included, excluded: [] });
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
  return {
    manifest: exactPortfolioRef(publication),
    from_state: fromState,
    to_state: toState,
  };
}

function portfolioEntry({ entryId, asset, role, assuranceLane, expectedState, exposure }) {
  const known = (value) => ({ status: "known", value });
  return {
    entry_id: entryId,
    role,
    assurance_lane: assuranceLane,
    asset: exactAssetRef(asset),
    expected_registry_state: expectedState,
    expected_scope_id: SCOPE_ID,
    selectors: selectors(),
    exposure,
    prohibited_task_classes: [],
    activation_requirement: "portfolio_activation",
    evidence_requirement_ids: [],
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

function verificationEvidenceDraft({ gateId, selectionBasisDigest }) {
  return {
    schema_version: "1.0.0",
    schema_path: "schemas/verification-evidence.schema.json",
    program: "ask_verification_evidence",
    gate: {
      gate_id: gateId,
      contract_digest: digest(`${gateId}:contract`),
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
        argument_identities: [{ kind: "public", identity_digest: digest(`${gateId}:command`) }],
        working_directory: ".",
      }),
      runner: {
        runner_id: "issue-278-node",
        runner_version: "1.0.0",
        adapter_id: ADAPTER,
        adapter_version: "1.0.0",
        evidence_level: "behavior_verified",
      },
      toolchain: [{ name: "node", version: "24", identity_digest: digest("node-24") }],
      environment: {
        os: "portable",
        architecture: "portable",
        identity_digest: digest("issue-278-portable-environment"),
      },
      terminal: {
        status: "succeeded",
        exit_code: 0,
        duration_ms: 10,
        output_bytes: 16,
        output_digest: digest(`${gateId}:output`),
      },
    },
    coverage: {
      obligation_refs: [`${gateId}.bounded-canary`],
      explicit_non_coverage: [],
    },
    invalidation: {
      mode: "exact_identity_only",
      unknown_dependencies_require_rerun: true,
    },
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

function bindExactEvidence({ storeRoot, draft, entryId, gateId }) {
  const requirementId = `${gateId}.requirement`;
  const boundDraft = {
    ...structuredClone(draft),
    entries: draft.entries.map((entry) => (
      entry.entry_id === entryId
        ? { ...structuredClone(entry), evidence_requirement_ids: [requirementId] }
        : structuredClone(entry)
    )),
  };
  const selectionBasisDigest = computePortfolioSelectionBasisDigest(boundDraft);
  const evidence = attestVerificationEvidence(
    verificationEvidenceDraft({ gateId, selectionBasisDigest }),
    { privateKey: producerKeys.privateKey },
  );
  putVerificationEvidence({ storeRoot, evidence });
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
  return {
    ...boundDraft,
    evidence_requirements: [{
      requirement_id: requirementId,
      entry_ids: [entryId],
      requirements,
      allowed_dispositions: ["reuse_exact"],
      required_current_state_refs: [{ state_id: "repository-tree", state_digest: TREE_DIGEST }],
    }],
  };
}

function manifestDraft({ portfolioId, revision, registry, entry, rollbackTarget = null }) {
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
      content_digest: digest("issue-278-kernel-foundation"),
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
      condition_id: "adaptive_ask",
      config_path: "benchmarks/adaptive-portfolio.config.json",
      config_digest: digest("issue-278-frozen-config"),
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

function activateInitialPortfolio({ storeRoot, publication, assetTrust, authorityId }) {
  const empty = createEmptyPortfolioLock({
    storeRoot,
    portfolioId: publication.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  const authorityContext = buildPortfolioAuthorityContext({
    portfolioId: publication.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: empty.lock_digest,
    transitions: [manifestTransition(publication, null, "current")],
    authority: portfolioAuthority({
      authorityId,
      evidenceDigest: digest(`${authorityId}:initial`),
      revision: 1,
    }),
  });
  const lock = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: empty.lock_digest,
    authorityContext,
    trustedAssetAuthorityContexts: assetTrust,
  });
  return { empty, authorityContext, lock };
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

function selectPortfolio({ storeRoot, lockDigest, portfolioTrust, assetTrust }) {
  const resolved = resolvePortfolioSelection({
    storeRoot,
    lockDigest,
    selectorContext: selectorContext(lockDigest),
    trustedPortfolioAuthorityContexts: portfolioTrust,
    trustedAssetAuthorityContexts: assetTrust,
  });
  assert.equal(resolved.selection.decision, "selected");
  assert.equal(resolved.selection.selected_assets.length, 1);
  return resolved;
}

function buildCandidate({ registry, parentAsset, candidateAsset, basePublication, baseLockDigest }) {
  const parentPortfolio = lockedPortfolioRef(basePublication, baseLockDigest);
  return buildEvolutionCandidate({
    schema_version: "1.0.0",
    object_kind: "evolution_candidate",
    candidate_id: "issue-278-prompt-v2-candidate",
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
      summary: "one bounded Prompt revision",
      delta_digest: digest("issue-278-prompt-v2-delta"),
    },
    generation: {
      source: "human_authored_revision",
      actor: {
        kind: "human_author",
        actor_id: "issue-278-candidate-author",
        authority_evidence_digest: digest("issue-278-candidate-author-evidence"),
      },
    },
    hypothesis: {
      intended_mechanism: "reduce ambiguous verification instructions",
      applicability: "bounded local implementation canary",
    },
    factors: {
      design: "one_factor",
      changed: [{ factor_id: "prompt_instruction_content", identity_digest: digest("prompt-v2-content") }],
      frozen: [
        { factor_id: "model", identity_digest: digest(MODEL) },
        { factor_id: "fixture_set", identity_digest: digest("issue-278-fixture-set") },
      ],
    },
    evaluation_scope: {
      fixture_ids: ["mn-build-option-update"],
      task_classes: [TASK_CLASS],
      exclusions: [],
    },
    assurance_lane: "challenger",
    expected_upside: ["clearer verification boundary"],
    risks: ["additional prompt overhead"],
    retirement_condition: "verified safety regression",
    rollback: {
      condition: "candidate causes a verified regression",
      parent_asset: exactAssetRef(parentAsset),
      parent_portfolio: parentPortfolio,
    },
    prohibited_effects: ["production_mutation", "external_notification"],
    authorities: {
      experiment: {
        kind: "external_evolution_experiment_authority",
        authority_id: "issue-278-experiment-authority",
        authority_revision: 1,
        authority_evidence_digest: digest("issue-278-experiment-authority"),
      },
      decision: {
        kind: "external_evolution_human_decision_authority",
        authority_id: "issue-278-human-maintainer",
        authority_revision: 1,
        authority_evidence_digest: digest("issue-278-human-authority-requirement"),
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

function buildExperiment({ candidate, candidateObjectDigest, baselineRole, challengerRole }) {
  return buildEvolutionExperiment({
    schema_version: "1.0.0",
    object_kind: "evolution_experiment",
    experiment_id: "issue-278-prompt-v2-canary",
    phase: "pre_result",
    results_accessed: false,
    candidate_digest: candidate.candidate_digest,
    candidate_object_digest: candidateObjectDigest,
    roles: { baseline: baselineRole, challenger: challengerRole },
    projection: {
      mode: "fixed_b1_exact",
      baseline_condition: "kernel_only",
      challenger_condition: "adaptive_ask",
      mapping_digest: digest("issue-278-b1-mapping"),
      projection_evidence_digest: digest("issue-278-b1-projection-evidence"),
    },
    protocol: {
      source_revision: SOURCE_REVISION,
      tree_digest: TREE_DIGEST,
      model: MODEL,
      cli: { name: "codex", version: "1.0.0", identity_digest: digest("codex-cli") },
      adapter: { name: ADAPTER, version: "1.0.0", identity_digest: digest("codex-adapter") },
      fixture_ids: ["mn-build-option-update"],
      task_classes: [TASK_CLASS],
      exclusions: structuredClone(candidate.evaluation_scope.exclusions),
      candidate_evaluation_scope_digest: canonicalDigest(candidate.evaluation_scope),
      repetitions: 3,
      evaluator: {
        stable_id: "ask.evaluator-reference.mn-build-option-update",
        version: `git:${SOURCE_REVISION}`,
        record_digest: digest("issue-278-evaluator-record"),
        content_digest: digest("issue-278-evaluator-content"),
      },
      evaluator_contract_digest: digest("issue-278-evaluator-contract"),
      scoring_policy_digest: digest("issue-278-scoring-policy"),
      thresholds_digest: digest("issue-278-thresholds"),
      weights_digest: digest("issue-278-weights"),
      stop_conditions_digest: digest("issue-278-stop-conditions"),
      privacy_boundary_digest: digest("issue-278-privacy-boundary"),
    },
    causal_design: {
      mode: "one_factor",
      candidate_factors_digest: canonicalDigest(candidate.factors),
      changed_factor_ids: ["prompt_instruction_content"],
      ablation_evidence_digests: [],
    },
    recommendation_policy: {
      rules: [{
        rule_id: "bounded-canary-expand",
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

function evaluationEvidence(experiment) {
  const dimension = (status, conclusion, sourceKind, artifactDigest, causalCreditApplied = false) => ({
    status,
    conclusion,
    source_kind: sourceKind,
    artifact_id: `${sourceKind}-issue-278`,
    artifact_digest: artifactDigest,
    causal_credit_applied: causalCreditApplied,
    factor_ids: causalCreditApplied ? ["prompt_instruction_content"] : [],
  });
  return {
    authority: {
      kind: "external_evolution_evaluation_authority",
      authority_id: "issue-278-evaluation-authority",
      authority_revision: 1,
      authority_evidence_digest: digest("issue-278-evaluation-authority"),
      experiment_digest: experiment.experiment_digest,
      verification_mode: "full_verifier",
      artifact_inventory_digest: digest("issue-278-evaluation-artifacts"),
    },
    dimensions: {
      quality: dimension("complete", "improved", "portfolio_aggregate_result", digest("quality"), true),
      safety: dimension("complete", "retained", "paired_comparison_report", digest("safety")),
      cost: dimension("complete", "retained", "paired_comparison_report", digest("cost")),
      variance: dimension("complete", "retained", "repetition_report", digest("variance")),
      mechanism: dimension("complete", "observed", "mechanism_scorecard", digest("mechanism")),
      external_outcome: dimension("insufficient_evidence", "unknown", "external_outcome_report", digest("external")),
    },
    causal_attribution: {
      status: "supported",
      factor_ids: ["prompt_instruction_content"],
      evidence_digests: [digest("quality")],
    },
    reason_codes: ["bounded_canary_evidence_complete"],
  };
}

const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ask-evolution-integration-"));
try {
  const sourceRoot = resolve(temporaryRoot, "source");
  const storeRoot = resolve(temporaryRoot, "store");
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(storeRoot, { recursive: true });

  const parentSource = writePrompt(sourceRoot, "v1");
  const candidateSource = writePrompt(sourceRoot, "v2");
  const emptyRegistry = createEmptyAssetRegistry({
    storeRoot,
    registryId: REGISTRY_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  const parentRegistration = registerAsset({
    storeRoot,
    sourceRoot,
    predecessorSnapshotDigest: emptyRegistry.snapshot_digest,
    descriptor: assetDescriptor({
      sourceFile: parentSource,
      version: "1.0.0",
      derivation: { kind: "root", parent: null, delta: null },
    }),
  });
  const parentCandidate = resolveAsset({
    storeRoot,
    snapshotDigest: parentRegistration.snapshot_digest,
    stableId: "ask.prompt-template.issue278.evolution",
    version: "1.0.0",
    state: "candidate",
  });
  const candidateRegistration = registerAsset({
    storeRoot,
    sourceRoot,
    predecessorSnapshotDigest: parentRegistration.snapshot_digest,
    descriptor: assetDescriptor({
      sourceFile: candidateSource,
      version: "2.0.0",
      derivation: {
        kind: "full_content_revision",
        parent: exactAssetRef(parentCandidate),
        delta: { kind: "replacement", summary: "Replace complete Prompt v1 content with v2." },
      },
      rollbackTarget: exactAssetRef(parentCandidate),
    }),
  });
  const admitAuthority = assetAuthority({
    predecessorSnapshotDigest: candidateRegistration.snapshot_digest,
    transitions: [assetTransition(parentCandidate, "candidate", "admitted")],
    revision: 1,
  });
  const admitted = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: candidateRegistration.snapshot_digest,
    authorityContext: admitAuthority,
  });
  const currentAuthority = assetAuthority({
    predecessorSnapshotDigest: admitted.snapshot_digest,
    transitions: [assetTransition(parentCandidate, "admitted", "current")],
    revision: 2,
  });
  const current = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: admitted.snapshot_digest,
    authorityContext: currentAuthority,
    trustedAuthorityContexts: [admitAuthority],
  });
  const assetTrust = [admitAuthority, currentAuthority];
  const registry = verifyAssetRegistry({
    storeRoot,
    snapshotDigest: current.snapshot_digest,
    trustedAuthorityContexts: assetTrust,
  });
  const parentAsset = resolveAsset({
    storeRoot,
    snapshotDigest: registry.snapshot_digest,
    stableId: "ask.prompt-template.issue278.evolution",
    version: "1.0.0",
    state: "current",
    trustedAuthorityContexts: assetTrust,
  });
  const candidateAsset = resolveAsset({
    storeRoot,
    snapshotDigest: registry.snapshot_digest,
    stableId: "ask.prompt-template.issue278.evolution",
    version: "2.0.0",
    state: "candidate",
    trustedAuthorityContexts: assetTrust,
  });

  const basePublication = publishPortfolioManifest({
    storeRoot,
    draft: manifestDraft({
      portfolioId: "ask.portfolio.issue278.runtime",
      revision: "baseline-v1",
      registry,
      entry: portfolioEntry({
        entryId: "baseline-prompt",
        asset: parentAsset,
        role: "experimental",
        assuranceLane: "exploratory",
        expectedState: "current",
        exposure: { mode: "shadow", canary_percent: null },
      }),
    }),
    trustedAssetAuthorityContexts: assetTrust,
  });
  const baseScenario = activateInitialPortfolio({
    storeRoot,
    publication: basePublication,
    assetTrust,
    authorityId: "issue-278-bootstrap-authority",
  });
  const basePortfolioTrust = [baseScenario.authorityContext];
  const baselineSelection = selectPortfolio({
    storeRoot,
    lockDigest: baseScenario.lock.lock_digest,
    portfolioTrust: basePortfolioTrust,
    assetTrust,
  });

  const challengerPublication = publishPortfolioManifest({
    storeRoot,
    draft: manifestDraft({
      portfolioId: "ask.portfolio.issue278.evaluation",
      revision: "challenger-v1",
      registry,
      entry: portfolioEntry({
        entryId: "challenger-prompt",
        asset: candidateAsset,
        role: "experimental",
        assuranceLane: "exploratory",
        expectedState: "candidate",
        exposure: { mode: "shadow", canary_percent: null },
      }),
    }),
    trustedAssetAuthorityContexts: assetTrust,
  });
  const challengerScenario = activateInitialPortfolio({
    storeRoot,
    publication: challengerPublication,
    assetTrust,
    authorityId: "issue-278-evaluation-portfolio-authority",
  });
  const portfolioTrust = [baseScenario.authorityContext, challengerScenario.authorityContext];
  const challengerSelection = selectPortfolio({
    storeRoot,
    lockDigest: challengerScenario.lock.lock_digest,
    portfolioTrust,
    assetTrust,
  });

  const targetDraft = manifestDraft({
      portfolioId: basePublication.portfolio_id,
      revision: "candidate-canary-v2",
      registry,
      entry: portfolioEntry({
        entryId: "candidate-canary-prompt",
        asset: candidateAsset,
        role: "challenger",
        assuranceLane: "challenger",
        expectedState: "candidate",
        exposure: { mode: "canary", canary_percent: 10 },
      }),
      rollbackTarget: exactPortfolioRef(basePublication),
    });
  const targetPublication = publishPortfolioManifest({
    storeRoot,
    draft: bindExactEvidence({
      storeRoot,
      draft: targetDraft,
      entryId: "candidate-canary-prompt",
      gateId: "issue-278-canary-gate",
    }),
    trustedAssetAuthorityContexts: assetTrust,
  });

  const candidate = buildCandidate({
    registry,
    parentAsset,
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
      asset: parentAsset,
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
  });
  const experimentPublication = publishEvolutionExperiment({ storeRoot, experiment });
  const evidence = evaluationEvidence(experiment);
  const recommendation = deriveEvolutionRecommendation({ experiment, evidence });
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
    reason_codes: ["bounded_canary_adoption"],
  };
  const proposal = deriveEvolutionActionProposal({ candidate, experiment, recommendation, lifecyclePlan });
  const proposalPublication = publishEvolutionActionProposal({ storeRoot, proposal });
  const experimentTrust = [candidate.authorities.experiment];
  const humanAuthority = structuredClone(candidate.authorities.decision);
  const decision = buildEvolutionHumanDecision({
    proposal,
    disposition: "approved",
    reasonCodes: ["human_approved_bounded_canary"],
    authority: humanAuthority,
  });
  const decisionPublication = publishEvolutionHumanDecision({ storeRoot, decision });
  const evaluationTrust = [evidence];
  const humanTrust = [decision];

  const insufficientEvidence = evaluationEvidence(experiment);
  insufficientEvidence.dimensions.quality.conclusion = "retained";
  insufficientEvidence.reason_codes = ["bounded_evidence_does_not_support_expansion"];
  const insufficientRecommendation = deriveEvolutionRecommendation({ experiment, evidence: insufficientEvidence });
  const insufficientRecommendationPublication = publishEvolutionRecommendation({ storeRoot, recommendation: insufficientRecommendation });
  const noOpPlan = {
    base_registry_snapshot_digest: registry.snapshot_digest,
    base_portfolio_lock_digest: baseScenario.lock.lock_digest,
    base_current_manifest: exactPortfolioRef(basePublication),
    target_manifest: exactPortfolioRef(basePublication),
    portfolio_transitions: [],
    asset_transitions: [],
    rollback_anchor: exactPortfolioRef(basePublication),
    reason_codes: ["insufficient_evidence_preserves_current"],
  };
  const insufficientProposal = deriveEvolutionActionProposal({
    candidate,
    experiment,
    recommendation: insufficientRecommendation,
    lifecyclePlan: noOpPlan,
  });
  const insufficientProposalPublication = publishEvolutionActionProposal({ storeRoot, proposal: insufficientProposal });
  const insufficientDecision = buildEvolutionHumanDecision({
    proposal: insufficientProposal,
    disposition: "approved",
    reasonCodes: ["human_approved_no_mutation"],
    authority: humanAuthority,
  });
  const insufficientDecisionPublication = publishEvolutionHumanDecision({ storeRoot, decision: insufficientDecision });

  closes("candidate, experiment, recommendation, proposal, and decision full closure verifies", () => {
    assert.equal(verifyEvolutionCandidate({
      storeRoot,
      candidateObjectDigest: candidatePublication.object_digest,
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    }).candidate.candidate_digest, candidate.candidate_digest);
    assert.equal(verifyEvolutionExperiment({
      storeRoot,
      experimentObjectDigest: experimentPublication.object_digest,
      trustedExperimentAuthorities: experimentTrust,
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    }).experiment.experiment_digest, experiment.experiment_digest);
    assert.equal(verifyEvolutionRecommendation({
      storeRoot,
      recommendationObjectDigest: recommendationPublication.object_digest,
      experimentObjectDigest: experimentPublication.object_digest,
      trustedExperimentAuthorities: experimentTrust,
      trustedEvaluationAuthorities: evaluationTrust,
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    }).recommendation.recommendation, "expand");
    assert.equal(verifyEvolutionActionProposal({
      storeRoot,
      proposalObjectDigest: proposalPublication.object_digest,
      candidateObjectDigest: candidatePublication.object_digest,
      experimentObjectDigest: experimentPublication.object_digest,
      recommendationObjectDigest: recommendationPublication.object_digest,
      trustedExperimentAuthorities: experimentTrust,
      trustedEvaluationAuthorities: evaluationTrust,
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    }).proposal.action, "adopt_candidate");
    assert.equal(verifyEvolutionHumanDecision({
      storeRoot,
      decisionObjectDigest: decisionPublication.object_digest,
      proposalObjectDigest: proposalPublication.object_digest,
      candidateObjectDigest: candidatePublication.object_digest,
      experimentObjectDigest: experimentPublication.object_digest,
      recommendationObjectDigest: recommendationPublication.object_digest,
      trustedHumanDecisionAuthorities: humanTrust,
      trustedExperimentAuthorities: experimentTrust,
      trustedEvaluationAuthorities: evaluationTrust,
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    }).decision.disposition, "approved");
  });

  closes("experiment closure rejects authority, factor, and evaluation-scope drift", () => {
    assert.throws(() => verifyEvolutionExperiment({
      storeRoot,
      experimentObjectDigest: experimentPublication.object_digest,
      trustedExperimentAuthorities: [],
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    }), /trusted exact authority|separately trusted|experiment authority/iu);
    const variants = [
      {
        label: "authority",
        mutate(draft) {
          draft.authority.authority_id = candidate.generation.actor.actor_id;
          draft.authority.authority_evidence_digest = candidate.generation.actor.authority_evidence_digest;
        },
        trust(experimentValue) { return [experimentValue.authority]; },
      },
      {
        label: "authority revision",
        mutate(draft) { draft.authority.authority_revision += 1; },
        trust(experimentValue) { return [experimentValue.authority]; },
      },
      {
        label: "authority evidence",
        mutate(draft) { draft.authority.authority_evidence_digest = digest("unbound-experiment-authority-evidence"); },
        trust(experimentValue) { return [experimentValue.authority]; },
      },
      {
        label: "factor design",
        mutate(draft) {
          draft.causal_design.mode = "factorial_or_ablation_required";
          draft.causal_design.changed_factor_ids.push("unbound_factor");
        },
        trust() { return experimentTrust; },
      },
      {
        label: "factor",
        mutate(draft) { draft.causal_design.changed_factor_ids = ["unbound_factor"]; },
        trust() { return experimentTrust; },
      },
      {
        label: "factor identity",
        mutate(draft) { draft.causal_design.candidate_factors_digest = digest("unbound-factor-identity"); },
        trust() { return experimentTrust; },
      },
      {
        label: "scope",
        mutate(draft) { draft.protocol.fixture_ids = ["scope-not-in-candidate"]; },
        trust() { return experimentTrust; },
      },
      {
        label: "scope digest",
        mutate(draft) { draft.protocol.candidate_evaluation_scope_digest = digest("unbound-evaluation-scope"); },
        trust() { return experimentTrust; },
      },
      {
        label: "scope task class",
        mutate(draft) { draft.protocol.task_classes = ["unbound-task-class"]; },
        trust() { return experimentTrust; },
      },
      {
        label: "scope exclusion",
        mutate(draft) { draft.protocol.exclusions = ["unbound-exclusion"]; },
        trust() { return experimentTrust; },
      },
    ];
    for (const variant of variants) {
      const draft = structuredClone(experiment);
      delete draft.experiment_digest;
      variant.mutate(draft);
      const drifted = buildEvolutionExperiment(draft);
      const published = publishEvolutionExperiment({ storeRoot, experiment: drifted });
      assert.throws(() => verifyEvolutionExperiment({
        storeRoot,
        experimentObjectDigest: published.object_digest,
        trustedExperimentAuthorities: variant.trust(drifted),
        trustedAssetAuthorityContexts: assetTrust,
        trustedPortfolioAuthorityContexts: portfolioTrust,
      }), /candidate.*authority|factor.*candidate|scope.*candidate|fixture.*candidate/iu, variant.label);
    }
  });

  closes("evaluation authority stays separate from candidate generation, experiment, and decision authorities", () => {
    const experimentCollapsed = evaluationEvidence(experiment);
    experimentCollapsed.authority.authority_id = candidate.authorities.experiment.authority_id;
    experimentCollapsed.authority.authority_evidence_digest = digest("collapsed-evaluation:experiment");
    assert.throws(
      () => deriveEvolutionRecommendation({ experiment, evidence: experimentCollapsed }),
      /experiment.*evaluation.*distinct|evaluation.*experiment.*distinct/iu,
    );
    for (const authorityId of [candidate.generation.actor.actor_id, candidate.authorities.decision.authority_id]) {
      const collapsed = evaluationEvidence(experiment);
      collapsed.authority.authority_id = authorityId;
      collapsed.authority.authority_evidence_digest = digest(`collapsed-evaluation:${authorityId}`);
      const collapsedRecommendation = deriveEvolutionRecommendation({ experiment, evidence: collapsed });
      const published = publishEvolutionRecommendation({ storeRoot, recommendation: collapsedRecommendation });
      assert.throws(() => verifyEvolutionRecommendation({
        storeRoot,
        recommendationObjectDigest: published.object_digest,
        experimentObjectDigest: experimentPublication.object_digest,
        trustedExperimentAuthorities: experimentTrust,
        trustedEvaluationAuthorities: [collapsed],
        trustedAssetAuthorityContexts: assetTrust,
        trustedPortfolioAuthorityContexts: portfolioTrust,
      }), /evaluation.*authority.*distinct|generation.*evaluation|decision.*evaluation/iu, authorityId);
    }
  });

  closes("full verifier rejects causal credit on incomplete quality evidence", () => {
    const incompleteExperimentDraft = structuredClone(experiment);
    delete incompleteExperimentDraft.experiment_digest;
    incompleteExperimentDraft.recommendation_policy.rules[0].match.quality = ["unknown"];
    const incompleteExperiment = buildEvolutionExperiment(incompleteExperimentDraft);
    const incompleteExperimentPublication = publishEvolutionExperiment({ storeRoot, experiment: incompleteExperiment });
    const incompleteEvidence = evaluationEvidence(incompleteExperiment);
    incompleteEvidence.dimensions.quality.status = "insufficient_evidence";
    incompleteEvidence.dimensions.quality.conclusion = "unknown";
    const forgedRecommendation = buildEvolutionRecommendation({
      schema_version: "1.0.0",
      object_kind: "evolution_recommendation",
      experiment_digest: incompleteExperiment.experiment_digest,
      candidate_digest: incompleteExperiment.candidate_digest,
      evaluation_authority: structuredClone(incompleteEvidence.authority),
      dimensions: structuredClone(incompleteEvidence.dimensions),
      causal_attribution: structuredClone(incompleteEvidence.causal_attribution),
      recommendation: "expand",
      decision_scope: "portfolio_canary_only",
      reason_codes: structuredClone(incompleteEvidence.reason_codes),
      authority_implied: false,
    });
    const forgedPublication = publishEvolutionRecommendation({ storeRoot, recommendation: forgedRecommendation });
    assert.throws(() => verifyEvolutionRecommendation({
      storeRoot,
      recommendationObjectDigest: forgedPublication.object_digest,
      experimentObjectDigest: incompleteExperimentPublication.object_digest,
      trustedExperimentAuthorities: experimentTrust,
      trustedEvaluationAuthorities: [incompleteEvidence],
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    }), /causal credit.*complete quality|incomplete quality.*causal/iu);
  });

  closes("human decision verifier rejects a trusted but unreserved authority", () => {
    const forged = structuredClone(decision);
    forged.authority = {
      kind: "external_evolution_human_decision_authority",
      authority_id: "unrequired-human-authority",
      authority_revision: 1,
      authority_evidence_digest: digest("unrequired-human-authority"),
    };
    delete forged.decision_digest;
    forged.decision_digest = computeEvolutionHumanDecisionDigest(forged);
    const published = publishEvolutionHumanDecision({ storeRoot, decision: forged });
    assert.throws(() => verifyEvolutionHumanDecision({
      storeRoot,
      decisionObjectDigest: published.object_digest,
      proposalObjectDigest: proposalPublication.object_digest,
      candidateObjectDigest: candidatePublication.object_digest,
      experimentObjectDigest: experimentPublication.object_digest,
      recommendationObjectDigest: recommendationPublication.object_digest,
      trustedHumanDecisionAuthorities: [forged],
      trustedExperimentAuthorities: experimentTrust,
      trustedEvaluationAuthorities: evaluationTrust,
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    }), /required.*decision authority|reserved.*authority|authority.*proposal/iu);
  });

  closes("insufficient evidence records a verified exact-head no-op without implicit retention", () => {
    assert.equal(insufficientRecommendation.recommendation, "insufficient_evidence");
    assert.equal(insufficientProposal.action, "insufficient_evidence");
    const noOpClosure = verifyEvolutionHumanDecision({
      storeRoot,
      decisionObjectDigest: insufficientDecisionPublication.object_digest,
      proposalObjectDigest: insufficientProposalPublication.object_digest,
      candidateObjectDigest: candidatePublication.object_digest,
      experimentObjectDigest: experimentPublication.object_digest,
      recommendationObjectDigest: insufficientRecommendationPublication.object_digest,
      trustedHumanDecisionAuthorities: [insufficientDecision],
      trustedExperimentAuthorities: experimentTrust,
      trustedEvaluationAuthorities: [insufficientEvidence],
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    });
    const noOpReceipt = recordEvolutionNoopReceipt({
      storeRoot,
      closure: noOpClosure,
      baseRegistrySnapshotDigest: registry.snapshot_digest,
      basePortfolioLockDigest: baseScenario.lock.lock_digest,
    });
    const verified = verifyEvolutionClosure({
      storeRoot,
      receiptObjectDigest: noOpReceipt.object_digest,
      decisionObjectDigest: insufficientDecisionPublication.object_digest,
      proposalObjectDigest: insufficientProposalPublication.object_digest,
      candidateObjectDigest: candidatePublication.object_digest,
      experimentObjectDigest: experimentPublication.object_digest,
      recommendationObjectDigest: insufficientRecommendationPublication.object_digest,
      trustedHumanDecisionAuthorities: [insufficientDecision],
      trustedExperimentAuthorities: experimentTrust,
      trustedEvaluationAuthorities: [insufficientEvidence],
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: portfolioTrust,
    });
    assert.deepEqual(verified.receipt.result_heads, verified.receipt.base_heads);
    assert.deepEqual(verified.receipt.steps, []);
  });

  rejects("untrusted evaluation authority is rejected", () => verifyEvolutionRecommendation({
    storeRoot,
    recommendationObjectDigest: recommendationPublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: [],
    trustedAssetAuthorityContexts: assetTrust,
    trustedPortfolioAuthorityContexts: portfolioTrust,
  }), /trusted exact authority|separately trusted|Evolution evaluation/iu);

  closes("evaluation authority cannot be transplanted to another experiment", () => {
    const transplanted = evaluationEvidence(experiment);
    transplanted.authority.experiment_digest = digest("different-experiment");
    assert.throws(
      () => deriveEvolutionRecommendation({ experiment, evidence: transplanted }),
      /evaluation.*experiment|experiment.*binding/iu,
    );
  });

  rejects("untrusted human authority is rejected", () => verifyEvolutionHumanDecision({
    storeRoot,
    decisionObjectDigest: decisionPublication.object_digest,
    proposalObjectDigest: proposalPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    trustedHumanDecisionAuthorities: [],
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: evaluationTrust,
    trustedAssetAuthorityContexts: assetTrust,
    trustedPortfolioAuthorityContexts: portfolioTrust,
  }), /trusted exact authority|separately trusted|human decision/iu);

  const portfolioActivationContext = buildPortfolioAuthorityContext({
    portfolioId: basePublication.portfolio_id,
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
  const allPortfolioTrust = [...portfolioTrust, portfolioActivationContext];
  const application = applyApprovedEvolutionPortfolioAction({
    storeRoot,
    decisionObjectDigest: decisionPublication.object_digest,
    proposalObjectDigest: proposalPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    portfolioAuthorityContext: portfolioActivationContext,
    trustedHumanDecisionAuthorities: humanTrust,
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: evaluationTrust,
    trustedAssetAuthorityContexts: assetTrust,
    trustedPortfolioAuthorityContexts: allPortfolioTrust,
  });

  closes("separate exact decision-bound Portfolio authority applies one canary successor and preserves rollback", () => {
    const verified = verifyPortfolioLock({
      storeRoot,
      lockDigest: application.lock_digest,
      trustedPortfolioAuthorityContexts: allPortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    });
    assert.equal(verified.lock.current_manifest_digest, targetPublication.manifest_digest);
    assert.ok(verified.lock.entries.some((entry) => (
      entry.manifest_digest === basePublication.manifest_digest
        && entry.asset_set_digest === basePublication.asset_set_digest
        && entry.state === "superseded"
    )));
    assert.equal(application.artifact.rollback_anchor.manifest_digest, basePublication.manifest_digest);
    assert.equal(application.artifact.history_preserved, true);
    assert.equal(application.artifact.decision_digest, decision.decision_digest);
  });

  closes("completed receipt closes over exact decision and successor heads", () => {
    const verified = verifyEvolutionClosure({
      storeRoot,
      receiptObjectDigest: application.object_digest,
      decisionObjectDigest: decisionPublication.object_digest,
      proposalObjectDigest: proposalPublication.object_digest,
      candidateObjectDigest: candidatePublication.object_digest,
      experimentObjectDigest: experimentPublication.object_digest,
      recommendationObjectDigest: recommendationPublication.object_digest,
      trustedHumanDecisionAuthorities: humanTrust,
      trustedExperimentAuthorities: experimentTrust,
      trustedEvaluationAuthorities: evaluationTrust,
      trustedAssetAuthorityContexts: assetTrust,
      trustedPortfolioAuthorityContexts: allPortfolioTrust,
    });
    assert.equal(verified.receipt.result_heads.portfolio_lock_digest, application.lock_digest);
  });

  const receiptVariant = (overrides = {}) => buildEvolutionApplicationReceipt({
    ...structuredClone(application.artifact),
    ...structuredClone(overrides),
  });
  const publishReceiptVariant = (overrides = {}) => publishEvolutionApplicationReceipt({
    storeRoot,
    receipt: receiptVariant(overrides),
  });
  const verifyReceiptObject = (receiptObjectDigest, {
    portfolioTrustOverride = allPortfolioTrust,
    assetTrustOverride = assetTrust,
  } = {}) => verifyEvolutionClosure({
    storeRoot,
    receiptObjectDigest,
    decisionObjectDigest: decisionPublication.object_digest,
    proposalObjectDigest: proposalPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    trustedHumanDecisionAuthorities: humanTrust,
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: evaluationTrust,
    trustedAssetAuthorityContexts: assetTrustOverride,
    trustedPortfolioAuthorityContexts: portfolioTrustOverride,
  });
  const portfolioMarker = (status = "pending") => ({
    step_id: "portfolio_commit_marker",
    operation: "verify_portfolio_commit_marker",
    input_digest: application.lock_digest,
    authority_context_digest: application.artifact.steps[0].authority_context_digest,
    output_digest: application.lock_digest,
    status,
  });

  closes("stored non-completed receipts verify exact partial heads and terminal boundaries", () => {
    const pending = publishReceiptVariant({
      state: "pending",
      result_heads: structuredClone(application.artifact.base_heads),
      steps: [{ ...structuredClone(application.artifact.steps[0]), status: "pending" }],
      stop: null,
      next_step: "portfolio_activation",
    });
    assert.equal(verifyReceiptObject(pending.object_digest).receipt.state, "pending");
    const inProgress = publishReceiptVariant({
      state: "in_progress",
      steps: [application.artifact.steps[0], portfolioMarker()],
      stop: null,
      next_step: "portfolio_commit_marker",
    });
    assert.equal(verifyReceiptObject(inProgress.object_digest).receipt.state, "in_progress");
    const stopped = publishReceiptVariant({
      state: "stopped",
      steps: [application.artifact.steps[0], portfolioMarker()],
      stop: { code: "portfolio_activation_authority_required", detail: "Resume after exact authority is supplied." },
      next_step: "portfolio_commit_marker",
    });
    assert.equal(verifyReceiptObject(stopped.object_digest).receipt.state, "stopped");
    const failedBeforeStart = publishReceiptVariant({
      state: "failed",
      result_heads: structuredClone(application.artifact.base_heads),
      steps: [],
      stop: { code: "application_failed", detail: "Failure occurred before the first lifecycle operation." },
      next_step: null,
    });
    assert.equal(verifyReceiptObject(failedBeforeStart.object_digest).receipt.state, "failed");
    const failedAfterPrefix = publishReceiptVariant({
      state: "failed",
      steps: [application.artifact.steps[0], portfolioMarker("failed")],
      stop: { code: "application_failed", detail: "Failure occurred after the verified Portfolio transition." },
      next_step: null,
    });
    assert.equal(verifyReceiptObject(failedAfterPrefix.object_digest).receipt.state, "failed");

    const verifiedAfterApply = publishReceiptVariant({
      state: "in_progress",
      steps: [
        application.artifact.steps[0],
        portfolioMarker("completed"),
        { ...portfolioMarker(), step_id: "portfolio_post_commit_marker" },
      ],
      stop: null,
      next_step: "portfolio_post_commit_marker",
    });
    assert.equal(verifyReceiptObject(verifiedAfterApply.object_digest).receipt.state, "in_progress");

    const driftedMarker = publishReceiptVariant({
      state: "in_progress",
      steps: [
        application.artifact.steps[0],
        { ...portfolioMarker("completed"), authority_context_digest: digest("unrelated-marker-authority") },
        { ...portfolioMarker(), step_id: "portfolio_post_commit_marker" },
      ],
      stop: null,
      next_step: "portfolio_post_commit_marker",
    });
    assert.throws(
      () => verifyReceiptObject(driftedMarker.object_digest),
      /verification marker authority.*verified head/iu,
    );
  });

  closes("stored receipt binds the applied Portfolio authority to the exact proposal and decision", () => {
    const unrelatedAuthorityContext = buildPortfolioAuthorityContext({
      portfolioId: basePublication.portfolio_id,
      repositoryId: REPOSITORY_ID,
      scopeId: SCOPE_ID,
      predecessorLockDigest: baseScenario.lock.lock_digest,
      transitions: lifecyclePlan.portfolio_transitions,
      authority: portfolioAuthority({
        authorityId: "unrelated-human-maintainer",
        evidenceDigest: digest("unrelated-human-decision"),
        revision: 4,
      }),
    });
    const unrelatedApplication = applyPortfolioTransitions({
      storeRoot,
      predecessorLockDigest: baseScenario.lock.lock_digest,
      authorityContext: unrelatedAuthorityContext,
      trustedPortfolioAuthorityContexts: portfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    });
    const transplanted = publishReceiptVariant({
      result_heads: {
        ...structuredClone(application.artifact.result_heads),
        portfolio_lock_digest: unrelatedApplication.lock_digest,
      },
      steps: [{
        ...structuredClone(application.artifact.steps[0]),
        authority_context_digest: unrelatedApplication.authority_context_digest,
        output_digest: unrelatedApplication.lock_digest,
      }],
    });
    assert.throws(
      () => verifyReceiptObject(transplanted.object_digest, {
        portfolioTrustOverride: [...allPortfolioTrust, unrelatedAuthorityContext],
      }),
      /authority.*decision|approved proposal|exact completed approved transition/iu,
    );
  });

  closes("stored receipt verification rejects missing and unrelated result heads", () => {
    const missingHead = digest("missing-portfolio-head");
    const missing = publishReceiptVariant({
      state: "in_progress",
      result_heads: {
        ...structuredClone(application.artifact.result_heads),
        portfolio_lock_digest: missingHead,
      },
      steps: [{
        ...structuredClone(application.artifact.steps[0]),
        output_digest: missingHead,
      }, {
        ...portfolioMarker(),
        input_digest: missingHead,
        output_digest: missingHead,
      }],
      next_step: "portfolio_commit_marker",
    });
    assert.throws(() => verifyReceiptObject(missing.object_digest), /does not exist|content-addressed|Portfolio/iu);

    const unrelatedPortfolio = publishReceiptVariant({
      state: "in_progress",
      result_heads: {
        ...structuredClone(application.artifact.result_heads),
        portfolio_lock_digest: challengerScenario.lock.lock_digest,
      },
      steps: [{
        ...structuredClone(application.artifact.steps[0]),
        output_digest: challengerScenario.lock.lock_digest,
        authority_context_digest: challengerScenario.lock.authority_context_digest,
      }, {
        ...portfolioMarker(),
        input_digest: challengerScenario.lock.lock_digest,
        output_digest: challengerScenario.lock.lock_digest,
      }],
      next_step: "portfolio_commit_marker",
    });
    assert.throws(() => verifyReceiptObject(unrelatedPortfolio.object_digest), /exact completed approved transition|predecessor|target/iu);

    const unrelatedRegistryContext = assetAuthority({
      predecessorSnapshotDigest: application.artifact.base_heads.registry_snapshot_digest,
      transitions: [assetTransition(candidateAsset, "candidate", "admitted")],
      revision: 99,
    });
    const unrelatedRegistryApplication = applyAssetLifecycleTransitions({
      storeRoot,
      predecessorSnapshotDigest: application.artifact.base_heads.registry_snapshot_digest,
      authorityContext: unrelatedRegistryContext,
      trustedAuthorityContexts: assetTrust,
    });
    const unrelatedRegistry = publishReceiptVariant({
      state: "in_progress",
      result_heads: {
        registry_snapshot_digest: unrelatedRegistryApplication.snapshot_digest,
        portfolio_lock_digest: application.artifact.base_heads.portfolio_lock_digest,
      },
      steps: [{
        step_id: "asset_transition",
        operation: "apply_asset_transition",
        input_digest: application.artifact.base_heads.registry_snapshot_digest,
        authority_context_digest: unrelatedRegistryApplication.authority_context_digest,
        output_digest: unrelatedRegistryApplication.snapshot_digest,
        status: "completed",
      }, {
        ...structuredClone(application.artifact.steps[0]),
        status: "pending",
      }],
      next_step: "portfolio_activation",
    });
    assert.throws(
      () => verifyReceiptObject(unrelatedRegistry.object_digest, {
        assetTrustOverride: [...assetTrust, unrelatedRegistryContext],
      }),
      /exact completed Asset transition|approved proposal|exact approved proposal/iu,
    );
  });

  closes("predecessor resume closes over one exact Evolution lineage and verified heads", () => {
    const predecessor = publishReceiptVariant({
      state: "stopped",
      steps: [application.artifact.steps[0], portfolioMarker()],
      stop: { code: "portfolio_activation_authority_required", detail: "Resume after exact authority is supplied." },
      next_step: "portfolio_commit_marker",
    });
    const resumed = publishReceiptVariant({
      predecessor_receipt_digest: predecessor.object_digest,
      state: "pending",
      base_heads: structuredClone(predecessor.artifact.result_heads),
      result_heads: structuredClone(predecessor.artifact.result_heads),
      steps: [portfolioMarker()],
      stop: null,
      next_step: "portfolio_commit_marker",
    });
    assert.equal(verifyReceiptObject(resumed.object_digest).receipt.predecessor_receipt_digest, predecessor.object_digest);

    const wrongClosure = publishReceiptVariant({
      candidate_digest: digest("different-evolution-candidate"),
      state: "stopped",
      steps: [application.artifact.steps[0], portfolioMarker()],
      stop: { code: "stale_head", detail: "Different Evolution closure." },
      next_step: "portfolio_commit_marker",
    });
    const transplanted = publishReceiptVariant({
      predecessor_receipt_digest: wrongClosure.object_digest,
      state: "pending",
      base_heads: structuredClone(wrongClosure.artifact.result_heads),
      result_heads: structuredClone(wrongClosure.artifact.result_heads),
      steps: [portfolioMarker()],
      stop: null,
      next_step: "portfolio_commit_marker",
    });
    assert.throws(() => verifyReceiptObject(transplanted.object_digest), /predecessor.*candidate_digest|successor receipt/iu);

    const drifted = publishReceiptVariant({
      predecessor_receipt_digest: predecessor.object_digest,
      state: "pending",
      result_heads: structuredClone(application.artifact.base_heads),
      steps: [{ ...portfolioMarker(), input_digest: application.artifact.base_heads.portfolio_lock_digest, output_digest: application.artifact.base_heads.portfolio_lock_digest }],
      stop: null,
      next_step: "portfolio_commit_marker",
    });
    assert.throws(() => verifyReceiptObject(drifted.object_digest), /predecessor head drift/iu);

    const unrelatedRoot = publishReceiptVariant({
      candidate_digest: digest("different-root-candidate"),
      state: "pending",
      result_heads: structuredClone(application.artifact.base_heads),
      steps: [{ ...structuredClone(application.artifact.steps[0]), status: "pending" }],
      stop: null,
      next_step: "portfolio_activation",
    });
    const hiddenTransplant = publishReceiptVariant({
      predecessor_receipt_digest: unrelatedRoot.object_digest,
      state: "stopped",
      base_heads: structuredClone(unrelatedRoot.artifact.result_heads),
      result_heads: structuredClone(unrelatedRoot.artifact.result_heads),
      steps: [{ ...structuredClone(application.artifact.steps[0]), status: "pending" }],
      stop: { code: "portfolio_activation_authority_required", detail: "Resume after exact authority is supplied." },
      next_step: "portfolio_activation",
    });
    const resumedFromHiddenTransplant = publishReceiptVariant({
      predecessor_receipt_digest: hiddenTransplant.object_digest,
      state: "pending",
      base_heads: structuredClone(hiddenTransplant.artifact.result_heads),
      result_heads: structuredClone(hiddenTransplant.artifact.result_heads),
      steps: [{ ...structuredClone(application.artifact.steps[0]), status: "pending" }],
      stop: null,
      next_step: "portfolio_activation",
    });
    assert.throws(
      () => verifyReceiptObject(resumedFromHiddenTransplant.object_digest),
      /predecessor.*candidate_digest|successor receipt|approved proposal/iu,
    );
  });

  closes("resume retains the predecessor next-step identity", () => {
    const predecessor = publishReceiptVariant({
      state: "stopped",
      steps: [application.artifact.steps[0], portfolioMarker()],
      stop: { code: "portfolio_activation_authority_required", detail: "Resume the exact commit-marker step." },
      next_step: "portfolio_commit_marker",
    });
    const publishResumed = (step) => publishReceiptVariant({
      predecessor_receipt_digest: predecessor.object_digest,
      state: "pending",
      base_heads: structuredClone(predecessor.artifact.result_heads),
      result_heads: structuredClone(predecessor.artifact.result_heads),
      steps: [step],
      stop: null,
      next_step: step.step_id,
    });
    const expectTransplant = (step) => {
      const resumed = publishResumed(step);
      assert.throws(
        () => verifyReceiptObject(resumed.object_digest),
        /continued step|next.step.*identity|resume.*transplant/iu,
      );
    };

    expectTransplant({ ...portfolioMarker(), step_id: "transplanted_step" });
    expectTransplant({
      ...portfolioMarker(),
      operation: "verify_asset_commit_marker",
      input_digest: predecessor.artifact.result_heads.registry_snapshot_digest,
      output_digest: predecessor.artifact.result_heads.registry_snapshot_digest,
    });
    expectTransplant({ ...portfolioMarker(), output_digest: digest("transplanted-planned-output") });
    expectTransplant({ ...portfolioMarker(), authority_context_digest: digest("transplanted-authority-context") });
  });

  closes("only resumable predecessors with a non-null next step may continue", () => {
    const successorFrom = (predecessorObjectDigest, predecessorHeads) => publishReceiptVariant({
      predecessor_receipt_digest: predecessorObjectDigest,
      state: "pending",
      base_heads: structuredClone(predecessorHeads),
      result_heads: structuredClone(predecessorHeads),
      steps: [portfolioMarker()],
      stop: null,
      next_step: "portfolio_commit_marker",
    });

    const fromCompleted = successorFrom(application.object_digest, application.artifact.result_heads);
    assert.throws(() => verifyReceiptObject(fromCompleted.object_digest), /completed.*cannot.*resume|predecessor.*resumable/iu);

    const failed = publishReceiptVariant({
      state: "failed",
      steps: [application.artifact.steps[0], portfolioMarker("failed")],
      stop: { code: "application_failed", detail: "Terminal commit-marker failure." },
      next_step: null,
    });
    const fromFailed = successorFrom(failed.object_digest, failed.artifact.result_heads);
    assert.throws(() => verifyReceiptObject(fromFailed.object_digest), /failed.*cannot.*resume|predecessor.*resumable/iu);

    const forgedNullNext = structuredClone(failed.artifact);
    forgedNullNext.state = "stopped";
    forgedNullNext.steps[1].status = "pending";
    forgedNullNext.stop = { code: "stale_head", detail: "A malformed checkpoint omitted its next step." };
    delete forgedNullNext.receipt_digest;
    forgedNullNext.receipt_digest = computeEvolutionApplicationReceiptDigest(forgedNullNext);
    const storedNullNext = putContentAddressedJson({ storeRoot, artifact: forgedNullNext });
    const fromNullNext = successorFrom(storedNullNext.digest, forgedNullNext.result_heads);
    assert.throws(() => verifyReceiptObject(fromNullNext.object_digest), /next step|next_step|schema/iu);
  });

  closes("stopped receipts continue through pending and in-progress checkpoints", () => {
    const stopped = publishReceiptVariant({
      state: "stopped",
      steps: [application.artifact.steps[0], portfolioMarker()],
      stop: { code: "portfolio_activation_authority_required", detail: "Resume the exact commit-marker step." },
      next_step: "portfolio_commit_marker",
    });
    const pending = publishReceiptVariant({
      predecessor_receipt_digest: stopped.object_digest,
      state: "pending",
      base_heads: structuredClone(stopped.artifact.result_heads),
      result_heads: structuredClone(stopped.artifact.result_heads),
      steps: [portfolioMarker()],
      stop: null,
      next_step: "portfolio_commit_marker",
    });
    assert.equal(verifyReceiptObject(pending.object_digest).receipt.state, "pending");

    const postMarker = { ...portfolioMarker(), step_id: "portfolio_post_commit_marker" };
    const inProgress = publishReceiptVariant({
      predecessor_receipt_digest: stopped.object_digest,
      state: "in_progress",
      base_heads: structuredClone(stopped.artifact.result_heads),
      result_heads: structuredClone(stopped.artifact.result_heads),
      steps: [portfolioMarker("completed"), postMarker],
      stop: null,
      next_step: "portfolio_post_commit_marker",
    });
    assert.equal(verifyReceiptObject(inProgress.object_digest).receipt.state, "in_progress");

    const continued = publishReceiptVariant({
      predecessor_receipt_digest: inProgress.object_digest,
      state: "pending",
      base_heads: structuredClone(inProgress.artifact.result_heads),
      result_heads: structuredClone(inProgress.artifact.result_heads),
      steps: [postMarker],
      stop: null,
      next_step: "portfolio_post_commit_marker",
    });
    assert.equal(verifyReceiptObject(continued.object_digest).receipt.predecessor_receipt_digest, inProgress.object_digest);

    const failed = publishReceiptVariant({
      predecessor_receipt_digest: stopped.object_digest,
      state: "failed",
      base_heads: structuredClone(stopped.artifact.result_heads),
      result_heads: structuredClone(stopped.artifact.result_heads),
      steps: [portfolioMarker("failed")],
      stop: { code: "application_failed", detail: "The exact resumed step failed without advancing the head." },
      next_step: null,
    });
    assert.equal(verifyReceiptObject(failed.object_digest).receipt.state, "failed");

    const skipped = publishReceiptVariant({
      predecessor_receipt_digest: stopped.object_digest,
      state: "stopped",
      base_heads: structuredClone(stopped.artifact.result_heads),
      result_heads: structuredClone(stopped.artifact.result_heads),
      steps: [
        { ...portfolioMarker(), status: "skipped" },
        { ...portfolioMarker(), step_id: "portfolio_post_commit_marker" },
      ],
      stop: { code: "stale_head", detail: "Skipping the named continuation is prohibited." },
      next_step: "portfolio_post_commit_marker",
    });
    assert.throws(() => verifyReceiptObject(skipped.object_digest), /status transition pending->skipped.*not allowed/iu);
  });

  closes("a terminal predecessor hidden deeper in the receipt chain is rejected", () => {
    const intermediate = publishReceiptVariant({
      predecessor_receipt_digest: application.object_digest,
      state: "stopped",
      base_heads: structuredClone(application.artifact.result_heads),
      result_heads: structuredClone(application.artifact.result_heads),
      steps: [portfolioMarker()],
      stop: { code: "portfolio_activation_authority_required", detail: "This apparent resume point hides a terminal predecessor." },
      next_step: "portfolio_commit_marker",
    });
    const successor = publishReceiptVariant({
      predecessor_receipt_digest: intermediate.object_digest,
      state: "pending",
      base_heads: structuredClone(intermediate.artifact.result_heads),
      result_heads: structuredClone(intermediate.artifact.result_heads),
      steps: [portfolioMarker()],
      stop: null,
      next_step: "portfolio_commit_marker",
    });
    assert.throws(() => verifyReceiptObject(successor.object_digest), /completed.*cannot.*resume|predecessor.*resumable/iu);
  });

  closes("digest-resealed semantically invalid stored receipt still fails closed", () => {
    const forged = structuredClone(application.artifact);
    forged.state = "stopped";
    forged.stop = null;
    forged.next_step = null;
    delete forged.receipt_digest;
    forged.receipt_digest = computeEvolutionApplicationReceiptDigest(forged);
    const publication = putContentAddressedJson({ storeRoot, artifact: forged });
    assert.throws(() => verifyReceiptObject(publication.digest), /schema|stopped.*stop|next step/iu);
  });

  closes("completed receipt rejects forged action, heads, steps, and rollback history", () => {
    const verifyForged = (mutate) => () => {
      const draft = structuredClone(application.artifact);
      delete draft.receipt_digest;
      mutate(draft);
      const forged = buildEvolutionApplicationReceipt(draft);
      const published = publishEvolutionApplicationReceipt({ storeRoot, receipt: forged });
      return verifyEvolutionClosure({
        storeRoot,
        receiptObjectDigest: published.object_digest,
        decisionObjectDigest: decisionPublication.object_digest,
        proposalObjectDigest: proposalPublication.object_digest,
        candidateObjectDigest: candidatePublication.object_digest,
        experimentObjectDigest: experimentPublication.object_digest,
        recommendationObjectDigest: recommendationPublication.object_digest,
        trustedHumanDecisionAuthorities: humanTrust,
        trustedExperimentAuthorities: experimentTrust,
        trustedEvaluationAuthorities: evaluationTrust,
        trustedAssetAuthorityContexts: assetTrust,
        trustedPortfolioAuthorityContexts: allPortfolioTrust,
      });
    };
    assert.throws(verifyForged((draft) => { draft.action = "retain_current"; }), /receipt action|action.*mismatch/iu);
    assert.throws(verifyForged((draft) => { draft.base_heads.portfolio_lock_digest = challengerScenario.lock.lock_digest; }), /receipt base|base.*head|digest chain/iu);
    assert.throws(verifyForged((draft) => { draft.steps[0].output_digest = baseScenario.lock.lock_digest; }), /receipt step|step.*output|result head|successor head/iu);
    assert.throws(verifyForged((draft) => { draft.rollback_anchor = exactPortfolioRef(targetPublication); }), /receipt rollback|rollback.*anchor/iu);
  });

  const publications = [
    ["candidate", candidatePublication, publishEvolutionCandidate, "candidate_digest"],
    ["experiment", experimentPublication, publishEvolutionExperiment, "experiment_digest"],
    ["recommendation", recommendationPublication, publishEvolutionRecommendation, "recommendation_digest"],
    ["proposal", proposalPublication, publishEvolutionActionProposal, "proposal_digest"],
    ["decision", decisionPublication, publishEvolutionHumanDecision, "decision_digest"],
    ["receipt", application, publishEvolutionApplicationReceipt, "receipt_digest"],
  ];
  closes("all six Evolution artifacts publish idempotently into the shared CAS", () => {
    for (const [label, publication, publish] of publications) {
      const retry = publish({
        storeRoot,
        [label === "proposal" ? "proposal"
          : label === "decision" ? "decision"
            : label === "receipt" ? "receipt"
              : label]: publication.artifact,
      });
      assert.equal(retry.object_digest, publication.object_digest, label);
      assert.equal(retry.created, false, label);
    }
  });

  closes("all six Evolution artifact publishers reject semantic-digest tampering and unknown fields", () => {
    for (const [label, publication, publish, semanticField] of publications) {
      const argumentName = label === "proposal" ? "proposal"
        : label === "decision" ? "decision"
          : label === "receipt" ? "receipt"
            : label;
      const tampered = structuredClone(publication.artifact);
      tampered[semanticField] = digest(`${label}:tampered`);
      assert.throws(
        () => publish({ storeRoot, [argumentName]: tampered }),
        /digest mismatch|semantic|schema/iu,
        `${label} semantic digest tamper`,
      );
      const expanded = { ...structuredClone(publication.artifact), mutable_latest: true };
      assert.throws(
        () => publish({ storeRoot, [argumentName]: expanded }),
        /closed schema|unknown|additional|schema validation/iu,
        `${label} unknown field`,
      );
    }
  });

  rejects("missing decision object is rejected before Portfolio mutation", () => applyApprovedEvolutionPortfolioAction({
    storeRoot,
    proposalObjectDigest: proposalPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    portfolioAuthorityContext: portfolioActivationContext,
    trustedHumanDecisionAuthorities: humanTrust,
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: evaluationTrust,
    trustedAssetAuthorityContexts: assetTrust,
    trustedPortfolioAuthorityContexts: allPortfolioTrust,
  }), /decision.*digest|sha256 digest/iu);

  const wrongEvidenceContext = buildPortfolioAuthorityContext({
    portfolioId: basePublication.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: baseScenario.lock.lock_digest,
    transitions: lifecyclePlan.portfolio_transitions,
    authority: portfolioAuthority({
      authorityId: humanAuthority.authority_id,
      evidenceDigest: digest("wrong-decision-object"),
      revision: 3,
    }),
  });
  rejects("Portfolio authority with the wrong decision evidence digest is rejected", () => applyApprovedEvolutionPortfolioAction({
    storeRoot,
    decisionObjectDigest: decisionPublication.object_digest,
    proposalObjectDigest: proposalPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    portfolioAuthorityContext: wrongEvidenceContext,
    trustedHumanDecisionAuthorities: humanTrust,
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: evaluationTrust,
    trustedAssetAuthorityContexts: assetTrust,
    trustedPortfolioAuthorityContexts: [...portfolioTrust, wrongEvidenceContext],
  }), /exact human decision object digest|separately bind|lifecycle authority/iu);

  const staleContext = buildPortfolioAuthorityContext({
    portfolioId: basePublication.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: baseScenario.empty.lock_digest,
    transitions: lifecyclePlan.portfolio_transitions,
    authority: portfolioAuthority({
      authorityId: humanAuthority.authority_id,
      evidenceDigest: decisionPublication.object_digest,
      revision: 3,
    }),
  });
  rejects("stale Portfolio predecessor authority is rejected", () => applyApprovedEvolutionPortfolioAction({
    storeRoot,
    decisionObjectDigest: decisionPublication.object_digest,
    proposalObjectDigest: proposalPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    portfolioAuthorityContext: staleContext,
    trustedHumanDecisionAuthorities: humanTrust,
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: evaluationTrust,
    trustedAssetAuthorityContexts: assetTrust,
    trustedPortfolioAuthorityContexts: [...portfolioTrust, staleContext],
  }), /predecessor.*differs|transition batch differs|stale/iu);

  rejects("untrusted Portfolio activation authority is rejected", () => applyApprovedEvolutionPortfolioAction({
    storeRoot,
    decisionObjectDigest: decisionPublication.object_digest,
    proposalObjectDigest: proposalPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    portfolioAuthorityContext: portfolioActivationContext,
    trustedHumanDecisionAuthorities: humanTrust,
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: evaluationTrust,
    trustedAssetAuthorityContexts: assetTrust,
    trustedPortfolioAuthorityContexts: portfolioTrust,
  }), /trusted exact authority|separately trusted|Portfolio activation/iu);

  const rollbackDrift = structuredClone(lifecyclePlan);
  rollbackDrift.rollback_anchor = exactPortfolioRef(targetPublication);
  rejects("rollback-anchor drift is rejected before action proposal publication", () => deriveEvolutionActionProposal({
    candidate,
    experiment,
    recommendation,
    lifecyclePlan: rollbackDrift,
  }), /rollback anchor|exact Portfolio identity mismatch/iu);

  const transplantedTargetPlan = structuredClone(lifecyclePlan);
  transplantedTargetPlan.target_manifest = exactPortfolioRef(challengerPublication);
  transplantedTargetPlan.portfolio_transitions.find(({ from_state }) => from_state === null).manifest = exactPortfolioRef(challengerPublication);
  const transplantedTargetProposal = deriveEvolutionActionProposal({
    candidate,
    experiment,
    recommendation,
    lifecyclePlan: transplantedTargetPlan,
  });
  const transplantedTargetPublication = publishEvolutionActionProposal({ storeRoot, proposal: transplantedTargetProposal });
  rejects("target Portfolio transplant is rejected before approved application", () => verifyEvolutionActionProposal({
    storeRoot,
    proposalObjectDigest: transplantedTargetPublication.object_digest,
    candidateObjectDigest: candidatePublication.object_digest,
    experimentObjectDigest: experimentPublication.object_digest,
    recommendationObjectDigest: recommendationPublication.object_digest,
    trustedExperimentAuthorities: experimentTrust,
    trustedEvaluationAuthorities: evaluationTrust,
    trustedAssetAuthorityContexts: assetTrust,
    trustedPortfolioAuthorityContexts: portfolioTrust,
  }), /target manifest Portfolio identity|approved base Portfolio/iu);

  closes("Evolution semantic and object digests remain distinct CAS identities", () => {
    for (const [, publication, , semanticField] of publications) {
      assert.match(publication.object_digest, /^sha256:[a-f0-9]{64}$/u);
      assert.match(publication.artifact[semanticField], /^sha256:[a-f0-9]{64}$/u);
      assert.notEqual(publication.object_digest, publication.artifact[semanticField]);
      assert.equal(canonicalDigest(publication.artifact), publication.object_digest);
    }
  });
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

process.stdout.write(`Evolution loop integration tests passed: ${closureCount} closures\n`);
