#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  applyAssetLifecycleTransitions,
  buildAssetLifecycleAuthorityContext,
  createEmptyAssetRegistry,
  listAssets,
  registerAsset,
  resolveAsset,
  verifyAssetRegistry,
} from "./asset-registry.mjs";
import {
  contentAddressedObjectPath,
  listContentAddressedJson,
  putContentAddressedJson,
  stableCanonicalJson,
} from "./content-addressed-store.mjs";
import {
  applyPortfolioTransitions,
  buildPortfolioAuthorityContext,
  buildPortfolioManifest,
  buildPortfolioSelectionContext,
  computePortfolioSelectionBasisDigest,
  computePortfolioSelectionDigest,
  createEmptyPortfolioLock,
  exportPortfolioReference,
  publishPortfolioManifest,
  resolveCurrentPortfolio,
  resolvePortfolioSelection,
  validatePortfolioSelection,
  verifyPortfolioLock,
  verifyPortfolioManifest,
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
const REGISTRY_ID = "issue-277-synthetic-assets";
const SCOPE_ID = "agent-spectrum-kernel";
const SOURCE_REVISION = "c24f459b0bf69a755dfde00719516e4a5844018d";
const TREE_DIGEST = digest("issue-277-source-tree");
const MODEL = "gpt-5";
const ADAPTER = "codex";
const STACK = "node";
const DOMAIN = "software-engineering";
const TASK_CLASS = "implementation";
const RISK_CLASS = "normal";
const CAPABILITY = "repository.read";
const OPERATION_SCOPE = "local_repository";
const REQUIRED_STATE_REFS = [
  { state_id: "portfolio-state", state_digest: digest("issue-277-portfolio-state-v1") },
  { state_id: "repository-tree", state_digest: TREE_DIGEST },
];
const producerKeys = generateKeyPairSync("ed25519");
const alternateProducerKeys = generateKeyPairSync("ed25519");
const repositoryRoot = resolve(import.meta.dirname, "..");

let caseCount = 0;
const regressionFailures = [];

function digest(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function check(label, action) {
  action();
  caseCount += 1;
  return label;
}

function expectFailure(label, action, pattern) {
  assert.throws(action, pattern, label);
  caseCount += 1;
}

function regression(label, action) {
  try {
    action();
  } catch (error) {
    regressionFailures.push({ label, message: error.message });
  }
  caseCount += 1;
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

function writeSyntheticAsset(sourceRoot, name) {
  const path = `assets/${name}.md`;
  const bytes = Buffer.from(`# ${name}\n\nSynthetic Issue 277 Asset.\n`, "utf8");
  const target = resolve(sourceRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return { path, raw_digest: rawDigest(bytes) };
}

function assetDimension(included) {
  return { status: "bounded", included, excluded: [] };
}

function assetDescriptor({
  name,
  stableId,
  version = "1.0.0",
  highImpact = false,
  permissionsStatus = "supported",
  sourceFile,
}) {
  const evidenceRef = `issue-277:${name}`;
  return {
    schema_version: "1.0.0",
    asset_type: "skill",
    stable_id: stableId,
    version,
    version_scheme: "semantic",
    type_extension: { kind: "skill", entrypoint: sourceFile.path },
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
    derivation: { kind: "root", parent: null, delta: null },
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
      status: permissionsStatus,
      requested_permissions: [CAPABILITY],
      possible_effects: ["read_repository"],
      permission_refs: [evidenceRef],
      effect_refs: [evidenceRef],
    },
    safety: {
      status: "supported",
      classifications: highImpact ? ["high_impact"] : [],
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
        target: null,
        authority_ref: null,
      },
    },
  };
}

function assetAuthority({ predecessorSnapshotDigest, transitions, revision, kind = "external_asset_lifecycle_authority" }) {
  return buildAssetLifecycleAuthorityContext({
    registryId: REGISTRY_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorSnapshotDigest,
    transitions,
    authority: {
      kind,
      authority_id: "issue-277-asset-maintainer",
      authority_revision: revision,
      authority_evidence_digest: digest(`asset-authority:${revision}`),
    },
  });
}

function selectorDimension(included) {
  return { status: "bounded", included, excluded: [] };
}

function selectors(overrides = {}) {
  return {
    task_classes: selectorDimension([TASK_CLASS]),
    projects: selectorDimension([REPOSITORY_ID]),
    models: selectorDimension([MODEL]),
    adapters: selectorDimension([ADAPTER]),
    stacks: selectorDimension([STACK]),
    domains: selectorDimension([DOMAIN]),
    capabilities: selectorDimension([CAPABILITY]),
    risk_classes: selectorDimension([RISK_CLASS]),
    ...structuredClone(overrides),
  };
}

function selectionContextAllowlist(overrides = {}) {
  return {
    task_classes: [TASK_CLASS],
    projects: [REPOSITORY_ID, "github.com/example/other"],
    models: [MODEL, "gpt-4"],
    adapters: [ADAPTER, "other-adapter"],
    stacks: [STACK],
    domains: [DOMAIN],
    risk_classes: [RISK_CLASS, "high"],
    capabilities: [CAPABILITY],
    operation_scopes: [OPERATION_SCOPE],
    ...structuredClone(overrides),
  };
}

function known(value) {
  return { status: "known", value };
}

function unknown() {
  return { status: "unknown", value: null };
}

function bounded(maximum) {
  return { status: "bounded", maximum };
}

function unbounded() {
  return { status: "unbounded", maximum: null };
}

function knownCost(value = 10) {
  return {
    token_count: known(value),
    duration_ms: known(value),
    cost_microunits: known(value),
  };
}

function failureActions(overrides = {}) {
  return {
    inapplicable: "bypass",
    capability_missing: "downgrade",
    prohibited_task: "stop",
    evidence_missing: "bypass",
    evidence_stale: "downgrade",
    evidence_conflict: "stop",
    safety_unknown: "downgrade",
    ...overrides,
  };
}

function portfolioEntry({
  entryId,
  asset,
  role = "experimental",
  assuranceLane = "exploratory",
  expectedState = "candidate",
  entrySelectors = selectors(),
  exposure = assuranceLane === "exploratory"
    ? { mode: "shadow", canary_percent: null }
    : assuranceLane === "challenger"
      ? { mode: "shadow", canary_percent: null }
      : { mode: "active", canary_percent: null },
  prohibitedTaskClasses = [],
  evidenceRequirementIds = [],
  costEstimate = knownCost(),
  actions = failureActions(),
} = {}) {
  return {
    entry_id: entryId,
    role,
    assurance_lane: assuranceLane,
    asset: exactAssetRef(asset),
    expected_registry_state: expectedState,
    expected_scope_id: SCOPE_ID,
    selectors: structuredClone(entrySelectors),
    exposure: structuredClone(exposure),
    prohibited_task_classes: structuredClone(prohibitedTaskClasses),
    activation_requirement: assuranceLane === "high_impact_active"
      ? "high_impact_independent_activation"
      : "portfolio_activation",
    evidence_requirement_ids: structuredClone(evidenceRequirementIds),
    cost_estimate: structuredClone(costEstimate),
    failure_actions: structuredClone(actions),
  };
}

function portfolioRef(publication) {
  return {
    portfolio_id: publication.portfolio_id,
    revision: publication.revision,
    manifest_digest: publication.manifest_digest,
    asset_set_digest: publication.asset_set_digest,
  };
}

function manifestDraft({
  portfolioId,
  revision,
  registry,
  entries = [],
  manifestSelectors = selectors(),
  contextAllowlist = selectionContextAllowlist(),
  evidenceRequirements = [],
  rollbackTarget = null,
  selectionPolicy = {},
  budgets = {},
  unresolvedConflicts = [],
  prohibitedEffects = [],
} = {}) {
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
      content_digest: digest("issue-277-kernel-foundation"),
    },
    registry: {
      registry_id: registry.registry_id,
      repository_id: registry.repository_id,
      scope_id: registry.scope_id,
      snapshot_revision: registry.snapshot_revision,
      snapshot_digest: registry.snapshot_digest,
    },
    selectors: structuredClone(manifestSelectors),
    selection_context_allowlist: structuredClone(contextAllowlist),
    entries: structuredClone(entries),
    evidence_requirements: structuredClone(evidenceRequirements),
    selection_policy: {
      portfolio_inapplicable_action: "bypass",
      selector_conflict_action: "stop",
      empty_selection_action: "bypass",
      ...structuredClone(selectionPolicy),
    },
    budgets: {
      policy_limits: {
        token_count: unbounded(),
        duration_ms: unbounded(),
        cost_microunits: unbounded(),
        ...structuredClone(budgets.policy_limits ?? {}),
      },
      unknown_value_action: budgets.unknown_value_action ?? "bypass",
      exceeded_action: budgets.exceeded_action ?? "stop",
    },
    safety_guardrails: {
      unknown_safety_action: "downgrade",
      high_impact_without_approval_action: "stop",
      prohibited_effects: structuredClone(prohibitedEffects),
    },
    unresolved_conflicts: structuredClone(unresolvedConflicts),
    rollback: {
      mode: rollbackTarget === null ? "none" : "exact",
      target: structuredClone(rollbackTarget),
      required_authority_kind: "external_portfolio_rollback_authority",
    },
    benchmark_compatibility: [{
      condition_id: "kernel_only",
      config_path: "benchmarks/adaptive-portfolio.config.json",
      config_digest: digest("issue-277-frozen-benchmark-config"),
      frozen_results_mutated: false,
    }],
  };
}

function verificationEvidenceDraft({
  gateId,
  selectionBasisDigest,
  terminalStatus = "succeeded",
  adapterVersion = "1.0.0",
  repositoryId = REPOSITORY_ID,
  targetRevision = SOURCE_REVISION,
  targetTreeDigest = TREE_DIGEST,
  consumedInputPath = "portfolio-selection-basis.json",
  consumedInputDigest = selectionBasisDigest,
  toolchainVersion = "24",
  evidenceLevel = "behavior_verified",
  obligationRefs = [`${gateId}.obligation`],
  explicitNonCoverage = [],
} = {}) {
  return {
    schema_version: "1.0.0",
    schema_path: "schemas/verification-evidence.schema.json",
    program: "ask_verification_evidence",
    gate: {
      gate_id: gateId,
      contract_digest: digest(`contract:${gateId}`),
      category: "test",
    },
    target: {
      repository_id: repositoryId,
      target_revision: targetRevision,
      tree_digest: targetTreeDigest,
    },
    consumed_inputs: [{
      kind: "manifest",
      path: consumedInputPath,
      digest: consumedInputDigest,
    }],
    execution: {
      command: verificationCommandIdentity({
        executable: "node",
        argument_identities: [{
          kind: "public",
          identity_digest: digest(`command:${gateId}`),
        }],
        working_directory: ".",
      }),
      runner: {
        runner_id: "issue-277-node",
        runner_version: "1.0.0",
        adapter_id: ADAPTER,
        adapter_version: adapterVersion,
        evidence_level: evidenceLevel,
      },
      toolchain: [{
        name: "node",
        version: toolchainVersion,
        identity_digest: digest(`node-${toolchainVersion}`),
      }],
      environment: {
        os: "portable",
        architecture: "portable",
        identity_digest: digest("issue-277-portable-environment"),
      },
      terminal: {
        status: terminalStatus,
        exit_code: terminalStatus === "succeeded" ? 0 : 1,
        duration_ms: 10,
        output_bytes: 16,
        output_digest: digest(`${gateId}:${terminalStatus}`),
      },
    },
    coverage: {
      obligation_refs: obligationRefs,
      explicit_non_coverage: explicitNonCoverage,
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

function sealEvidence(options, privateKey = producerKeys.privateKey) {
  return attestVerificationEvidence(verificationEvidenceDraft(options), {
    privateKey,
  });
}

function acceptedGate(evidence) {
  return {
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
  };
}

function prepareEvidenceManifest({
  storeRoot,
  registry,
  portfolioId,
  revision,
  entry,
  evidenceMode = "exact",
  requiredEvidenceLevel = "behavior_verified",
  rollbackTarget = null,
  manifestOverrides = {},
  gateId = `${portfolioId}.gate`,
} = {}) {
  const requirementId = `${portfolioId}.evidence`;
  const boundEntry = {
    ...structuredClone(entry),
    evidence_requirement_ids: [requirementId],
  };
  const preliminary = manifestDraft({
    portfolioId,
    revision,
    registry,
    entries: [boundEntry],
    rollbackTarget,
    ...structuredClone(manifestOverrides),
  });
  const selectionBasisDigest = computePortfolioSelectionBasisDigest(preliminary);
  const passing = sealEvidence({
    gateId,
    selectionBasisDigest,
    evidenceLevel: requiredEvidenceLevel,
  });
  if (evidenceMode === "exact" || evidenceMode === "conflict") {
    putVerificationEvidence({ storeRoot, evidence: passing });
  }
  if (evidenceMode === "stale") {
    const stale = sealEvidence({ gateId, selectionBasisDigest, adapterVersion: "2.0.0" });
    putVerificationEvidence({ storeRoot, evidence: stale });
  }
  if (evidenceMode === "stale-target") {
    const stale = sealEvidence({
      gateId,
      selectionBasisDigest,
      targetTreeDigest: digest("stale-target-tree"),
    });
    putVerificationEvidence({ storeRoot, evidence: stale });
  }
  if (evidenceMode === "stale-input") {
    const stale = sealEvidence({
      gateId,
      selectionBasisDigest,
      consumedInputDigest: digest("stale-selection-input"),
    });
    putVerificationEvidence({ storeRoot, evidence: stale });
  }
  if (evidenceMode === "stale-toolchain") {
    const stale = sealEvidence({ gateId, selectionBasisDigest, toolchainVersion: "25" });
    putVerificationEvidence({ storeRoot, evidence: stale });
  }
  if (evidenceMode === "authority-mismatch") {
    const untrusted = sealEvidence(
      { gateId, selectionBasisDigest },
      alternateProducerKeys.privateKey,
    );
    putVerificationEvidence({ storeRoot, evidence: untrusted });
  }
  if (evidenceMode === "coverage-mismatch") {
    const uncovered = sealEvidence({
      gateId,
      selectionBasisDigest,
      obligationRefs: [`${gateId}.different-obligation`],
      explicitNonCoverage: [`${gateId}.obligation`],
    });
    putVerificationEvidence({ storeRoot, evidence: uncovered });
  }
  if (evidenceMode === "conflict") {
    const failing = sealEvidence({ gateId, selectionBasisDigest, terminalStatus: "failed" });
    putVerificationEvidence({ storeRoot, evidence: failing });
  }
  const requirements = buildVerificationRequirements({ requiredGates: [acceptedGate(passing)] });
  return manifestDraft({
    portfolioId,
    revision,
    registry,
    entries: [boundEntry],
    evidenceRequirements: [{
      requirement_id: requirementId,
      entry_ids: [boundEntry.entry_id],
      requirements,
      allowed_dispositions: ["reuse_exact"],
      required_current_state_refs: structuredClone(REQUIRED_STATE_REFS),
    }],
    rollbackTarget,
    ...structuredClone(manifestOverrides),
  });
}

function portfolioAuthority({ kind = "external_portfolio_activation_authority", revision }) {
  return {
    kind,
    authority_id: "issue-277-portfolio-maintainer",
    authority_revision: revision,
    authority_evidence_digest: digest(`portfolio-authority:${kind}:${revision}`),
  };
}

function manifestTransition(publication, fromState, toState) {
  return {
    manifest: portfolioRef(publication),
    from_state: fromState,
    to_state: toState,
  };
}

function selectionContext({
  lockDigest,
  projectId = REPOSITORY_ID,
  repositoryId = REPOSITORY_ID,
  sourceRevision = SOURCE_REVISION,
  treeDigest = TREE_DIGEST,
  taskClass = TASK_CLASS,
  model = MODEL,
  adapter = ADAPTER,
  stack = STACK,
  domain = DOMAIN,
  riskClass = RISK_CLASS,
  capabilities = [CAPABILITY],
  operationScopes = [OPERATION_SCOPE],
  availableBudget = {
    token_count: known(1000),
    duration_ms: known(1000),
    cost_microunits: known(1000),
  },
  currentStateRefs = REQUIRED_STATE_REFS,
  extra = {},
} = {}) {
  return buildPortfolioSelectionContext({
    schema_version: "1.0.0",
    object_kind: "portfolio_selection_context",
    selection_phase: "pre_result",
    portfolio_lock_digest: lockDigest,
    repository_id: repositoryId,
    project_id: projectId,
    source_revision: sourceRevision,
    tree_digest: treeDigest,
    task_class: taskClass,
    model,
    adapter,
    stack,
    domain,
    risk_class: riskClass,
    capabilities: structuredClone(capabilities),
    operation_scopes: structuredClone(operationScopes),
    available_budget: structuredClone(availableBudget),
    current_state_refs: structuredClone(currentStateRefs),
    ...structuredClone(extra),
  });
}

function publishManifest({ storeRoot, draft, assetTrust }) {
  return publishPortfolioManifest({
    storeRoot,
    draft,
    trustedAssetAuthorityContexts: assetTrust,
  });
}

function activateInitial({
  storeRoot,
  draft,
  assetTrust,
  grants = [],
  authorityRevision = draft.revision,
} = {}) {
  const publication = publishManifest({ storeRoot, draft, assetTrust });
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
    grants,
    authority: portfolioAuthority({ revision: authorityRevision }),
  });
  const lock = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: empty.lock_digest,
    authorityContext,
    trustedAssetAuthorityContexts: assetTrust,
  });
  return { publication, empty, authorityContext, lock };
}

function select({
  storeRoot,
  scenario,
  assetTrust,
  portfolioTrust = [scenario.authorityContext],
  highImpactTrust = [],
  contextOverrides = {},
} = {}) {
  const context = selectionContext({
    lockDigest: scenario.lock.lock_digest,
    ...structuredClone(contextOverrides),
  });
  const resolved = resolvePortfolioSelection({
    storeRoot,
    lockDigest: scenario.lock.lock_digest,
    selectorContext: context,
    trustedPortfolioAuthorityContexts: portfolioTrust,
    trustedAssetAuthorityContexts: assetTrust,
    trustedHighImpactApprovalGrants: highImpactTrust,
  });
  return { context, ...resolved };
}

function hasReason(selection, code, action) {
  return selection.reasons.some((reason) => (
    reason.code === code && (action === undefined || reason.action === action)
  ));
}

function createExploratoryScenario({
  storeRoot,
  registry,
  assetTrust,
  portfolioId,
  entries,
  manifestSelectors = selectors(),
  selectionPolicy = {},
  budgets = {},
  unresolvedConflicts = [],
} = {}) {
  const draft = manifestDraft({
    portfolioId,
    revision: "v1",
    registry,
    entries,
    manifestSelectors,
    selectionPolicy,
    budgets,
    unresolvedConflicts,
  });
  return activateInitial({ storeRoot, draft, assetTrust });
}

function buildSyntheticRegistry({ sourceRoot, storeRoot }) {
  const definitions = [
    { name: "baseline", stableId: "ask.skill.issue277.baseline" },
    { name: "challenger", stableId: "ask.skill.issue277.challenger" },
    {
      name: "declared-boundary",
      stableId: "ask.skill.issue277.declared-boundary",
      permissionsStatus: "declared_by_consumer",
    },
    { name: "experiment", stableId: "ask.skill.issue277.experiment" },
    { name: "high-impact", stableId: "ask.skill.issue277.high-impact", highImpact: true },
  ];
  const empty = createEmptyAssetRegistry({
    storeRoot,
    registryId: REGISTRY_ID,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  let snapshotDigest = empty.snapshot_digest;
  for (const definition of definitions) {
    const registration = registerAsset({
      storeRoot,
      sourceRoot,
      predecessorSnapshotDigest: snapshotDigest,
      descriptor: assetDescriptor({
        ...definition,
        sourceFile: writeSyntheticAsset(sourceRoot, definition.name),
      }),
    });
    snapshotDigest = registration.snapshot_digest;
  }
  const candidates = listAssets({ storeRoot, snapshotDigest });
  const admittedSubjects = candidates.filter((asset) => (
    asset.stable_id.endsWith(".baseline") || asset.stable_id.endsWith(".high-impact")
  ));
  const admitAuthority = assetAuthority({
    predecessorSnapshotDigest: snapshotDigest,
    transitions: admittedSubjects.map((asset) => assetTransition(asset, "candidate", "admitted")),
    revision: "admit-v1",
  });
  const admitted = applyAssetLifecycleTransitions({
    storeRoot,
    predecessorSnapshotDigest: snapshotDigest,
    authorityContext: admitAuthority,
  });
  const admittedAssets = listAssets({
    storeRoot,
    snapshotDigest: admitted.snapshot_digest,
    trustedAuthorityContexts: [admitAuthority],
    state: "admitted",
  });
  const currentAuthority = assetAuthority({
    predecessorSnapshotDigest: admitted.snapshot_digest,
    transitions: admittedAssets.map((asset) => assetTransition(asset, "admitted", "current")),
    revision: "current-v1",
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
  const byName = Object.fromEntries(definitions.map((definition) => [
    definition.name,
    resolveAsset({
      storeRoot,
      snapshotDigest: registry.snapshot_digest,
      stableId: definition.stableId,
      version: "1.0.0",
      state: definition.name === "baseline" || definition.name === "high-impact" ? "current" : "candidate",
      trustedAuthorityContexts: assetTrust,
    }),
  ]));
  return {
    registry,
    assets: byName,
    assetTrust,
    admitAuthority,
    currentAuthority,
  };
}

const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ask-portfolio-manager-"));
try {
  const sourceRoot = resolve(temporaryRoot, "source");
  const storeRoot = resolve(temporaryRoot, "store");
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(storeRoot, { recursive: true });

  const synthetic = buildSyntheticRegistry({ sourceRoot, storeRoot });
  const { registry, assets, assetTrust } = synthetic;

  check("synthetic Registry preserves candidate, admitted, and current authority closure", () => {
    assert.equal(registry.assets.length, 5);
    assert.deepEqual(
      registry.assets.map((asset) => [asset.stable_id, asset.state]),
      [
        ["ask.skill.issue277.baseline", "current"],
        ["ask.skill.issue277.challenger", "candidate"],
        ["ask.skill.issue277.declared-boundary", "candidate"],
        ["ask.skill.issue277.experiment", "candidate"],
        ["ask.skill.issue277.high-impact", "current"],
      ],
    );
  });

  check("checked-in Asset sample remains candidate-only and non-activating", () => {
    const reference = JSON.parse(readFileSync(resolve(repositoryRoot, "docs/fixtures/asset-registry/reference.json"), "utf8"));
    assert.equal(reference.runtime_activation_implied, false);
    assert.ok(reference.assets.length > 0);
    assert.ok(reference.assets.every((asset) => asset.state === "candidate"));
  });

  const kernelDraft = manifestDraft({
    portfolioId: "ask.portfolio.issue277.chain",
    revision: "kernel-v1",
    registry,
  });
  const kernelPublicationFirst = publishManifest({ storeRoot, draft: kernelDraft, assetTrust });
  const kernelPublicationSecond = publishManifest({ storeRoot, draft: kernelDraft, assetTrust });
  check("Kernel-only manifest publication is deterministic and idempotent", () => {
    assert.equal(kernelPublicationFirst.manifest_digest, kernelPublicationSecond.manifest_digest);
    assert.equal(kernelPublicationFirst.asset_set_digest, digest("[]"));
    assert.equal(kernelPublicationFirst.created, true);
    assert.equal(kernelPublicationSecond.created, false);
  });
  const kernelEmpty = createEmptyPortfolioLock({
    storeRoot,
    portfolioId: kernelPublicationFirst.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  const kernelAuthority = buildPortfolioAuthorityContext({
    portfolioId: kernelPublicationFirst.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: kernelEmpty.lock_digest,
    transitions: [manifestTransition(kernelPublicationFirst, null, "current")],
    authority: portfolioAuthority({ revision: "kernel-v1" }),
  });
  const kernelLock = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: kernelEmpty.lock_digest,
    authorityContext: kernelAuthority,
    trustedAssetAuthorityContexts: assetTrust,
  });
  const kernelScenario = {
    publication: kernelPublicationFirst,
    empty: kernelEmpty,
    authorityContext: kernelAuthority,
    lock: kernelLock,
  };
  const kernelSelectionFirst = select({ storeRoot, scenario: kernelScenario, assetTrust });
  const kernelSelectionSecond = select({ storeRoot, scenario: kernelScenario, assetTrust });
  check("Kernel-only current Portfolio selects the explicit zero-Asset set", () => {
    assert.equal(kernelSelectionFirst.selection.decision, "selected");
    assert.deepEqual(kernelSelectionFirst.selection.selected_assets, []);
    assert.equal(kernelSelectionFirst.selection_object_digest, kernelSelectionSecond.selection_object_digest);
    assert.equal(kernelSelectionSecond.created, false);
    verifyPortfolioSelection({
      storeRoot,
      selectionObjectDigest: kernelSelectionFirst.selection_object_digest,
      selectorContext: kernelSelectionFirst.context,
      trustedPortfolioAuthorityContexts: [kernelAuthority],
      trustedAssetAuthorityContexts: assetTrust,
    });
  });

  expectFailure(
    "closed manifest rejects unknown fields",
    () => buildPortfolioManifest({ ...structuredClone(kernelDraft), mutable_latest: true }),
    /schema|unknown|additional/iu,
  );

  const activeCandidate = portfolioEntry({
    entryId: "candidate-active",
    asset: assets.challenger,
    role: "baseline",
    assuranceLane: "admitted",
    expectedState: "candidate",
    exposure: { mode: "active", canary_percent: null },
  });
  expectFailure(
    "candidate Asset cannot be represented as an admitted active baseline",
    () => buildPortfolioManifest(manifestDraft({
      portfolioId: "ask.portfolio.issue277.invalid-active-candidate",
      revision: "v1",
      registry,
      entries: [activeCandidate],
    })),
    /candidate|admitted|current|active/iu,
  );

  const baselineEntry = portfolioEntry({
    entryId: "baseline",
    asset: assets.baseline,
    role: "baseline",
    assuranceLane: "admitted",
    expectedState: "current",
  });
  const baselineDraft = prepareEvidenceManifest({
    storeRoot,
    registry,
    portfolioId: kernelPublicationFirst.portfolio_id,
    revision: "baseline-v2",
    entry: baselineEntry,
    evidenceMode: "exact",
    rollbackTarget: portfolioRef(kernelPublicationFirst),
    gateId: "issue-277-baseline-gate",
  });
  const baselinePublication = publishManifest({ storeRoot, draft: baselineDraft, assetTrust });
  const baselineAuthority = buildPortfolioAuthorityContext({
    portfolioId: baselinePublication.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: kernelLock.lock_digest,
    transitions: [
      manifestTransition(kernelPublicationFirst, "current", "superseded"),
      manifestTransition(baselinePublication, null, "current"),
    ],
    authority: portfolioAuthority({ revision: "baseline-v2" }),
  });
  const baselineLockFirst = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: kernelLock.lock_digest,
    authorityContext: baselineAuthority,
    trustedPortfolioAuthorityContexts: [kernelAuthority],
    trustedAssetAuthorityContexts: assetTrust,
  });
  const baselineLockSecond = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: kernelLock.lock_digest,
    authorityContext: baselineAuthority,
    trustedPortfolioAuthorityContexts: [kernelAuthority],
    trustedAssetAuthorityContexts: assetTrust,
  });
  const baselineScenario = {
    publication: baselinePublication,
    authorityContext: baselineAuthority,
    lock: baselineLockFirst,
  };
  const baselinePortfolioTrust = [kernelAuthority, baselineAuthority];
  check("successor activation atomically supersedes Kernel-only and is idempotent", () => {
    assert.equal(baselineLockFirst.lock_digest, baselineLockSecond.lock_digest);
    assert.equal(baselineLockSecond.created, false);
    const verified = verifyPortfolioLock({
      storeRoot,
      lockDigest: baselineLockFirst.lock_digest,
      trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    });
    assert.deepEqual(
      verified.lock.entries.map((entry) => [entry.revision, entry.state]),
      [["baseline-v2", "current"], ["kernel-v1", "superseded"]],
    );
    assert.equal(verified.lock.current_manifest_digest, baselinePublication.manifest_digest);
  });

  expectFailure(
    "current lock verification requires exact Portfolio trust closure",
    () => verifyPortfolioLock({
      storeRoot,
      lockDigest: baselineLockFirst.lock_digest,
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /trusted Portfolio authority context/iu,
  );
  expectFailure(
    "current lock verification requires exact Asset trust closure",
    () => verifyPortfolioLock({
      storeRoot,
      lockDigest: baselineLockFirst.lock_digest,
      trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
    }),
    /trusted lifecycle authority context/iu,
  );
  expectFailure(
    "manifest verification cannot infer Asset lifecycle authority from stored objects",
    () => verifyPortfolioManifest({ storeRoot, manifestDigest: baselinePublication.manifest_digest }),
    /trusted lifecycle authority context/iu,
  );
  check("exact caller-supplied Portfolio and Asset trust closes the current chain", () => {
    const current = resolveCurrentPortfolio({
      storeRoot,
      lockDigest: baselineLockFirst.lock_digest,
      trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    });
    assert.equal(current.manifest_digest, baselinePublication.manifest_digest);
    assert.equal(current.bound_assets[0].asset.state, "current");
  });

  const baselineSelectionFirst = select({
    storeRoot,
    scenario: baselineScenario,
    assetTrust,
    portfolioTrust: baselinePortfolioTrust,
  });
  const baselineSelectionSecond = select({
    storeRoot,
    scenario: baselineScenario,
    assetTrust,
    portfolioTrust: baselinePortfolioTrust,
  });
  check("admitted baseline selection accepts exact Ed25519 evidence deterministically", () => {
    assert.equal(baselineSelectionFirst.selection.decision, "selected");
    assert.equal(baselineSelectionFirst.selection.selected_assets.length, 1);
    assert.equal(baselineSelectionFirst.selection.selected_assets[0].asset.stable_id, assets.baseline.stable_id);
    assert.equal(baselineSelectionFirst.selection.evidence_plans[0].plan.coverage.status, "covered");
    assert.equal(baselineSelectionFirst.selection_object_digest, baselineSelectionSecond.selection_object_digest);
    assert.equal(stableCanonicalJson(baselineSelectionFirst.selection), stableCanonicalJson(baselineSelectionSecond.selection));
    verifyPortfolioSelection({
      storeRoot,
      selectionObjectDigest: baselineSelectionFirst.selection_object_digest,
      selectorContext: baselineSelectionFirst.context,
      trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    });
  });

  for (const [label, overrides] of [
    ["project", { projectId: "github.com/example/other" }],
    ["model", { model: "gpt-4" }],
    ["adapter", { adapter: "other-adapter" }],
  ]) {
    check(`${label} mismatch is a typed inapplicable selection`, () => {
      const resolved = select({
        storeRoot,
        scenario: baselineScenario,
        assetTrust,
        portfolioTrust: baselinePortfolioTrust,
        contextOverrides: overrides,
      });
      assert.equal(resolved.selection.decision, "bypass");
      assert.equal(resolved.selection.selected_assets.length, 0);
      assert.ok(hasReason(resolved.selection, "portfolio_inapplicable", "bypass"));
    });
  }
  expectFailure(
    "repository identity transplant is structural failure",
    () => select({
      storeRoot,
      scenario: baselineScenario,
      assetTrust,
      portfolioTrust: baselinePortfolioTrust,
      contextOverrides: { repositoryId: "github.com/example/other" },
    }),
    /repository transplant/iu,
  );
  check("missing adapter capability produces a deterministic downgrade", () => {
    const resolved = select({
      storeRoot,
      scenario: baselineScenario,
      assetTrust,
      portfolioTrust: baselinePortfolioTrust,
      contextOverrides: { capabilities: [] },
    });
    assert.equal(resolved.selection.decision, "downgrade");
    assert.ok(hasReason(resolved.selection, "capability_missing", "downgrade"));
    assert.deepEqual(resolved.selection.capability_downgrades[0].missing_capabilities, [CAPABILITY]);
  });

  check("missing exact current-state reference makes evidence stale", () => {
    const resolved = select({
      storeRoot,
      scenario: baselineScenario,
      assetTrust,
      portfolioTrust: baselinePortfolioTrust,
      contextOverrides: { currentStateRefs: [REQUIRED_STATE_REFS[1]] },
    });
    assert.equal(resolved.selection.decision, "downgrade");
    assert.ok(hasReason(resolved.selection, "evidence_stale", "downgrade"));
  });
  check("substituted current-state digest makes evidence stale", () => {
    const changedRefs = structuredClone(REQUIRED_STATE_REFS);
    changedRefs[0].state_digest = digest("transplanted-state");
    const resolved = select({
      storeRoot,
      scenario: baselineScenario,
      assetTrust,
      portfolioTrust: baselinePortfolioTrust,
      contextOverrides: { currentStateRefs: changedRefs },
    });
    assert.equal(resolved.selection.decision, "downgrade");
    assert.ok(hasReason(resolved.selection, "evidence_stale", "downgrade"));
  });
  check("stale verification target tree is a typed evidence downgrade", () => {
    const resolved = select({
      storeRoot,
      scenario: baselineScenario,
      assetTrust,
      portfolioTrust: baselinePortfolioTrust,
      contextOverrides: { treeDigest: digest("changed-tree") },
    });
    assert.equal(resolved.selection.decision, "downgrade");
    assert.ok(hasReason(resolved.selection, "evidence_stale", "downgrade"));
  });

  expectFailure(
    "recursive selector key leakage is rejected before selection",
    () => selectionContext({
      lockDigest: baselineLockFirst.lock_digest,
      extra: { metadata: { nested: { evaluator_result: "present" } } },
    }),
    /prohibited result\/evaluator field/iu,
  );
  expectFailure(
    "recursive selector string-value leakage is rejected before selection",
    () => selectionContext({
      lockDigest: baselineLockFirst.lock_digest,
      taskClass: "hidden-test",
    }),
    /prohibited result\/evaluator value/iu,
  );
  expectFailure(
    "manifest cannot pre-authorize a post-result selector vocabulary",
    () => buildPortfolioManifest(manifestDraft({
      portfolioId: "ask.portfolio.issue277.leaking-vocabulary",
      revision: "v1",
      registry,
      contextAllowlist: selectionContextAllowlist({
        task_classes: [TASK_CLASS, "promotion_decision_adopt"],
      }),
    })),
    /prohibited result\/evaluator value|post-result|pre-result/iu,
  );
  expectFailure(
    "selection rejects a non-prohibited but unsealed context vocabulary value",
    () => resolvePortfolioSelection({
      storeRoot,
      lockDigest: baselineLockFirst.lock_digest,
      selectorContext: selectionContext({
        lockDigest: baselineLockFirst.lock_digest,
        taskClass: "maintenance_review",
      }),
      trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /sealed pre-result allowlist/iu,
  );

  const challengerTemplate = (asset = assets.challenger) => portfolioEntry({
    entryId: "challenger",
    asset,
    role: "challenger",
    assuranceLane: "challenger",
    expectedState: "candidate",
  });
  const evidenceScenarios = {};
  for (const mode of [
    "exact",
    "missing",
    "stale",
    "stale-target",
    "stale-input",
    "stale-toolchain",
    "authority-mismatch",
    "coverage-mismatch",
    "conflict",
  ]) {
    const portfolioId = `ask.portfolio.issue277.challenger-${mode}`;
    const draft = prepareEvidenceManifest({
      storeRoot,
      registry,
      portfolioId,
      revision: "v1",
      entry: challengerTemplate(),
      evidenceMode: mode,
      gateId: `issue-277-challenger-${mode}-gate`,
    });
    evidenceScenarios[mode] = activateInitial({ storeRoot, draft, assetTrust });
  }
  check("candidate challenger with exact evidence is selected only in shadow exposure", () => {
    const resolved = select({ storeRoot, scenario: evidenceScenarios.exact, assetTrust });
    assert.equal(resolved.selection.decision, "selected");
    assert.equal(resolved.selection.selected_assets[0].exposure.mode, "shadow");
    assert.equal(resolved.selection.selected_assets[0].asset.stable_id, assets.challenger.stable_id);
  });
  check("missing challenger evidence follows typed bypass", () => {
    const resolved = select({ storeRoot, scenario: evidenceScenarios.missing, assetTrust });
    assert.equal(resolved.selection.decision, "bypass");
    assert.ok(hasReason(resolved.selection, "evidence_missing", "bypass"));
  });
  const sharedCasIsolationGateId = "issue-277-shared-cas-isolation-gate";
  const sharedCasIsolationDraft = prepareEvidenceManifest({
    storeRoot,
    registry,
    portfolioId: "ask.portfolio.issue277.shared-cas-isolation",
    revision: "v1",
    entry: challengerTemplate(),
    evidenceMode: "missing",
    gateId: sharedCasIsolationGateId,
  });
  const sharedCasIsolationScenario = activateInitial({
    storeRoot,
    draft: sharedCasIsolationDraft,
    assetTrust,
  });
  regression("unrelated evidence with the same gate ID cannot change a shared-CAS selection", () => {
    const before = select({ storeRoot, scenario: sharedCasIsolationScenario, assetTrust });
    assert.equal(before.selection.decision, "bypass");
    assert.ok(hasReason(before.selection, "evidence_missing", "bypass"));

    putVerificationEvidence({
      storeRoot,
      evidence: sealEvidence({
        gateId: sharedCasIsolationGateId,
        selectionBasisDigest: digest("foreign-repository-selection-basis"),
        repositoryId: "github.com/example/shared-cas-neighbor",
        targetRevision: "neighbor-revision",
        targetTreeDigest: digest("neighbor-tree"),
      }),
    });
    const afterForeignRepository = select({ storeRoot, scenario: sharedCasIsolationScenario, assetTrust });
    assert.deepEqual(afterForeignRepository.selection, before.selection);

    putVerificationEvidence({
      storeRoot,
      evidence: sealEvidence({
        gateId: sharedCasIsolationGateId,
        selectionBasisDigest: digest("unrelated-input-selection-basis"),
        consumedInputPath: "other/portfolio-selection-basis.json",
      }),
    });
    const afterUnrelatedInput = select({ storeRoot, scenario: sharedCasIsolationScenario, assetTrust });
    assert.deepEqual(afterUnrelatedInput.selection, before.selection);

    putVerificationEvidence({
      storeRoot,
      evidence: sealEvidence({
        gateId: sharedCasIsolationGateId,
        selectionBasisDigest: digest("prior-selection-basis"),
        targetRevision: "prior-revision",
        targetTreeDigest: digest("prior-tree"),
      }),
    });
    const afterRelatedStaleEvidence = select({ storeRoot, scenario: sharedCasIsolationScenario, assetTrust });
    assert.equal(afterRelatedStaleEvidence.selection.decision, "downgrade");
    assert.ok(hasReason(afterRelatedStaleEvidence.selection, "evidence_stale", "downgrade"));
  });
  const sharedCasAuthorityGateId = "issue-277-shared-cas-authority-gate";
  const sharedCasAuthorityDraft = prepareEvidenceManifest({
    storeRoot,
    registry,
    portfolioId: "ask.portfolio.issue277.shared-cas-authority",
    revision: "v1",
    entry: challengerTemplate(),
    evidenceMode: "missing",
    gateId: sharedCasAuthorityGateId,
  });
  const sharedCasAuthorityScenario = activateInitial({
    storeRoot,
    draft: sharedCasAuthorityDraft,
    assetTrust,
  });
  regression("only authority-accepted evidence can establish stale material in a shared CAS", () => {
    const before = select({ storeRoot, scenario: sharedCasAuthorityScenario, assetTrust });
    assert.equal(before.selection.decision, "bypass");
    assert.ok(hasReason(before.selection, "evidence_missing", "bypass"));

    putVerificationEvidence({
      storeRoot,
      evidence: sealEvidence({
        gateId: sharedCasAuthorityGateId,
        selectionBasisDigest: digest("unaccepted-producer-selection-basis"),
        targetRevision: "unaccepted-producer-revision",
        targetTreeDigest: digest("unaccepted-producer-tree"),
      }, alternateProducerKeys.privateKey),
    });
    const afterUnacceptedProducer = select({
      storeRoot,
      scenario: sharedCasAuthorityScenario,
      assetTrust,
    });
    assert.deepEqual(afterUnacceptedProducer.selection, before.selection);

    putVerificationEvidence({
      storeRoot,
      evidence: sealEvidence({
        gateId: sharedCasAuthorityGateId,
        selectionBasisDigest: digest("accepted-stale-selection-basis"),
        targetRevision: "accepted-stale-revision",
        targetTreeDigest: digest("accepted-stale-tree"),
      }),
    });
    const afterAcceptedStaleEvidence = select({
      storeRoot,
      scenario: sharedCasAuthorityScenario,
      assetTrust,
    });
    assert.equal(afterAcceptedStaleEvidence.selection.decision, "downgrade");
    assert.ok(hasReason(
      afterAcceptedStaleEvidence.selection,
      "evidence_stale",
      "downgrade",
    ));
  });
  const sharedCasEvidenceLevelGateId = "issue-277-shared-cas-evidence-level-gate";
  const sharedCasEvidenceLevelDraft = prepareEvidenceManifest({
    storeRoot,
    registry,
    portfolioId: "ask.portfolio.issue277.shared-cas-evidence-level",
    revision: "v1",
    entry: challengerTemplate(),
    evidenceMode: "missing",
    requiredEvidenceLevel: "runtime_detected",
    gateId: sharedCasEvidenceLevelGateId,
  });
  const sharedCasEvidenceLevelScenario = activateInitial({
    storeRoot,
    draft: sharedCasEvidenceLevelDraft,
    assetTrust,
  });
  regression("an unaccepted evidence level cannot establish stale material in a shared CAS", () => {
    const before = select({
      storeRoot,
      scenario: sharedCasEvidenceLevelScenario,
      assetTrust,
    });
    assert.equal(before.selection.decision, "bypass");
    assert.ok(hasReason(before.selection, "evidence_missing", "bypass"));

    putVerificationEvidence({
      storeRoot,
      evidence: sealEvidence({
        gateId: sharedCasEvidenceLevelGateId,
        selectionBasisDigest: digest("unaccepted-evidence-level-selection-basis"),
        targetRevision: "unaccepted-evidence-level-revision",
        targetTreeDigest: digest("unaccepted-evidence-level-tree"),
        evidenceLevel: "runtime_detected",
      }),
    });
    const afterUnacceptedEvidenceLevel = select({
      storeRoot,
      scenario: sharedCasEvidenceLevelScenario,
      assetTrust,
    });
    assert.deepEqual(afterUnacceptedEvidenceLevel.selection, before.selection);
  });
  check("stale adapter identity follows typed downgrade", () => {
    const resolved = select({ storeRoot, scenario: evidenceScenarios.stale, assetTrust });
    assert.equal(resolved.selection.decision, "downgrade");
    assert.ok(hasReason(resolved.selection, "evidence_stale", "downgrade"));
  });
  for (const [mode, label] of [
    ["stale-target", "target"],
    ["stale-input", "consumed input"],
    ["stale-toolchain", "toolchain"],
  ]) {
    check(`stale evidence ${label} identity follows typed downgrade`, () => {
      const resolved = select({ storeRoot, scenario: evidenceScenarios[mode], assetTrust });
      assert.equal(resolved.selection.decision, "downgrade");
      assert.ok(hasReason(resolved.selection, "evidence_stale", "downgrade"));
    });
  }
  check("unaccepted evidence producer follows typed authority fallback", () => {
    const resolved = select({ storeRoot, scenario: evidenceScenarios["authority-mismatch"], assetTrust });
    assert.equal(resolved.selection.decision, "bypass");
    assert.ok(hasReason(resolved.selection, "evidence_authority_mismatch", "bypass"));
  });
  check("uncovered exact evidence obligations follow typed coverage fallback", () => {
    const resolved = select({ storeRoot, scenario: evidenceScenarios["coverage-mismatch"], assetTrust });
    assert.equal(resolved.selection.decision, "bypass");
    assert.ok(hasReason(resolved.selection, "evidence_coverage_mismatch", "bypass"));
  });
  check("exact PASS and FAIL evidence conflict stops selection", () => {
    const resolved = select({ storeRoot, scenario: evidenceScenarios.conflict, assetTrust });
    assert.equal(resolved.selection.decision, "stop");
    assert.equal(resolved.selection.selected_assets.length, 0);
    assert.ok(hasReason(resolved.selection, "evidence_conflict", "stop"));
  });

  const registryBindingCases = [
    ["wrong Asset version", (entry) => { entry.asset.version = "2.0.0"; }, /not registered|exact Asset version/iu],
    ["wrong Asset record digest", (entry) => { entry.asset.record_digest = digest("wrong-record"); }, /digest transplant/iu],
    ["wrong Asset content digest", (entry) => { entry.asset.content_digest = digest("wrong-content"); }, /digest transplant/iu],
    ["wrong Asset Registry state", (entry) => { entry.expected_registry_state = "admitted"; }, /Registry state mismatch/iu],
    ["wrong Asset scope", (entry) => { entry.expected_scope_id = "other-scope"; }, /scope transplant|expected scope/iu],
  ];
  for (const [label, mutate, pattern] of registryBindingCases) {
    const entry = challengerTemplate();
    mutate(entry);
    const suffix = label.toLowerCase().replaceAll(" ", "-");
    const draft = prepareEvidenceManifest({
      storeRoot,
      registry,
      portfolioId: `ask.portfolio.issue277.${suffix}`,
      revision: "v1",
      entry,
      evidenceMode: "missing",
      gateId: `issue-277-${suffix}-gate`,
    });
    expectFailure(
      `${label} is rejected against the exact Registry snapshot`,
      () => publishManifest({ storeRoot, draft, assetTrust }),
      pattern,
    );
  }

  const reverseIdentityEntries = [
    portfolioEntry({
      entryId: "z-challenger",
      asset: assets.challenger,
    }),
    portfolioEntry({
      entryId: "a-experiment",
      asset: assets.experiment,
    }),
  ];
  const orderingScenario = createExploratoryScenario({
    storeRoot,
    registry,
    assetTrust,
    portfolioId: "ask.portfolio.issue277.ordering",
    entries: reverseIdentityEntries,
  });
  const orderingResolved = select({ storeRoot, scenario: orderingScenario, assetTrust });
  check("eligible Assets are ordered by exact Asset identity, not entry ID", () => {
    assert.equal(orderingResolved.selection.decision, "selected");
    assert.deepEqual(
      orderingResolved.selection.selected_assets.map((entry) => entry.entry_id),
      ["z-challenger", "a-experiment"],
    );
    assert.ok(Object.values(orderingResolved.selection.budget).every((entry) => entry.status === "within"));
  });
  const overlappingSelection = structuredClone(orderingResolved.selection);
  overlappingSelection.omitted_assets = [{
    entry_id: overlappingSelection.selected_assets[0].entry_id,
    asset: structuredClone(overlappingSelection.selected_assets[0].asset),
    action: "bypass",
    reason_codes: ["asset_inapplicable"],
  }];
  overlappingSelection.selection_digest = computePortfolioSelectionDigest(overlappingSelection);
  expectFailure(
    "selection record rejects an entry present in both selected and omitted sets",
    () => validatePortfolioSelection(overlappingSelection),
    /both selected and omitted/iu,
  );

  const unrestrictedRisk = { status: "unrestricted", included: [], excluded: [] };
  const unknownSelectorEntries = reverseIdentityEntries.map((entry) => ({
    ...structuredClone(entry),
    selectors: selectors({ risk_classes: unrestrictedRisk }),
  }));
  const unknownSelectorScenario = createExploratoryScenario({
    storeRoot,
    registry,
    assetTrust,
    portfolioId: "ask.portfolio.issue277.unknown-selector",
    entries: unknownSelectorEntries,
    manifestSelectors: selectors({
      risk_classes: { status: "unknown", included: [], excluded: [] },
    }),
  });
  check("unknown Portfolio selector is typed fail-closed and omits every entry", () => {
    const resolved = select({ storeRoot, scenario: unknownSelectorScenario, assetTrust });
    assert.equal(resolved.selection.decision, "bypass");
    assert.equal(resolved.selection.selected_assets.length, 0);
    assert.equal(resolved.selection.omitted_assets.length, unknownSelectorEntries.length);
    assert.ok(resolved.selection.omitted_assets.every((entry) => entry.reason_codes.includes("portfolio_inapplicable")));
  });

  const conflictScenario = createExploratoryScenario({
    storeRoot,
    registry,
    assetTrust,
    portfolioId: "ask.portfolio.issue277.selector-conflict",
    entries: reverseIdentityEntries,
    unresolvedConflicts: [{
      conflict_id: "overlapping-candidates",
      entry_ids: reverseIdentityEntries.map((entry) => entry.entry_id),
      selectors: selectors(),
      reason_code: "selector_conflict",
    }],
  });
  check("applicable unresolved selector conflict stops before exposing Assets", () => {
    const resolved = select({ storeRoot, scenario: conflictScenario, assetTrust });
    assert.equal(resolved.selection.decision, "stop");
    assert.equal(resolved.selection.selected_assets.length, 0);
    assert.ok(hasReason(resolved.selection, "selector_conflict", "stop"));
    assert.ok(resolved.selection.omitted_assets.every((entry) => entry.reason_codes.includes("selector_conflict")));
  });

  const unknownConflictScenario = createExploratoryScenario({
    storeRoot,
    registry,
    assetTrust,
    portfolioId: "ask.portfolio.issue277.unknown-conflict",
    entries: reverseIdentityEntries,
    unresolvedConflicts: [{
      conflict_id: "unknown-overlap",
      entry_ids: reverseIdentityEntries.map((entry) => entry.entry_id),
      selectors: selectors({
        risk_classes: { status: "unknown", included: [], excluded: [] },
      }),
      reason_code: "selector_conflict",
    }],
  });
  check("unknown conflict selector stops and propagates a typed omission reason", () => {
    const resolved = select({ storeRoot, scenario: unknownConflictScenario, assetTrust });
    assert.equal(resolved.selection.decision, "stop");
    assert.equal(resolved.selection.selected_assets.length, 0);
    assert.ok(resolved.selection.omitted_assets.every((entry) => entry.reason_codes.includes("selector_conflict")));
  });

  const unknownBudgetEntry = portfolioEntry({
    entryId: "unknown-cost",
    asset: assets.challenger,
    costEstimate: {
      token_count: unknown(),
      duration_ms: unknown(),
      cost_microunits: unknown(),
    },
  });
  const unknownBudgetScenario = createExploratoryScenario({
    storeRoot,
    registry,
    assetTrust,
    portfolioId: "ask.portfolio.issue277.unknown-budget",
    entries: [unknownBudgetEntry],
    budgets: { unknown_value_action: "bypass" },
  });
  check("unknown token, duration, or cost follows explicit budget bypass", () => {
    const resolved = select({ storeRoot, scenario: unknownBudgetScenario, assetTrust });
    assert.equal(resolved.selection.decision, "bypass");
    assert.ok(hasReason(resolved.selection, "budget_unknown", "bypass"));
    assert.equal(resolved.selection.selected_assets.length, 0);
  });

  const exceededBudgetScenario = createExploratoryScenario({
    storeRoot,
    registry,
    assetTrust,
    portfolioId: "ask.portfolio.issue277.exceeded-budget",
    entries: [portfolioEntry({ entryId: "over-budget", asset: assets.challenger })],
    budgets: {
      policy_limits: {
        token_count: bounded(5),
        duration_ms: bounded(5),
        cost_microunits: bounded(5),
      },
      exceeded_action: "stop",
    },
  });
  check("over-budget Asset selection stops with no selected Assets", () => {
    const resolved = select({ storeRoot, scenario: exceededBudgetScenario, assetTrust });
    assert.equal(resolved.selection.decision, "stop");
    assert.ok(hasReason(resolved.selection, "budget_exceeded", "stop"));
    assert.equal(resolved.selection.selected_assets.length, 0);
  });

  const unavailableBudgetResolved = select({
    storeRoot,
    scenario: orderingScenario,
    assetTrust,
    contextOverrides: {
      availableBudget: {
        token_count: unknown(),
        duration_ms: known(1000),
        cost_microunits: known(1000),
      },
    },
  });
  check("unknown available budget is not inferred from policy limits", () => {
    assert.equal(unavailableBudgetResolved.selection.decision, "bypass");
    assert.equal(unavailableBudgetResolved.selection.budget.token_count.status, "unknown");
    assert.ok(hasReason(unavailableBudgetResolved.selection, "budget_unknown", "bypass"));
  });

  const prohibitedTaskScenario = createExploratoryScenario({
    storeRoot,
    registry,
    assetTrust,
    portfolioId: "ask.portfolio.issue277.prohibited-task",
    entries: [portfolioEntry({
      entryId: "prohibited",
      asset: assets.challenger,
      prohibitedTaskClasses: [TASK_CLASS],
    })],
  });
  check("prohibited task class has stop precedence", () => {
    const resolved = select({ storeRoot, scenario: prohibitedTaskScenario, assetTrust });
    assert.equal(resolved.selection.decision, "stop");
    assert.ok(hasReason(resolved.selection, "prohibited_task_class", "stop"));
  });

  const prohibitedEffectDraft = manifestDraft({
    portfolioId: "ask.portfolio.issue277.prohibited-effect-explicit",
    revision: "v1",
    registry,
    entries: [portfolioEntry({ entryId: "unsafe-effect", asset: assets.challenger })],
    prohibitedEffects: ["read_repository"],
  });
  const prohibitedEffectExplicit = activateInitial({ storeRoot, draft: prohibitedEffectDraft, assetTrust });
  check("explicitly prohibited Asset effect stops selection", () => {
    const resolved = select({ storeRoot, scenario: prohibitedEffectExplicit, assetTrust });
    assert.equal(resolved.selection.decision, "stop");
    assert.ok(hasReason(resolved.selection, "prohibited_effect", "stop"));
  });

  const highRiskSelectors = selectors({
    risk_classes: selectorDimension(["high"]),
  });
  const highImpactEntry = portfolioEntry({
    entryId: "high-impact-baseline",
    asset: assets["high-impact"],
    role: "baseline",
    assuranceLane: "high_impact_active",
    expectedState: "current",
    entrySelectors: highRiskSelectors,
  });
  const highImpactDraft = prepareEvidenceManifest({
    storeRoot,
    registry,
    portfolioId: "ask.portfolio.issue277.high-impact",
    revision: "v1",
    entry: highImpactEntry,
    evidenceMode: "exact",
    gateId: "issue-277-high-impact-gate",
    manifestOverrides: { manifestSelectors: highRiskSelectors },
  });
  const highImpactPublication = publishManifest({ storeRoot, draft: highImpactDraft, assetTrust });
  const highImpactEmpty = createEmptyPortfolioLock({
    storeRoot,
    portfolioId: highImpactPublication.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
  });
  const exactHighImpactGrant = {
    grant_kind: "high_impact_independent_activation",
    manifest_digest: highImpactPublication.manifest_digest,
    entry_id: highImpactEntry.entry_id,
    asset: exactAssetRef(assets["high-impact"]),
    approval_authority: {
      kind: "external_high_impact_approval_authority",
      authority_id: "issue-277-independent-high-impact-reviewer",
      authority_revision: "high-impact-v1",
      authority_evidence_digest: digest("independent-high-impact-approval"),
    },
  };
  const highImpactContext = (grants, revision) => buildPortfolioAuthorityContext({
    portfolioId: highImpactPublication.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: highImpactEmpty.lock_digest,
    transitions: [manifestTransition(highImpactPublication, null, "current")],
    grants,
    authority: portfolioAuthority({ revision }),
  });
  const noHighImpactGrant = highImpactContext([], "high-no-grant");
  expectFailure(
    "high-impact activation without independent approval is rejected",
    () => applyPortfolioTransitions({
      storeRoot,
      predecessorLockDigest: highImpactEmpty.lock_digest,
      authorityContext: noHighImpactGrant,
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /high-impact activation requires|approval grant/iu,
  );
  const wrongVersionGrant = structuredClone(exactHighImpactGrant);
  wrongVersionGrant.asset.version = "2.0.0";
  const wrongHighImpactGrant = highImpactContext([wrongVersionGrant], "high-wrong-version");
  expectFailure(
    "high-impact approval cannot be transplanted to another Asset version",
    () => applyPortfolioTransitions({
      storeRoot,
      predecessorLockDigest: highImpactEmpty.lock_digest,
      authorityContext: wrongHighImpactGrant,
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /high-impact activation requires|approval grant/iu,
  );
  const foreignGrant = {
    ...structuredClone(exactHighImpactGrant),
    manifest_digest: digest("foreign-manifest"),
    entry_id: "foreign-entry",
    approval_authority: {
      ...structuredClone(exactHighImpactGrant.approval_authority),
      authority_evidence_digest: digest("foreign-approval"),
    },
  };
  const extraHighImpactGrant = highImpactContext(
    [exactHighImpactGrant, foreignGrant],
    "high-extra-grant",
  );
  expectFailure(
    "foreign or unused high-impact grant is rejected",
    () => applyPortfolioTransitions({
      storeRoot,
      predecessorLockDigest: highImpactEmpty.lock_digest,
      authorityContext: extraHighImpactGrant,
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /unused|transplanted|grant/iu,
  );
  const exactHighImpactAuthority = highImpactContext([exactHighImpactGrant], "high-exact-grant");
  expectFailure(
    "high-impact approval grant must be supplied as a separate trusted root",
    () => applyPortfolioTransitions({
      storeRoot,
      predecessorLockDigest: highImpactEmpty.lock_digest,
      authorityContext: exactHighImpactAuthority,
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /separately trusted|approval.*trust/iu,
  );
  const sameAuthorityGrant = structuredClone(exactHighImpactGrant);
  sameAuthorityGrant.approval_authority.authority_id = "issue-277-portfolio-maintainer";
  const sameAuthorityContext = highImpactContext([sameAuthorityGrant], "high-self-approved");
  expectFailure(
    "high-impact approval authority must differ from lifecycle activation authority",
    () => applyPortfolioTransitions({
      storeRoot,
      predecessorLockDigest: highImpactEmpty.lock_digest,
      authorityContext: sameAuthorityContext,
      trustedAssetAuthorityContexts: assetTrust,
      trustedHighImpactApprovalGrants: [sameAuthorityGrant],
    }),
    /independent|differ/iu,
  );
  const highImpactLock = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: highImpactEmpty.lock_digest,
    authorityContext: exactHighImpactAuthority,
    trustedAssetAuthorityContexts: assetTrust,
    trustedHighImpactApprovalGrants: [exactHighImpactGrant],
  });
  const highImpactScenario = {
    publication: highImpactPublication,
    authorityContext: exactHighImpactAuthority,
    lock: highImpactLock,
  };
  check("exact high-impact approval permits only the bound active Asset version", () => {
    const resolved = select({
      storeRoot,
      scenario: highImpactScenario,
      assetTrust,
      highImpactTrust: [exactHighImpactGrant],
      contextOverrides: { riskClass: "high" },
    });
    assert.equal(resolved.selection.decision, "selected");
    assert.equal(resolved.selection.selected_assets[0].assurance_lane, "high_impact_active");
    assert.deepEqual(resolved.selection.selected_assets[0].asset, exactHighImpactGrant.asset);
  });
  check("high-impact export identifies the separately trusted approval grant", () => {
    const resolved = select({
      storeRoot,
      scenario: highImpactScenario,
      assetTrust,
      highImpactTrust: [exactHighImpactGrant],
      contextOverrides: { riskClass: "high" },
    });
    const reference = exportPortfolioReference({
      storeRoot,
      lockDigest: highImpactLock.lock_digest,
      selectionObjectDigests: [resolved.selection_object_digest],
      trustedPortfolioAuthorityContexts: [exactHighImpactAuthority],
      trustedAssetAuthorityContexts: assetTrust,
      trustedHighImpactApprovalGrants: [exactHighImpactGrant],
    });
    assert.deepEqual(reference.required_high_impact_approval_grant_digests, [
      digest(stableCanonicalJson(exactHighImpactGrant)),
    ]);
  });

  const rollbackTransitions = [
    manifestTransition(baselinePublication, "current", "historical"),
    manifestTransition(kernelPublicationFirst, "superseded", "current"),
  ];
  const ordinaryRollbackAttempt = buildPortfolioAuthorityContext({
    portfolioId: kernelPublicationFirst.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: baselineLockFirst.lock_digest,
    transitions: rollbackTransitions,
    authority: portfolioAuthority({ revision: "ordinary-rollback-attempt" }),
  });
  expectFailure(
    "ordinary activation authority cannot restore a superseded manifest",
    () => applyPortfolioTransitions({
      storeRoot,
      predecessorLockDigest: baselineLockFirst.lock_digest,
      authorityContext: ordinaryRollbackAttempt,
      trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /rollback transition requires explicit rollback authority/iu,
  );

  const driftedRollbackTarget = {
    ...portfolioRef(kernelPublicationFirst),
    asset_set_digest: digest("drifted-asset-set"),
  };
  const driftedRollbackAuthority = buildPortfolioAuthorityContext({
    portfolioId: kernelPublicationFirst.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: baselineLockFirst.lock_digest,
    transitions: rollbackTransitions,
    rollbackTarget: driftedRollbackTarget,
    authority: portfolioAuthority({
      kind: "external_portfolio_rollback_authority",
      revision: "rollback-drifted-target",
    }),
  });
  expectFailure(
    "rollback authority rejects target Asset-set drift",
    () => applyPortfolioTransitions({
      storeRoot,
      predecessorLockDigest: baselineLockFirst.lock_digest,
      authorityContext: driftedRollbackAuthority,
      trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /rollback authority target drift/iu,
  );

  const exactRollbackAuthority = buildPortfolioAuthorityContext({
    portfolioId: kernelPublicationFirst.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: baselineLockFirst.lock_digest,
    transitions: rollbackTransitions,
    rollbackTarget: portfolioRef(kernelPublicationFirst),
    authority: portfolioAuthority({
      kind: "external_portfolio_rollback_authority",
      revision: "rollback-exact",
    }),
  });
  const rollbackLockFirst = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: baselineLockFirst.lock_digest,
    authorityContext: exactRollbackAuthority,
    trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
    trustedAssetAuthorityContexts: assetTrust,
  });
  const rollbackLockSecond = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: baselineLockFirst.lock_digest,
    authorityContext: exactRollbackAuthority,
    trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
    trustedAssetAuthorityContexts: assetTrust,
  });
  const rollbackPortfolioTrust = [...baselinePortfolioTrust, exactRollbackAuthority];
  check("exact rollback restores prior manifest and Asset-set while preserving history", () => {
    assert.equal(rollbackLockFirst.lock_digest, rollbackLockSecond.lock_digest);
    assert.equal(rollbackLockSecond.created, false);
    assert.equal(rollbackLockFirst.current_manifest_digest, kernelPublicationFirst.manifest_digest);
    assert.equal(rollbackLockFirst.current_asset_set_digest, kernelPublicationFirst.asset_set_digest);
    const verified = verifyPortfolioLock({
      storeRoot,
      lockDigest: rollbackLockFirst.lock_digest,
      trustedPortfolioAuthorityContexts: rollbackPortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    });
    assert.deepEqual(
      verified.lock.entries.map((entry) => [entry.revision, entry.state]),
      [["baseline-v2", "historical"], ["kernel-v1", "current"]],
    );
    assert.equal(verified.lock.predecessor.lock_digest, baselineLockFirst.lock_digest);
  });
  expectFailure(
    "rollback authority cannot be applied to a different predecessor lock",
    () => applyPortfolioTransitions({
      storeRoot,
      predecessorLockDigest: kernelLock.lock_digest,
      authorityContext: exactRollbackAuthority,
      trustedPortfolioAuthorityContexts: [kernelAuthority],
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /stale Portfolio authority predecessor lock mismatch/iu,
  );
  expectFailure(
    "rollback history verification requires the exact rollback context",
    () => verifyPortfolioLock({
      storeRoot,
      lockDigest: rollbackLockFirst.lock_digest,
      trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    }),
    /trusted Portfolio authority context/iu,
  );

  const orphanDraft = manifestDraft({
    portfolioId: kernelPublicationFirst.portfolio_id,
    revision: "orphan-v3",
    registry,
    rollbackTarget: portfolioRef(kernelPublicationFirst),
  });
  const orphanPublication = publishManifest({ storeRoot, draft: orphanDraft, assetTrust });
  check("stored orphan manifest cannot change current authority without a lock transition", () => {
    assert.notEqual(orphanPublication.manifest_digest, kernelPublicationFirst.manifest_digest);
    const current = resolveCurrentPortfolio({
      storeRoot,
      lockDigest: rollbackLockFirst.lock_digest,
      trustedPortfolioAuthorityContexts: rollbackPortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    });
    assert.equal(current.manifest_digest, kernelPublicationFirst.manifest_digest);
  });

  const rolledBackScenario = {
    publication: kernelPublicationFirst,
    authorityContext: exactRollbackAuthority,
    lock: rollbackLockFirst,
  };
  const rolledBackSelection = select({
    storeRoot,
    scenario: rolledBackScenario,
    assetTrust,
    portfolioTrust: rollbackPortfolioTrust,
  });
  check("portable export denies latest, execution, and effectiveness implications", () => {
    const reference = exportPortfolioReference({
      storeRoot,
      lockDigest: rollbackLockFirst.lock_digest,
      selectionObjectDigests: [rolledBackSelection.selection_object_digest],
      trustedPortfolioAuthorityContexts: rollbackPortfolioTrust,
      trustedAssetAuthorityContexts: assetTrust,
    });
    assert.equal(reference.mutable_latest_pointer_used, false);
    assert.equal(reference.runtime_activation_implied, false);
    assert.equal(reference.execution_implied, false);
    assert.equal(reference.effectiveness_implied, false);
    assert.equal(JSON.stringify(reference).includes(temporaryRoot), false);
  });

  const retiringSuccessorDraft = manifestDraft({
    portfolioId: kernelPublicationFirst.portfolio_id,
    revision: "retiring-successor-v3",
    registry,
    rollbackTarget: portfolioRef(baselinePublication),
  });
  const retiringSuccessorPublication = publishManifest({
    storeRoot,
    draft: retiringSuccessorDraft,
    assetTrust,
  });
  const retiringActivationAuthority = buildPortfolioAuthorityContext({
    portfolioId: kernelPublicationFirst.portfolio_id,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: baselineLockFirst.lock_digest,
    transitions: [
      manifestTransition(baselinePublication, "current", "retired"),
      manifestTransition(retiringSuccessorPublication, null, "current"),
    ],
    authority: portfolioAuthority({ revision: "retiring-successor-v3" }),
  });
  regression("ordinary activation rejects retiring its exact rollback target before publication", () => {
    const objectCountBefore = listContentAddressedJson({ storeRoot }).length;
    let rejection = null;
    let accepted = null;
    try {
      accepted = applyPortfolioTransitions({
        storeRoot,
        predecessorLockDigest: baselineLockFirst.lock_digest,
        authorityContext: retiringActivationAuthority,
        trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
        trustedAssetAuthorityContexts: assetTrust,
      });
    } catch (error) {
      rejection = error;
    }
    const objectCountAfter = listContentAddressedJson({ storeRoot }).length;
    assert.ok(
      rejection,
      `ordinary activation accepted unrollbackable lock ${accepted?.lock_digest}; CAS objects ${objectCountBefore} -> ${objectCountAfter}`,
    );
    assert.equal(objectCountAfter, objectCountBefore, "rejected activation must not publish authority or lock objects");
  });

  regression("selection context rejects duplicate current-state IDs with different digests", () => {
    const duplicatedStateRefs = [
      ...structuredClone(REQUIRED_STATE_REFS),
      {
        state_id: REQUIRED_STATE_REFS[0].state_id,
        state_digest: digest("conflicting-current-state"),
      },
    ];
    assert.throws(
      () => selectionContext({
        lockDigest: baselineLockFirst.lock_digest,
        currentStateRefs: duplicatedStateRefs,
      }),
      /duplicate|repeat|current-state ID/iu,
      "duplicate current-state ID was accepted and left Map precedence ambiguous",
    );
  });

  for (const postResultValue of [
    "promotion_decision_adopt",
    "reward_high",
    "verdict_pass",
  ]) {
    regression(`selection context rejects post-result synonym ${postResultValue}`, () => {
      assert.throws(
        () => selectionContext({
          lockDigest: baselineLockFirst.lock_digest,
          taskClass: postResultValue,
        }),
        /prohibited|post-result|pre-result/iu,
        `post-result selector value ${postResultValue} was accepted`,
      );
    });
  }

  const mixedBudgetScenario = createExploratoryScenario({
    storeRoot,
    registry,
    assetTrust,
    portfolioId: "ask.portfolio.issue277.mixed-budget-severity",
    entries: [portfolioEntry({
      entryId: "mixed-budget",
      asset: assets.challenger,
      costEstimate: knownCost(10),
    })],
    budgets: {
      unknown_value_action: "bypass",
      exceeded_action: "stop",
    },
  });
  regression("mixed unknown and exceeded budget metrics combine by stop severity", () => {
    const resolved = select({
      storeRoot,
      scenario: mixedBudgetScenario,
      assetTrust,
      contextOverrides: {
        availableBudget: {
          token_count: unknown(),
          duration_ms: known(5),
          cost_microunits: known(1000),
        },
      },
    });
    assert.equal(
      resolved.selection.decision,
      "stop",
      `mixed budget resolved ${resolved.selection.decision}; reasons=${resolved.selection.reasons.map((reason) => `${reason.action}:${reason.code}`).join(",")}`,
    );
    assert.ok(hasReason(resolved.selection, "budget_exceeded", "stop"));
  });

  const declaredBoundaryScenario = createExploratoryScenario({
    storeRoot,
    registry,
    assetTrust,
    portfolioId: "ask.portfolio.issue277.declared-permission-boundary",
    entries: [portfolioEntry({
      entryId: "declared-permission-boundary",
      asset: assets["declared-boundary"],
      actions: failureActions({ safety_unknown: "downgrade" }),
    })],
  });
  regression("declared-by-consumer permissions remain an unverified safety boundary", () => {
    const resolved = select({ storeRoot, scenario: declaredBoundaryScenario, assetTrust });
    assert.equal(
      resolved.selection.decision,
      "downgrade",
      `declared_by_consumer permissions resolved ${resolved.selection.decision} without safety_unknown`,
    );
    assert.ok(hasReason(resolved.selection, "safety_unknown", "downgrade"));
  });

  const forgedKernelSelection = structuredClone(kernelSelectionFirst.selection);
  forgedKernelSelection.decision = "stop";
  forgedKernelSelection.reasons = [{
    action: "stop",
    code: "selector_conflict",
    entry_id: null,
    subject_digest: kernelPublicationFirst.manifest_digest,
  }];
  forgedKernelSelection.selection_digest = computePortfolioSelectionDigest(forgedKernelSelection);
  validatePortfolioSelection(forgedKernelSelection);
  const forgedKernelSelectionPublication = putContentAddressedJson({
    storeRoot,
    artifact: forgedKernelSelection,
  });
  regression("Portfolio export reconstructs and rejects a forged deterministic decision", () => {
    assert.throws(
      () => exportPortfolioReference({
        storeRoot,
        lockDigest: kernelLock.lock_digest,
        selectionObjectDigests: [forgedKernelSelectionPublication.digest],
        trustedPortfolioAuthorityContexts: [kernelAuthority],
        trustedAssetAuthorityContexts: assetTrust,
      }),
      /deterministic|reconstruct|selection.*match|forg/iu,
      "schema-valid forged Portfolio decision was exported without deterministic reconstruction",
    );
  });

  if (regressionFailures.length > 0) {
    throw new Error([
      `Issue 277 regression RED (${regressionFailures.length})`,
      ...regressionFailures.map(({ label, message }, index) => `${index + 1}. ${label}: ${message}`),
    ].join("\n"));
  }

  check("Asset, manifest, lock, evidence, context, and selection share one CAS object set", () => {
    const objects = listContentAddressedJson({ storeRoot });
    const kinds = new Set(objects.map((object) => object.value.object_kind).filter(Boolean));
    assert.ok(kinds.has("asset_record"));
    assert.ok(kinds.has("portfolio_manifest"));
    assert.ok(kinds.has("portfolio_lock"));
    assert.ok(kinds.has("portfolio_selection_context"));
    assert.ok(kinds.has("portfolio_selection"));
    assert.ok(objects.some((object) => object.value.program === "ask_verification_evidence"));
    assert.equal(
      readFileSync(contentAddressedObjectPath({
        storeRoot,
        digest: baselinePublication.manifest_digest,
      })).length > 0,
      true,
    );
  });

  check("CAS tamper is rejected during deterministic selection verification", () => {
    const objectPath = contentAddressedObjectPath({
      storeRoot,
      digest: baselineSelectionFirst.selection_object_digest,
    });
    const tampered = structuredClone(baselineSelectionFirst.selection);
    tampered.selection_digest = digest("tampered-selection");
    writeFileSync(objectPath, `${stableCanonicalJson(tampered)}\n`);
    assert.throws(
      () => verifyPortfolioSelection({
        storeRoot,
        selectionObjectDigest: baselineSelectionFirst.selection_object_digest,
        selectorContext: baselineSelectionFirst.context,
        trustedPortfolioAuthorityContexts: baselinePortfolioTrust,
        trustedAssetAuthorityContexts: assetTrust,
      }),
      /digest|content-addressed|tamper/iu,
    );
  });
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log(`Portfolio Manager contract tests passed (${caseCount} cases)`);
