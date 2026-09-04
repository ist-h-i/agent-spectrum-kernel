import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalDigest,
  putContentAddressedJson,
  readContentAddressedJson,
  stableCanonicalJson,
} from "./content-addressed-store.mjs";
import { verifyAssetRegistry } from "./asset-registry.mjs";
import {
  applyPortfolioTransitions,
  verifyPortfolioLock,
  verifyPortfolioManifest,
  verifyPortfolioSelection,
} from "./portfolio-manager.mjs";
import { validateJsonSchema } from "./execution-envelope.mjs";

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = "1.0.0";
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const RECOMMENDATIONS = new Set(["expand", "retain", "simplify", "stop", "insufficient_evidence"]);
const ACTIONS = new Set(["adopt_candidate", "retain_current", "revise_candidate", "reject_candidate", "retire_current", "insufficient_evidence"]);
const NOOP_ACTIONS = new Set(["retain_current", "revise_candidate", "insufficient_evidence"]);
const INCOMPLETE_STATUSES = new Set(["insufficient_evidence", "unknown", "unavailable", "not_applicable"]);
const INCOMPLETE_CONCLUSIONS = new Set(["unknown", "unavailable", "not_applicable"]);
const DIMENSION_NAMES = Object.freeze(["quality", "safety", "cost", "variance", "mechanism", "external_outcome"]);
const DIMENSION_SOURCE_KINDS = Object.freeze({
  quality: new Set(["result_set", "paired_comparison_report", "directional_outcome_report", "portfolio_aggregate_result"]),
  safety: new Set(["result_set", "paired_comparison_report", "directional_outcome_report", "portfolio_aggregate_result"]),
  cost: new Set(["result_set", "paired_comparison_report", "directional_outcome_report", "portfolio_aggregate_result"]),
  variance: new Set(["repetition_report", "portfolio_aggregate_result"]),
  mechanism: new Set(["mechanism_scorecard"]),
  external_outcome: new Set(["external_outcome_report"]),
});
const OUTCOME_LIKE_KEY = /(?:^|_)(?:observed_result|post_result|measured_result|score|scores|verdict|reward|outcome|evaluation_result|promotion_decision)(?:_|$)/iu;

const schemaPath = (name) => {
  const colocated = resolve(RUNTIME_ROOT, name);
  return existsSync(colocated) ? colocated : resolve(RUNTIME_ROOT, "../schemas", name);
};

const SCHEMAS = Object.freeze({
  candidate: schemaPath("evolution-candidate.schema.json"),
  experiment: schemaPath("evolution-experiment.schema.json"),
  recommendation: schemaPath("evolution-recommendation.schema.json"),
  proposal: schemaPath("evolution-action-proposal.schema.json"),
  decision: schemaPath("evolution-human-decision.schema.json"),
  receipt: schemaPath("evolution-application-receipt.schema.json"),
});

function cloneJson(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareCanonical(left, right) {
  return stableCanonicalJson(left) === stableCanonicalJson(right);
}

function assertDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) throw new Error(`${label} must be a sha256 digest`);
}

function validateSchema(value, path, label) {
  const errors = validateJsonSchema(value, { schemaPath: path });
  if (errors.length > 0) throw new Error(`${label} failed closed schema validation: ${errors.join("; ")}`);
}

function withoutField(value, field) {
  const result = cloneJson(value);
  delete result[field];
  return result;
}

function uniqueSortedText(values, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const sorted = [...values].sort(compareText);
  if (!allowEmpty && sorted.length === 0) throw new Error(`${label} must not be empty`);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1] === sorted[index]) throw new Error(`${label} contains a duplicate entry`);
  }
  return sorted;
}

function normalizeFactorSet(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const sorted = values.map(cloneJson).sort((left, right) => compareText(left.factor_id, right.factor_id)
    || compareText(left.identity_digest, right.identity_digest));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].factor_id === sorted[index].factor_id) throw new Error(`${label} repeats factor ID ${sorted[index].factor_id}`);
  }
  return sorted;
}

function normalizeAuthorityArray(values, key, label) {
  const sorted = values.map(cloneJson).sort((left, right) => compareText(left[key], right[key]));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1][key] === sorted[index][key]) throw new Error(`${label} repeats ${key} ${sorted[index][key]}`);
  }
  return sorted;
}

function assertSelfDigest(value, field, compute, label) {
  const expected = compute(value);
  if (value[field] !== expected) throw new Error(`${label} digest mismatch`);
}

function assertAssetRefMatches(left, right, label) {
  if (!compareCanonical(left, right)) throw new Error(`${label} exact Asset identity mismatch`);
}

function portfolioRefWithoutLock(value) {
  const result = cloneJson(value);
  delete result.lock_digest;
  return result;
}

function assertPortfolioRefMatches(left, right, label) {
  if (!compareCanonical(portfolioRefWithoutLock(left), portfolioRefWithoutLock(right))) {
    throw new Error(`${label} exact Portfolio identity mismatch`);
  }
}

function assertNoOutcomeLeakage(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoOutcomeLeakage(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (OUTCOME_LIKE_KEY.test(key)) throw new Error(`${path}.${key} introduces post-result outcome leakage`);
    assertNoOutcomeLeakage(entry, `${path}.${key}`);
  }
}

function publicationResult(publication, semanticField, semanticDigest, artifact) {
  return deepFreeze({
    object_digest: publication.digest,
    [semanticField]: semanticDigest,
    artifact: cloneJson(artifact),
    created: publication.created,
  });
}

function publishArtifact({ storeRoot, artifact, semanticField }) {
  const publication = putContentAddressedJson({ storeRoot, artifact });
  return publicationResult(publication, semanticField, artifact[semanticField], artifact);
}

function readArtifact({ storeRoot, objectDigest, validate, label }) {
  assertDigest(objectDigest, `${label} object digest`);
  const artifact = readContentAddressedJson({ storeRoot, digest: objectDigest }).value;
  validate(artifact);
  return artifact;
}

function exactTrustedAuthority(authority, trusted, label) {
  if (!Array.isArray(trusted)) throw new Error(`${label} trusted authorities must be an array`);
  if (!trusted.some((candidate) => compareCanonical(candidate, authority))) {
    throw new Error(`${label} requires a separately trusted exact authority context`);
  }
}

export function computeEvolutionCandidateDigest(value) {
  return canonicalDigest(withoutField(value, "candidate_digest"));
}

function normalizeCandidateDraft(draft) {
  const candidate = cloneJson(draft);
  candidate.schema_version = candidate.schema_version ?? SCHEMA_VERSION;
  candidate.object_kind = candidate.object_kind ?? "evolution_candidate";
  candidate.factors.changed = normalizeFactorSet(candidate.factors.changed, "candidate changed factors");
  candidate.factors.frozen = normalizeFactorSet(candidate.factors.frozen, "candidate frozen factors");
  candidate.evaluation_scope.fixture_ids = uniqueSortedText(candidate.evaluation_scope.fixture_ids, "candidate fixture IDs", { allowEmpty: false });
  candidate.evaluation_scope.task_classes = uniqueSortedText(candidate.evaluation_scope.task_classes, "candidate task classes", { allowEmpty: false });
  candidate.evaluation_scope.exclusions = uniqueSortedText(candidate.evaluation_scope.exclusions, "candidate exclusions");
  candidate.expected_upside = uniqueSortedText(candidate.expected_upside, "candidate expected upside", { allowEmpty: false });
  candidate.risks = uniqueSortedText(candidate.risks, "candidate risks", { allowEmpty: false });
  candidate.prohibited_effects = uniqueSortedText(candidate.prohibited_effects, "candidate prohibited effects", { allowEmpty: false });
  delete candidate.candidate_digest;
  candidate.candidate_digest = computeEvolutionCandidateDigest(candidate);
  return candidate;
}

export function validateEvolutionCandidate(candidate) {
  validateSchema(candidate, SCHEMAS.candidate, "Evolution candidate");
  assertSelfDigest(candidate, "candidate_digest", computeEvolutionCandidateDigest, "Evolution candidate");
  if (candidate.parent_asset.stable_id !== candidate.candidate_asset.stable_id
    || candidate.parent_asset.asset_type !== candidate.candidate_asset.asset_type) {
    throw new Error("Evolution candidate parent transplant rejected; stable Asset identity and type must match");
  }
  if (candidate.parent_asset.version === candidate.candidate_asset.version
    || candidate.parent_asset.record_digest === candidate.candidate_asset.record_digest
    || candidate.parent_asset.content_digest === candidate.candidate_asset.content_digest) {
    throw new Error("Evolution candidate must bind a distinct full-content revision");
  }
  assertAssetRefMatches(candidate.rollback.parent_asset, candidate.parent_asset, "candidate rollback parent");
  assertPortfolioRefMatches(candidate.rollback.parent_portfolio, candidate.parent_portfolio, "candidate rollback Portfolio");
  if (candidate.factors.design === "one_factor" && candidate.factors.changed.length !== 1) {
    throw new Error("one-factor Evolution candidate requires exactly one changed factor");
  }
  if (candidate.factors.design === "factorial_or_ablation_required" && candidate.factors.changed.length < 2) {
    throw new Error("multi-factor Evolution candidate requires at least two changed factors");
  }
  if (candidate.factors.frozen.length === 0) throw new Error("Evolution candidate requires at least one frozen factor");
  const changed = new Set(candidate.factors.changed.map(({ factor_id }) => factor_id));
  if (candidate.factors.frozen.some(({ factor_id }) => changed.has(factor_id))) {
    throw new Error("Evolution candidate factor cannot be both changed and frozen");
  }
  const authorityIds = [
    candidate.generation.actor.actor_id,
    candidate.authorities.experiment.authority_id,
    candidate.authorities.decision.authority_id,
  ];
  if (new Set(authorityIds).size !== authorityIds.length) {
    throw new Error("candidate generation, experiment, and human decision authorities must be distinct");
  }
  return candidate;
}

export function buildEvolutionCandidate(draft) {
  const candidate = normalizeCandidateDraft(draft);
  validateEvolutionCandidate(candidate);
  return deepFreeze(candidate);
}

export function publishEvolutionCandidate({ storeRoot, candidate }) {
  validateEvolutionCandidate(candidate);
  return publishArtifact({ storeRoot, artifact: candidate, semanticField: "candidate_digest" });
}

function assertResolvedAsset(reference, resolved, label) {
  assertAssetRefMatches(reference, {
    asset_type: resolved.asset_type,
    stable_id: resolved.stable_id,
    version: resolved.version,
    record_digest: resolved.record_digest,
    content_digest: resolved.content_digest,
  }, label);
}

function assertEvolutionCandidateLineageClosure(candidate, parent, revision) {
  const derivation = revision.record.derivation;
  if (derivation.kind !== "full_content_revision") {
    throw new Error("Evolution candidate Asset must be an exact full-content revision of its parent");
  }
  assertAssetRefMatches(derivation.parent, candidate.parent_asset, "Evolution candidate direct parent lineage");
  const rollbackTarget = revision.record.maintenance.rollback.target;
  if (rollbackTarget === null) {
    throw new Error("Evolution candidate Asset must preserve its exact direct parent as rollback target");
  }
  assertAssetRefMatches(rollbackTarget, candidate.rollback.parent_asset, "Evolution candidate Asset rollback target");
  assertResolvedAsset(candidate.parent_asset, parent, "Evolution candidate direct parent");
}

function verifyEvolutionCandidateInternal({
  storeRoot,
  candidateObjectDigest,
  trustedAssetAuthorityContexts = [],
  trustedPortfolioAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  const candidate = readArtifact({
    storeRoot,
    objectDigest: candidateObjectDigest,
    validate: validateEvolutionCandidate,
    label: "Evolution candidate",
  });
  const registry = verifyAssetRegistry({
    storeRoot,
    snapshotDigest: candidate.registry.snapshot_digest,
    trustedAuthorityContexts: trustedAssetAuthorityContexts,
  });
  const findExact = (reference, label) => {
    const matches = registry.assets.filter((asset) => asset.stable_id === reference.stable_id && asset.version === reference.version);
    if (matches.length !== 1) throw new Error(`${label} exact Asset revision is absent or ambiguous in the bound Registry snapshot`);
    return matches[0];
  };
  const parent = findExact(candidate.parent_asset, "Evolution parent");
  const revision = findExact(candidate.candidate_asset, "Evolution candidate");
  assertResolvedAsset(candidate.parent_asset, parent, "Evolution parent");
  assertResolvedAsset(candidate.candidate_asset, revision, "Evolution candidate");
  assertEvolutionCandidateLineageClosure(candidate, parent, revision);
  const verifiedLock = verifyPortfolioLock({
    storeRoot,
    lockDigest: candidate.parent_portfolio.lock_digest,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  const parentEntry = verifiedLock.lock.entries.find(({ manifest_digest }) => manifest_digest === candidate.parent_portfolio.manifest_digest);
  if (!parentEntry) throw new Error("Evolution candidate parent Portfolio is absent from the exact parent lock");
  assertPortfolioRefMatches(candidate.parent_portfolio, {
    portfolio_id: verifiedLock.lock.portfolio_id,
    revision: parentEntry.revision,
    manifest_digest: parentEntry.manifest_digest,
    asset_set_digest: parentEntry.asset_set_digest,
  }, "Evolution candidate parent Portfolio");
  return deepFreeze({
    candidate_object_digest: candidateObjectDigest,
    candidate: cloneJson(candidate),
    parent_asset: cloneJson(parent),
    candidate_asset: cloneJson(revision),
  });
}

export function verifyEvolutionCandidate(options) {
  const verified = verifyEvolutionCandidateInternal(options);
  return deepFreeze({
    candidate_object_digest: verified.candidate_object_digest,
    candidate: cloneJson(verified.candidate),
  });
}

export function computeEvolutionExperimentDigest(value) {
  return canonicalDigest(withoutField(value, "experiment_digest"));
}

const PROMPT_V2_EXACT_MAPPING_BASIS = Object.freeze({
  schema_version: SCHEMA_VERSION,
  projection_mode: "prompt_v2_exact",
  prompt_roles: Object.freeze({
    current_prompt: Object.freeze({
      experiment_role: "baseline",
      raw_scoring_condition: "full_ask",
    }),
    prompt_v2: Object.freeze({
      experiment_role: "challenger",
      raw_scoring_condition: "full_ask",
    }),
  }),
});

function promptV2ProjectionRole(role, promptRole) {
  return {
    prompt_role: promptRole,
    raw_scoring_condition: "full_ask",
    portfolio: cloneJson(role.portfolio),
    registry_snapshot_digest: role.registry_snapshot_digest,
    selection_object_digest: role.selection_object_digest,
    selection_digest: role.selection_digest,
    selected_asset: cloneJson(role.selected_asset),
  };
}

export function computePromptV2ExactProjectionDigests(roles) {
  const mappingDigest = canonicalDigest(PROMPT_V2_EXACT_MAPPING_BASIS);
  const projectionEvidence = {
    schema_version: SCHEMA_VERSION,
    projection_mode: "prompt_v2_exact",
    mapping_digest: mappingDigest,
    roles: {
      baseline: promptV2ProjectionRole(roles.baseline, "current_prompt"),
      challenger: promptV2ProjectionRole(roles.challenger, "prompt_v2"),
    },
  };
  return deepFreeze({
    mapping_digest: mappingDigest,
    projection_evidence_digest: canonicalDigest(projectionEvidence),
  });
}

function normalizeExperimentDraft(draft) {
  const experiment = cloneJson(draft);
  experiment.schema_version = experiment.schema_version ?? SCHEMA_VERSION;
  experiment.object_kind = experiment.object_kind ?? "evolution_experiment";
  experiment.protocol.fixture_ids = uniqueSortedText(experiment.protocol.fixture_ids, "experiment fixture IDs", { allowEmpty: false });
  experiment.protocol.task_classes = uniqueSortedText(experiment.protocol.task_classes, "experiment task classes", { allowEmpty: false });
  experiment.protocol.exclusions = uniqueSortedText(experiment.protocol.exclusions, "experiment exclusions");
  experiment.causal_design.changed_factor_ids = uniqueSortedText(experiment.causal_design.changed_factor_ids, "experiment changed factor IDs", { allowEmpty: false });
  experiment.causal_design.ablation_evidence_digests = uniqueSortedText(experiment.causal_design.ablation_evidence_digests, "experiment ablation evidence digests");
  experiment.recommendation_policy.rules = normalizeAuthorityArray(experiment.recommendation_policy.rules, "rule_id", "recommendation rules");
  for (const rule of experiment.recommendation_policy.rules) {
    for (const dimension of Object.keys(rule.match)) rule.match[dimension] = uniqueSortedText(rule.match[dimension], `${rule.rule_id}/${dimension}`, { allowEmpty: false });
  }
  experiment.action_mapping = normalizeAuthorityArray(experiment.action_mapping, "recommendation", "action mappings");
  for (const mapping of experiment.action_mapping) mapping.actions = uniqueSortedText(mapping.actions, `${mapping.recommendation} actions`, { allowEmpty: false });
  experiment.prompt_outcome_mapping = normalizeAuthorityArray(experiment.prompt_outcome_mapping, "prompt_outcome", "Prompt outcome mappings");
  delete experiment.experiment_digest;
  experiment.experiment_digest = computeEvolutionExperimentDigest(experiment);
  return experiment;
}

function validatePromptOutcomeMapping(mapping) {
  const expected = new Map([
    ["adopt_prompt_v2", "adopt_candidate"],
    ["retain_current", "retain_current"],
    ["revise_and_repeat", "revise_candidate"],
    ["insufficient_evidence", "insufficient_evidence"],
  ]);
  if (mapping.length !== expected.size) throw new Error("Prompt v2 outcome mapping must contain exactly four generic mappings");
  for (const entry of mapping) {
    if (expected.get(entry.prompt_outcome) !== entry.action) throw new Error("Prompt v2 outcome mapping drift rejected");
  }
}

export function validateEvolutionExperiment(experiment) {
  validateSchema(experiment, SCHEMAS.experiment, "Evolution experiment");
  assertSelfDigest(experiment, "experiment_digest", computeEvolutionExperimentDigest, "Evolution experiment");
  if (experiment.phase !== "pre_result" || experiment.results_accessed !== false) {
    throw new Error("Evolution experiment must remain an immutable pre-result seal");
  }
  assertNoOutcomeLeakage({
    roles: experiment.roles,
    projection: experiment.projection,
    protocol: experiment.protocol,
    causal_design: experiment.causal_design,
    authority: experiment.authority,
  });
  if (experiment.roles.baseline.role !== "baseline" || experiment.roles.challenger.role !== "challenger") {
    throw new Error("Evolution baseline/challenger role reversal rejected");
  }
  if (experiment.roles.baseline.portfolio.lock_digest === experiment.roles.challenger.portfolio.lock_digest
    || experiment.roles.baseline.selection_object_digest === experiment.roles.challenger.selection_object_digest
    || experiment.roles.baseline.selection_digest === experiment.roles.challenger.selection_digest) {
    throw new Error("Evolution baseline and challenger must bind distinct exact selections");
  }
  if (experiment.roles.baseline.selected_asset.stable_id !== experiment.roles.challenger.selected_asset.stable_id
    || experiment.roles.baseline.selected_asset.asset_type !== experiment.roles.challenger.selected_asset.asset_type) {
    throw new Error("Evolution experiment parent/candidate Asset transplant rejected");
  }
  if (experiment.causal_design.mode === "one_factor" && experiment.causal_design.changed_factor_ids.length !== 1) {
    throw new Error("one-factor Evolution experiment requires exactly one changed factor");
  }
  if (experiment.causal_design.mode === "factorial_or_ablation_required" && experiment.causal_design.changed_factor_ids.length < 2) {
    throw new Error("multi-factor Evolution experiment requires at least two changed factors");
  }
  if (experiment.projection.mode === "fixed_b1_exact"
    && (experiment.projection.baseline_condition !== "kernel_only" || experiment.projection.challenger_condition !== "adaptive_ask")) {
    throw new Error("fixed B1 projection must use the exact kernel_only/adaptive_ask roles");
  }
  if (experiment.projection.mode === "prompt_v2_exact") {
    if (experiment.projection.baseline_condition !== "full_ask" || experiment.projection.challenger_condition !== "full_ask") {
      throw new Error("prompt_v2_exact projection must map both Prompt roles to the existing full_ask raw-scoring condition");
    }
    if (experiment.roles.baseline.selected_asset.asset_type !== "prompt"
      || experiment.roles.challenger.selected_asset.asset_type !== "prompt") {
      throw new Error("prompt_v2_exact projection requires exact rendered Prompt Assets, not template proxies");
    }
    if (compareCanonical(experiment.roles.baseline.selected_asset, experiment.roles.challenger.selected_asset)) {
      throw new Error("prompt_v2_exact projection requires distinct exact Asset identities");
    }
    if (experiment.roles.baseline.portfolio.manifest_digest === experiment.roles.challenger.portfolio.manifest_digest) {
      throw new Error("prompt_v2_exact projection requires distinct exact Portfolio manifests");
    }
    const expectedProjection = computePromptV2ExactProjectionDigests(experiment.roles);
    if (experiment.projection.mapping_digest !== expectedProjection.mapping_digest) {
      throw new Error("prompt_v2_exact mapping digest drift rejected");
    }
    if (experiment.projection.projection_evidence_digest !== expectedProjection.projection_evidence_digest) {
      throw new Error("prompt_v2_exact projection evidence digest drift rejected");
    }
  }
  for (const mapping of experiment.action_mapping) {
    if (!RECOMMENDATIONS.has(mapping.recommendation) || mapping.actions.some((action) => !ACTIONS.has(action))) {
      throw new Error("Evolution action mapping uses an unsupported recommendation or action");
    }
  }
  const insufficientMapping = experiment.action_mapping.find(({ recommendation }) => recommendation === "insufficient_evidence");
  if (!insufficientMapping || !compareCanonical(insufficientMapping.actions, ["insufficient_evidence"])) {
    throw new Error("insufficient evidence recommendation must map only to the insufficient_evidence action; missing evidence cannot imply retention");
  }
  validatePromptOutcomeMapping(experiment.prompt_outcome_mapping);
  return experiment;
}

export function buildEvolutionExperiment(draft) {
  const experiment = normalizeExperimentDraft(draft);
  validateEvolutionExperiment(experiment);
  return deepFreeze(experiment);
}

export function publishEvolutionExperiment({ storeRoot, experiment }) {
  validateEvolutionExperiment(experiment);
  return publishArtifact({ storeRoot, artifact: experiment, semanticField: "experiment_digest" });
}

function selectionAsset(selection, role, expectedAsset) {
  const selected = selection.selected_assets.filter(({ asset }) => (
    asset.stable_id === expectedAsset.stable_id
    && asset.version === expectedAsset.version
    && asset.asset_type === expectedAsset.asset_type
  ));
  if (selected.length !== 1) throw new Error(`Evolution ${role} selection must expose the exact candidate-lineage Asset once`);
  return selected[0].asset;
}

function assertRoleSelection(role, verified, expectedAsset) {
  const selection = verified.selection;
  if (selection.selection_digest !== role.selection_digest) throw new Error(`${role.role} selection digest mismatch`);
  if (selection.portfolio_lock.lock_digest !== role.portfolio.lock_digest) throw new Error(`${role.role} selection lock transplant rejected`);
  assertPortfolioRefMatches(role.portfolio, { ...selection.manifest, lock_digest: selection.portfolio_lock.lock_digest }, `${role.role} selection Portfolio`);
  if (selection.registry.snapshot_digest !== role.registry_snapshot_digest) throw new Error(`${role.role} Registry snapshot transplant rejected`);
  assertAssetRefMatches(selectionAsset(selection, role.role, expectedAsset), expectedAsset, `${role.role} selected Asset`);
}

export function verifyEvolutionExperiment({
  storeRoot,
  experimentObjectDigest,
  trustedExperimentAuthorities = [],
  trustedAssetAuthorityContexts = [],
  trustedPortfolioAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  const experiment = readArtifact({ storeRoot, objectDigest: experimentObjectDigest, validate: validateEvolutionExperiment, label: "Evolution experiment" });
  exactTrustedAuthority(experiment.authority, trustedExperimentAuthorities, "Evolution experiment authority");
  const candidateVerified = verifyEvolutionCandidateInternal({
    storeRoot,
    candidateObjectDigest: experiment.candidate_object_digest,
    trustedAssetAuthorityContexts,
    trustedPortfolioAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  if (candidateVerified.candidate.candidate_digest !== experiment.candidate_digest) throw new Error("Evolution experiment candidate digest mismatch");
  const candidate = candidateVerified.candidate;
  if (!compareCanonical(experiment.authority, candidate.authorities.experiment)) {
    throw new Error("Evolution experiment authority differs from the candidate's exact reserved experiment authority");
  }
  if (experiment.causal_design.mode !== candidate.factors.design
    || experiment.causal_design.candidate_factors_digest !== canonicalDigest(candidate.factors)
    || !compareCanonical(experiment.causal_design.changed_factor_ids, candidate.factors.changed.map(({ factor_id: factorId }) => factorId).sort(compareText))) {
    throw new Error("Evolution experiment factor identity differs from the exact candidate factor set");
  }
  if (!compareCanonical(experiment.protocol.fixture_ids, candidate.evaluation_scope.fixture_ids)
    || !compareCanonical(experiment.protocol.task_classes, candidate.evaluation_scope.task_classes)
    || !compareCanonical(experiment.protocol.exclusions, candidate.evaluation_scope.exclusions)
    || experiment.protocol.candidate_evaluation_scope_digest !== canonicalDigest(candidate.evaluation_scope)) {
    throw new Error("Evolution experiment evaluation scope differs from the exact candidate scope");
  }
  assertAssetRefMatches(experiment.roles.baseline.selected_asset, candidate.parent_asset, "experiment baseline parent Asset");
  assertAssetRefMatches(experiment.roles.challenger.selected_asset, candidate.candidate_asset, "experiment challenger candidate Asset");
  if (experiment.projection.mode === "prompt_v2_exact") {
    for (const [roleName, asset] of [
      ["baseline", candidateVerified.parent_asset],
      ["challenger", candidateVerified.candidate_asset],
    ]) {
      if (asset.record.type_extension.kind !== "rendered_prompt_bundle") {
        throw new Error(`prompt_v2_exact ${roleName} must resolve to an exact rendered Prompt bundle`);
      }
      if (asset.record.type_extension.adapter !== experiment.protocol.adapter.name) {
        throw new Error(`prompt_v2_exact ${roleName} rendered Prompt adapter differs from the experiment adapter`);
      }
    }
  }
  for (const role of [experiment.roles.baseline, experiment.roles.challenger]) {
    const verified = verifyPortfolioSelection({
      storeRoot,
      selectionObjectDigest: role.selection_object_digest,
      trustedPortfolioAuthorityContexts,
      trustedAssetAuthorityContexts,
      trustedHighImpactApprovalGrants,
    });
    assertRoleSelection(role, verified, role.selected_asset);
  }
  return deepFreeze({ experiment_object_digest: experimentObjectDigest, experiment: cloneJson(experiment), candidate: cloneJson(candidateVerified.candidate) });
}

export function computeEvolutionRecommendationDigest(value) {
  return canonicalDigest(withoutField(value, "recommendation_digest"));
}

function assertDimensionSemantics(name, dimension) {
  if (!DIMENSION_SOURCE_KINDS[name].has(dimension.source_kind)) {
    throw new Error(`${name} evidence source ${dimension.source_kind} is not valid for that typed dimension`);
  }
  if (INCOMPLETE_STATUSES.has(dimension.status)) {
    const allowed = dimension.status === "unavailable" ? "unavailable"
      : dimension.status === "not_applicable" ? "not_applicable"
        : "unknown";
    if (dimension.conclusion !== allowed) throw new Error(`${name} ${dimension.status} evidence cannot be converted to ${dimension.conclusion}; unknown evidence is never neutral or zero`);
  } else if (INCOMPLETE_CONCLUSIONS.has(dimension.conclusion)) {
    throw new Error(`${name} complete evidence cannot carry the incomplete ${dimension.conclusion} conclusion`);
  }
  if (name !== "quality" && dimension.causal_credit_applied) throw new Error(`${name} evidence cannot receive component causal credit`);
  if (name === "quality" && ["mechanism_scorecard", "routing_telemetry"].includes(dimension.source_kind)) {
    throw new Error("mechanism or routing telemetry cannot be used as quality evidence");
  }
  if (name === "mechanism" && dimension.causal_credit_applied) throw new Error("mechanism telemetry cannot receive quality or causal credit");
  if (name === "external_outcome" && !INCOMPLETE_STATUSES.has(dimension.status)) {
    throw new Error("complete external outcome evidence requires a separately trusted external-outcome authority that is unavailable in the Evolution MVP");
  }
  if (!dimension.causal_credit_applied && dimension.factor_ids.length !== 0) {
    throw new Error(`${name} evidence cannot bind causal factor IDs without applied causal credit`);
  }
}

function assertCausalClosure(experiment, evidence, dimensions) {
  const attribution = evidence.causal_attribution;
  if (attribution.status !== "supported") {
    if (attribution.factor_ids.length !== 0
      || attribution.evidence_digests.length !== 0
      || Object.values(dimensions).some(({ causal_credit_applied: applied }) => applied)) {
      throw new Error("unsupported or unclaimed causal attribution cannot carry causal credit, factors, or evidence");
    }
    return;
  }
  if (dimensions.quality.status !== "complete") {
    throw new Error("supported causal credit requires complete quality evidence; incomplete quality cannot receive causal attribution");
  }
  const changedFactors = experiment.causal_design.changed_factor_ids;
  if (!compareCanonical(uniqueSortedText(attribution.factor_ids, "causal factor IDs", { allowEmpty: false }), changedFactors)) {
    throw new Error("causal attribution factor identity differs from the frozen experiment");
  }
  const qualityFactors = uniqueSortedText(dimensions.quality.factor_ids, "quality causal factor IDs");
  if (!dimensions.quality.causal_credit_applied || !compareCanonical(qualityFactors, changedFactors)) {
    throw new Error("supported causal attribution requires exact quality evidence for every changed factor");
  }
  const requiredEvidenceDigests = uniqueSortedText([
    dimensions.quality.artifact_digest,
    ...experiment.causal_design.ablation_evidence_digests,
  ], "required causal evidence digests", { allowEmpty: false });
  const suppliedEvidenceDigests = uniqueSortedText(attribution.evidence_digests, "causal evidence digests", { allowEmpty: false });
  if (!compareCanonical(suppliedEvidenceDigests, requiredEvidenceDigests)) {
    throw new Error("causal attribution evidence must exactly bind quality and frozen ablation evidence");
  }
}

function ruleMatches(rule, dimensions) {
  return Object.entries(rule.match).every(([dimension, allowed]) => allowed.includes(dimensions[dimension].conclusion));
}

export function validateEvolutionRecommendation(recommendation) {
  validateSchema(recommendation, SCHEMAS.recommendation, "Evolution recommendation");
  assertSelfDigest(recommendation, "recommendation_digest", computeEvolutionRecommendationDigest, "Evolution recommendation");
  for (const [name, dimension] of Object.entries(recommendation.dimensions)) assertDimensionSemantics(name, dimension);
  if (recommendation.authority_implied !== false) throw new Error("Evolution recommendation must not imply lifecycle authority");
  return recommendation;
}

export function deriveEvolutionRecommendation({ experiment, evidence }) {
  validateEvolutionExperiment(experiment);
  if (!evidence || typeof evidence !== "object") throw new Error("Evolution evaluation evidence is required");
  if (evidence.authority?.kind !== "external_evolution_evaluation_authority"
    || evidence.authority?.verification_mode !== "full_verifier") {
    throw new Error("Evolution recommendation requires a full-verifier external evaluation authority");
  }
  if (evidence.authority.experiment_digest !== experiment.experiment_digest) {
    throw new Error("Evolution evaluation authority experiment binding mismatch");
  }
  if (evidence.authority.authority_id === experiment.authority.authority_id) {
    throw new Error("candidate experiment and evaluation authorities must be distinct");
  }
  const dimensions = cloneJson(evidence.dimensions);
  if (!compareCanonical(Object.keys(dimensions).sort(compareText), [...DIMENSION_NAMES].sort(compareText))) {
    throw new Error("Evolution evidence must contain exactly six separate typed dimensions");
  }
  for (const name of DIMENSION_NAMES) assertDimensionSemantics(name, dimensions[name]);
  if (experiment.causal_design.mode === "factorial_or_ablation_required"
    && evidence.causal_attribution.status === "supported"
    && experiment.causal_design.ablation_evidence_digests.length === 0) {
    throw new Error("multi-factor causal attribution requires exact ablation or factorial evidence");
  }
  if (experiment.causal_design.mode === "factorial_or_ablation_required"
    && evidence.causal_attribution.status === "supported") {
    const suppliedEvidence = new Set(evidence.causal_attribution.evidence_digests);
    if (experiment.causal_design.ablation_evidence_digests.some((digest) => !suppliedEvidence.has(digest))) {
      throw new Error("multi-factor causal attribution does not bind every frozen ablation evidence digest");
    }
  }
  assertCausalClosure(experiment, evidence, dimensions);
  const matching = experiment.recommendation_policy.rules.filter((rule) => ruleMatches(rule, dimensions));
  if (matching.length > 1) throw new Error("ambiguous Evolution recommendation policy matched more than one rule");
  const selected = matching[0] ?? null;
  const recommendationValue = selected?.recommendation ?? experiment.recommendation_policy.no_match;
  if (!RECOMMENDATIONS.has(recommendationValue)) throw new Error("unsupported Evolution recommendation");
  if (DIMENSION_NAMES.every((name) => INCOMPLETE_STATUSES.has(dimensions[name].status))
    && recommendationValue !== "insufficient_evidence") {
    throw new Error("all-incomplete Evolution evidence can only produce an insufficient_evidence recommendation");
  }
  if (["expand", "retain"].includes(recommendationValue)
    && ["regressed", "unsafe", "contradicted"].includes(dimensions.safety.conclusion)) {
    throw new Error("safety regression cannot be offset by a quality recommendation");
  }
  const base = {
    schema_version: SCHEMA_VERSION,
    object_kind: "evolution_recommendation",
    experiment_digest: experiment.experiment_digest,
    candidate_digest: experiment.candidate_digest,
    evaluation_authority: cloneJson(evidence.authority),
    dimensions,
    causal_attribution: cloneJson(evidence.causal_attribution),
    recommendation: recommendationValue,
    decision_scope: selected?.decision_scope ?? "evidence_insufficient",
    reason_codes: uniqueSortedText(evidence.reason_codes, "recommendation reason codes", { allowEmpty: false }),
    authority_implied: false,
  };
  const recommendation = { ...base, recommendation_digest: computeEvolutionRecommendationDigest(base) };
  validateEvolutionRecommendation(recommendation);
  return deepFreeze(recommendation);
}

export function buildEvolutionRecommendation(draft) {
  const recommendation = cloneJson(draft);
  delete recommendation.recommendation_digest;
  recommendation.recommendation_digest = computeEvolutionRecommendationDigest(recommendation);
  validateEvolutionRecommendation(recommendation);
  return deepFreeze(recommendation);
}

export function publishEvolutionRecommendation({ storeRoot, recommendation }) {
  validateEvolutionRecommendation(recommendation);
  return publishArtifact({ storeRoot, artifact: recommendation, semanticField: "recommendation_digest" });
}

export function verifyEvolutionRecommendation({
  storeRoot,
  recommendationObjectDigest,
  experimentObjectDigest,
  trustedExperimentAuthorities = [],
  trustedEvaluationAuthorities = [],
  trustedAssetAuthorityContexts = [],
  trustedPortfolioAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  const recommendation = readArtifact({ storeRoot, objectDigest: recommendationObjectDigest, validate: validateEvolutionRecommendation, label: "Evolution recommendation" });
  const experimentVerified = verifyEvolutionExperiment({
    storeRoot,
    experimentObjectDigest,
    trustedExperimentAuthorities,
    trustedAssetAuthorityContexts,
    trustedPortfolioAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  if (recommendation.experiment_digest !== experimentVerified.experiment.experiment_digest
    || recommendation.candidate_digest !== experimentVerified.experiment.candidate_digest) {
    throw new Error("Evolution recommendation experiment/candidate binding mismatch");
  }
  const evidence = {
    authority: cloneJson(recommendation.evaluation_authority),
    dimensions: cloneJson(recommendation.dimensions),
    causal_attribution: cloneJson(recommendation.causal_attribution),
    reason_codes: cloneJson(recommendation.reason_codes),
  };
  exactTrustedAuthority(evidence, trustedEvaluationAuthorities, "Evolution evaluation evidence");
  const reservedIds = new Set([
    experimentVerified.candidate.generation.actor.actor_id,
    experimentVerified.candidate.authorities.experiment.authority_id,
    experimentVerified.candidate.authorities.decision.authority_id,
  ]);
  if (reservedIds.has(evidence.authority.authority_id)) {
    throw new Error("Evolution evaluation authority must remain distinct from candidate generation, experiment, and decision authorities");
  }
  const derived = deriveEvolutionRecommendation({ experiment: experimentVerified.experiment, evidence });
  if (!compareCanonical(derived, recommendation)) throw new Error("Evolution recommendation does not match deterministic reconstruction from the trusted evidence context");
  return deepFreeze({ recommendation_object_digest: recommendationObjectDigest, recommendation: cloneJson(recommendation), ...experimentVerified });
}

export function computeEvolutionActionProposalDigest(value) {
  return canonicalDigest(withoutField(value, "proposal_digest"));
}

function validateLifecyclePlan(plan, action) {
  assertPortfolioRefMatches(plan.base_current_manifest, plan.rollback_anchor, "Evolution rollback anchor");
  if (NOOP_ACTIONS.has(action)) {
    if (plan.portfolio_transitions.length !== 0 || plan.asset_transitions.length !== 0) {
      throw new Error("Evolution no-op action cannot include lifecycle transitions");
    }
    assertPortfolioRefMatches(plan.target_manifest, plan.base_current_manifest, "Evolution no-op target/base current manifest");
    return;
  }
  if (action === "reject_candidate") {
    if (plan.portfolio_transitions.length !== 0 || plan.asset_transitions.length !== 1) {
      throw new Error("candidate rejection requires one Asset retirement transition and no Portfolio transition");
    }
    assertPortfolioRefMatches(plan.target_manifest, plan.base_current_manifest, "Evolution rejection target/base current manifest");
    return;
  }
  if (action === "adopt_candidate") {
    if (plan.asset_transitions.length !== 0) {
      throw new Error("bounded Portfolio-only candidate adoption cannot include unapplied Asset transitions");
    }
    if (plan.portfolio_transitions.length !== 2) throw new Error("candidate adoption requires one complete two-entry Portfolio transition batch");
    const outgoing = plan.portfolio_transitions.find(({ from_state }) => from_state === "current");
    const incoming = plan.portfolio_transitions.find(({ from_state }) => from_state === null);
    if (!outgoing || !["historical", "superseded"].includes(outgoing.to_state)
      || !incoming || incoming.to_state !== "current") {
      throw new Error("candidate adoption Portfolio transition batch is incomplete or unsafe");
    }
    assertPortfolioRefMatches(outgoing.manifest, plan.base_current_manifest, "Evolution outgoing current manifest");
    assertPortfolioRefMatches(incoming.manifest, plan.target_manifest, "Evolution target manifest");
    return;
  }
  if (action === "retire_current") {
    if (plan.portfolio_transitions.length !== 2 || plan.asset_transitions.length !== 1) {
      throw new Error("current Asset retirement requires one replacement Portfolio batch and one Asset retirement transition");
    }
    const outgoing = plan.portfolio_transitions.find(({ from_state }) => from_state === "current");
    const incoming = plan.portfolio_transitions.find(({ from_state }) => from_state === null);
    if (!outgoing || !["historical", "superseded"].includes(outgoing.to_state)
      || !incoming || incoming.to_state !== "current") {
      throw new Error("current Asset retirement Portfolio transition batch is incomplete or unsafe");
    }
    assertPortfolioRefMatches(outgoing.manifest, plan.base_current_manifest, "Evolution retirement outgoing current manifest");
    assertPortfolioRefMatches(incoming.manifest, plan.target_manifest, "Evolution retirement target manifest");
  }
}

export function validateEvolutionActionProposal(proposal) {
  validateSchema(proposal, SCHEMAS.proposal, "Evolution action proposal");
  assertSelfDigest(proposal, "proposal_digest", computeEvolutionActionProposalDigest, "Evolution action proposal");
  if (proposal.authority_implied !== false) throw new Error("Evolution action proposal must not imply lifecycle authority");
  validateLifecyclePlan(proposal.lifecycle_plan, proposal.action);
  return proposal;
}

export function deriveEvolutionActionProposal({ candidate, experiment, recommendation, lifecyclePlan }) {
  validateEvolutionCandidate(candidate);
  validateEvolutionExperiment(experiment);
  validateEvolutionRecommendation(recommendation);
  if (experiment.candidate_digest !== candidate.candidate_digest
    || recommendation.candidate_digest !== candidate.candidate_digest
    || recommendation.experiment_digest !== experiment.experiment_digest) {
    throw new Error("Evolution action proposal input closure mismatch");
  }
  const mapping = experiment.action_mapping.find(({ recommendation: value }) => value === recommendation.recommendation);
  if (!mapping || mapping.actions.length !== 1) throw new Error("ambiguous recommendation-to-action mapping; exactly one action is required");
  const [action] = mapping.actions;
  if (!ACTIONS.has(action)) throw new Error("unsupported Evolution action");
  const base = {
    schema_version: SCHEMA_VERSION,
    object_kind: "evolution_action_proposal",
    candidate_digest: candidate.candidate_digest,
    experiment_digest: experiment.experiment_digest,
    recommendation_digest: recommendation.recommendation_digest,
    recommendation: recommendation.recommendation,
    action,
    mapping_policy_digest: canonicalDigest(experiment.action_mapping),
    decision_scope: recommendation.decision_scope,
    required_decision_authority: cloneJson(candidate.authorities.decision),
    lifecycle_plan: cloneJson(lifecyclePlan),
    reason_codes: uniqueSortedText(lifecyclePlan.reason_codes, "action proposal reason codes", { allowEmpty: false }),
    authority_implied: false,
  };
  const proposal = { ...base, proposal_digest: computeEvolutionActionProposalDigest(base) };
  validateEvolutionActionProposal(proposal);
  return deepFreeze(proposal);
}

export function buildEvolutionActionProposal(draft) {
  const proposal = cloneJson(draft);
  delete proposal.proposal_digest;
  proposal.proposal_digest = computeEvolutionActionProposalDigest(proposal);
  validateEvolutionActionProposal(proposal);
  return deepFreeze(proposal);
}

export function publishEvolutionActionProposal({ storeRoot, proposal }) {
  validateEvolutionActionProposal(proposal);
  return publishArtifact({ storeRoot, artifact: proposal, semanticField: "proposal_digest" });
}

export function computeEvolutionHumanDecisionDigest(value) {
  return canonicalDigest(withoutField(value, "decision_digest"));
}

export function validateEvolutionHumanDecision(decision) {
  validateSchema(decision, SCHEMAS.decision, "Evolution human decision");
  assertSelfDigest(decision, "decision_digest", computeEvolutionHumanDecisionDigest, "Evolution human decision");
  if (decision.authority_implied !== false) throw new Error("Evolution human decision evidence does not itself imply Portfolio lifecycle authority");
  return decision;
}

export function buildEvolutionHumanDecision({ proposal, disposition, reasonCodes, authority }) {
  validateEvolutionActionProposal(proposal);
  if (!compareCanonical(authority, proposal.required_decision_authority)) {
    throw new Error("Evolution human decision authority differs from the proposal's exact required authority");
  }
  const base = {
    schema_version: SCHEMA_VERSION,
    object_kind: "evolution_human_decision",
    proposal_digest: proposal.proposal_digest,
    action: proposal.action,
    disposition,
    reason_codes: uniqueSortedText(reasonCodes, "human decision reason codes", { allowEmpty: false }),
    authority: cloneJson(authority),
    authority_implied: false,
  };
  const decision = { ...base, decision_digest: computeEvolutionHumanDecisionDigest(base) };
  validateEvolutionHumanDecision(decision);
  return deepFreeze(decision);
}

export function publishEvolutionHumanDecision({ storeRoot, decision }) {
  validateEvolutionHumanDecision(decision);
  return publishArtifact({ storeRoot, artifact: decision, semanticField: "decision_digest" });
}

export function computeEvolutionApplicationReceiptDigest(value) {
  return canonicalDigest(withoutField(value, "receipt_digest"));
}

const RECEIPT_HEAD_OPERATIONS = Object.freeze({
  registry_snapshot_digest: new Set(["apply_asset_transition", "verify_asset_commit_marker"]),
  portfolio_lock_digest: new Set(["apply_portfolio_transition", "verify_portfolio_commit_marker"]),
});

function receiptStepsForHead(receipt, headField, { completedOnly = false } = {}) {
  return receipt.steps.filter((step) => (
    RECEIPT_HEAD_OPERATIONS[headField].has(step.operation)
      && (!completedOnly || step.status === "completed")
  ));
}

function validateReceiptStepSequence(receipt) {
  const stepIds = new Set();
  for (const step of receipt.steps) {
    if (stepIds.has(step.step_id)) throw new Error(`Evolution receipt contains duplicate step ID ${step.step_id}`);
    stepIds.add(step.step_id);
  }

  const firstNonCompleted = receipt.steps.findIndex(({ status }) => status !== "completed");
  if (firstNonCompleted >= 0 && receipt.steps.slice(firstNonCompleted + 1).some(({ status }) => status === "completed")) {
    throw new Error("Evolution receipt cannot contain a completed step after a non-completed boundary");
  }

  const firstPending = receipt.steps.find(({ status }) => status === "pending");
  if (["pending", "in_progress", "stopped"].includes(receipt.state)
    && (!firstPending || receipt.next_step !== firstPending.step_id)) {
    throw new Error(`${receipt.state} Evolution receipt next step must identify the first pending step`);
  }

  if (receipt.state === "pending") {
    if (!compareCanonical(receipt.result_heads, receipt.base_heads)) {
      throw new Error("pending Evolution receipt result heads must equal its base heads");
    }
    if (receipt.steps.some(({ status }) => status !== "pending")) {
      throw new Error("pending Evolution receipt cannot contain a completed, failed, or skipped step");
    }
  } else if (receipt.state === "in_progress") {
    if (receipt.steps[0]?.status !== "completed") {
      throw new Error("in_progress Evolution receipt requires a completed prefix");
    }
    if (receipt.steps.some(({ status }) => !["completed", "pending"].includes(status))) {
      throw new Error("in_progress Evolution receipt may contain only a completed prefix followed by pending steps");
    }
  } else if (receipt.state === "stopped") {
    if (receipt.steps.some(({ status }) => status === "failed")) {
      throw new Error("stopped Evolution receipt cannot contain a failed step");
    }
  } else if (receipt.state === "failed") {
    if (receipt.steps.length > 0) {
      const failedIndexes = receipt.steps
        .map(({ status }, index) => status === "failed" ? index : -1)
        .filter((index) => index >= 0);
      if (failedIndexes.length !== 1) {
        throw new Error("failed Evolution receipt with steps requires exactly one failed step");
      }
      const [failedIndex] = failedIndexes;
      if (receipt.steps.slice(0, failedIndex).some(({ status }) => status !== "completed")
        || receipt.steps.slice(failedIndex + 1).some(({ status }) => status !== "skipped")) {
        throw new Error("failed Evolution receipt step sequence must be completed prefix, one failed step, then skipped steps");
      }
    }
  }
}

function validateReceiptHeadChains(receipt) {
  for (const [headField, operations] of Object.entries(RECEIPT_HEAD_OPERATIONS)) {
    let expectedHead = receipt.base_heads[headField];
    let completedApplyCount = 0;
    for (const step of receipt.steps) {
      if (step.status !== "completed" || !operations.has(step.operation)) continue;
      if (step.input_digest !== expectedHead) {
        throw new Error(`Evolution receipt ${headField} completed-step digest chain has an invalid step input`);
      }
      if (step.operation.startsWith("apply_")) {
        completedApplyCount += 1;
        if (step.output_digest === step.input_digest) {
          throw new Error(`Evolution receipt ${headField} completed apply step must produce a successor head`);
        }
      }
      if (step.operation.startsWith("verify_") && step.output_digest !== step.input_digest) {
        throw new Error(`Evolution receipt ${headField} verification step cannot change the resource head`);
      }
      expectedHead = step.output_digest;
    }
    if (completedApplyCount > 1) {
      throw new Error(`Evolution receipt ${headField} permits at most one completed lifecycle transition batch`);
    }
    if (receipt.result_heads[headField] !== expectedHead) {
      throw new Error(`Evolution receipt ${headField} result head does not equal the completed-step output`);
    }
  }
}

export function validateEvolutionApplicationReceipt(receipt) {
  validateSchema(receipt, SCHEMAS.receipt, "Evolution application receipt");
  assertSelfDigest(receipt, "receipt_digest", computeEvolutionApplicationReceiptDigest, "Evolution application receipt");
  if (receipt.history_preserved !== true || receipt.authority_implied !== false) {
    throw new Error("Evolution receipt must preserve history and must not imply lifecycle authority");
  }
  validateReceiptStepSequence(receipt);
  validateReceiptHeadChains(receipt);
  return receipt;
}

export function buildEvolutionApplicationReceipt(draft) {
  const receipt = cloneJson(draft);
  delete receipt.receipt_digest;
  receipt.receipt_digest = computeEvolutionApplicationReceiptDigest(receipt);
  validateEvolutionApplicationReceipt(receipt);
  return deepFreeze(receipt);
}

export function publishEvolutionApplicationReceipt({ storeRoot, receipt }) {
  validateEvolutionApplicationReceipt(receipt);
  return publishArtifact({ storeRoot, artifact: receipt, semanticField: "receipt_digest" });
}

export function verifyEvolutionActionProposal({
  storeRoot,
  proposalObjectDigest,
  candidateObjectDigest,
  experimentObjectDigest,
  recommendationObjectDigest,
  trustedExperimentAuthorities = [],
  trustedEvaluationAuthorities = [],
  trustedAssetAuthorityContexts = [],
  trustedPortfolioAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  const proposal = readArtifact({ storeRoot, objectDigest: proposalObjectDigest, validate: validateEvolutionActionProposal, label: "Evolution action proposal" });
  const candidate = verifyEvolutionCandidate({ storeRoot, candidateObjectDigest, trustedAssetAuthorityContexts, trustedPortfolioAuthorityContexts, trustedHighImpactApprovalGrants });
  const recommendation = verifyEvolutionRecommendation({
    storeRoot,
    recommendationObjectDigest,
    experimentObjectDigest,
    trustedExperimentAuthorities,
    trustedEvaluationAuthorities,
    trustedAssetAuthorityContexts,
    trustedPortfolioAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  if (proposal.candidate_digest !== candidate.candidate.candidate_digest
    || proposal.experiment_digest !== recommendation.experiment.experiment_digest
    || proposal.recommendation_digest !== recommendation.recommendation.recommendation_digest) {
    throw new Error("Evolution action proposal closure mismatch");
  }
  const derived = deriveEvolutionActionProposal({
    candidate: candidate.candidate,
    experiment: recommendation.experiment,
    recommendation: recommendation.recommendation,
    lifecyclePlan: proposal.lifecycle_plan,
  });
  if (!compareCanonical(derived, proposal)) throw new Error("Evolution action proposal does not match deterministic reconstruction");
  const baseLock = verifyPortfolioLock({
    storeRoot,
    lockDigest: proposal.lifecycle_plan.base_portfolio_lock_digest,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  const current = baseLock.lock.entries.find(({ state }) => state === "current");
  if (!current) throw new Error("Evolution action proposal base Portfolio has no current manifest");
  if (proposal.lifecycle_plan.base_registry_snapshot_digest !== candidate.candidate.registry.snapshot_digest
    || proposal.lifecycle_plan.base_portfolio_lock_digest !== candidate.candidate.parent_portfolio.lock_digest) {
    throw new Error("Evolution action proposal base Registry or Portfolio head differs from the candidate lineage");
  }
  assertPortfolioRefMatches(proposal.lifecycle_plan.base_current_manifest, {
    portfolio_id: baseLock.lock.portfolio_id,
    revision: current.revision,
    manifest_digest: current.manifest_digest,
    asset_set_digest: current.asset_set_digest,
  }, "Evolution action proposal base current manifest");
  assertPortfolioRefMatches(candidate.candidate.parent_portfolio, {
    portfolio_id: baseLock.lock.portfolio_id,
    revision: current.revision,
    manifest_digest: current.manifest_digest,
    asset_set_digest: current.asset_set_digest,
    lock_digest: baseLock.lock_digest,
  }, "Evolution candidate parent/base current Portfolio");
  const baseManifest = baseLock.manifests.find(({ manifest_digest: digest }) => digest === current.manifest_digest)?.manifest;
  const boundParents = baseManifest?.entries.filter((entry) => compareCanonical(entry.asset, candidate.candidate.parent_asset)) ?? [];
  if (boundParents.length !== 1) {
    throw new Error("Evolution base current Portfolio must contain the exact parent Asset once");
  }
  const target = verifyPortfolioManifest({
    storeRoot,
    manifestDigest: proposal.lifecycle_plan.target_manifest.manifest_digest,
    trustedAssetAuthorityContexts,
  });
  assertPortfolioRefMatches(proposal.lifecycle_plan.target_manifest, {
    portfolio_id: target.manifest.portfolio_id,
    revision: target.manifest.revision,
    manifest_digest: target.manifest_digest,
    asset_set_digest: target.manifest.asset_set_digest,
  }, "Evolution action proposal target manifest");
  if (target.manifest.registry.snapshot_digest !== proposal.lifecycle_plan.base_registry_snapshot_digest) {
    throw new Error("Evolution target manifest Registry snapshot differs from the approved lifecycle plan");
  }
  if (target.manifest.portfolio_id !== baseLock.lock.portfolio_id) {
    throw new Error("Evolution target manifest Portfolio identity differs from the approved base Portfolio");
  }
  if (proposal.action === "adopt_candidate") {
    const boundCandidates = target.manifest.entries.filter((entry) => compareCanonical(entry.asset, candidate.candidate.candidate_asset));
    if (boundCandidates.length !== 1
      || boundCandidates[0].assurance_lane !== "challenger"
      || boundCandidates[0].expected_registry_state !== "candidate"
      || boundCandidates[0].exposure.mode !== "canary") {
      throw new Error("Evolution target manifest must contain the exact candidate once as a candidate-state canary challenger");
    }
    if (target.manifest.rollback.mode !== "exact") throw new Error("Evolution adopt_candidate target manifest requires an exact rollback target");
    assertPortfolioRefMatches(target.manifest.rollback.target, proposal.lifecycle_plan.rollback_anchor, "Evolution target manifest rollback anchor");
  } else if (NOOP_ACTIONS.has(proposal.action)) {
    assertPortfolioRefMatches(proposal.lifecycle_plan.target_manifest, proposal.lifecycle_plan.base_current_manifest, "Evolution no-op target/base current manifest");
  } else if (proposal.action === "reject_candidate") {
    const [transition] = proposal.lifecycle_plan.asset_transitions;
    assertAssetRefMatches(transition.asset, candidate.candidate.candidate_asset, "Evolution rejected candidate Asset");
    if (transition.from_state !== "candidate" || transition.to_state !== "retired") {
      throw new Error("Evolution candidate rejection must plan candidate-to-retired history preservation");
    }
  } else if (proposal.action === "retire_current") {
    const [transition] = proposal.lifecycle_plan.asset_transitions;
    assertAssetRefMatches(transition.asset, candidate.candidate.parent_asset, "Evolution retired current Asset");
    if (transition.from_state !== "current" || transition.to_state !== "retired") {
      throw new Error("Evolution current retirement must plan current-to-retired history preservation");
    }
    if (target.manifest.entries.some((entry) => compareCanonical(entry.asset, candidate.candidate.parent_asset))) {
      throw new Error("Evolution retirement target Portfolio cannot retain the retiring current Asset");
    }
    if (target.manifest.rollback.mode !== "exact") throw new Error("Evolution retire_current target manifest requires an exact rollback target");
    assertPortfolioRefMatches(target.manifest.rollback.target, proposal.lifecycle_plan.rollback_anchor, "Evolution retirement rollback anchor");
  }
  return deepFreeze({ proposal_object_digest: proposalObjectDigest, proposal: cloneJson(proposal), candidate: candidate.candidate, experiment: recommendation.experiment, recommendation: recommendation.recommendation });
}

export function verifyEvolutionHumanDecision({
  storeRoot,
  decisionObjectDigest,
  proposalObjectDigest,
  candidateObjectDigest,
  experimentObjectDigest,
  recommendationObjectDigest,
  trustedHumanDecisionAuthorities = [],
  trustedExperimentAuthorities = [],
  trustedEvaluationAuthorities = [],
  trustedAssetAuthorityContexts = [],
  trustedPortfolioAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  const decision = readArtifact({ storeRoot, objectDigest: decisionObjectDigest, validate: validateEvolutionHumanDecision, label: "Evolution human decision" });
  exactTrustedAuthority(decision, trustedHumanDecisionAuthorities, "Evolution human decision");
  const proposal = verifyEvolutionActionProposal({
    storeRoot,
    proposalObjectDigest,
    candidateObjectDigest,
    experimentObjectDigest,
    recommendationObjectDigest,
    trustedExperimentAuthorities,
    trustedEvaluationAuthorities,
    trustedAssetAuthorityContexts,
    trustedPortfolioAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  if (decision.proposal_digest !== proposal.proposal.proposal_digest || decision.action !== proposal.proposal.action) {
    throw new Error("Evolution human decision proposal/action transplant rejected");
  }
  if (!compareCanonical(decision.authority, proposal.proposal.required_decision_authority)) {
    throw new Error("Evolution human decision authority differs from the proposal's exact required decision authority");
  }
  return deepFreeze({ decision_object_digest: decisionObjectDigest, decision: cloneJson(decision), ...proposal });
}

function assertReceiptClosureMatches(left, right, label) {
  for (const field of [
    "candidate_digest",
    "experiment_digest",
    "recommendation_digest",
    "proposal_digest",
    "decision_digest",
    "action",
  ]) {
    if (left[field] !== right[field]) throw new Error(`${label} ${field} differs from the successor receipt`);
  }
  if (!compareCanonical(left.rollback_anchor, right.rollback_anchor)) {
    throw new Error(`${label} rollback anchor differs from the successor receipt`);
  }
}

function compareCanonicalCollection(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const normalize = (values) => values.map(stableCanonicalJson).sort(compareText);
  return compareCanonical(normalize(left), normalize(right));
}

function readTrustedReceiptAuthorityContext({ storeRoot, contextDigest, trustedContexts, label }) {
  const context = readContentAddressedJson({ storeRoot, digest: contextDigest }).value;
  exactTrustedAuthority(context, trustedContexts, label);
  return context;
}

function assertReceiptAuthorityBinding({
  context,
  resource,
  predecessorDigest,
  transitions,
  decision,
  decisionObjectDigest,
}) {
  const isRegistry = resource === "Registry";
  const expectedKind = isRegistry
    ? "external_asset_lifecycle_authority"
    : "external_portfolio_activation_authority";
  const predecessorField = isRegistry ? "predecessor_snapshot_digest" : "predecessor_lock_digest";
  if (context[predecessorField] !== predecessorDigest
    || !compareCanonicalCollection(context.transitions, transitions)
    || context.authority?.kind !== expectedKind
    || context.authority?.authority_id !== decision.authority.authority_id
    || context.authority?.authority_evidence_digest !== decisionObjectDigest) {
    throw new Error(`Evolution receipt ${resource} authority is not bound to the exact approved proposal and decision`);
  }
}

function verifyReceiptResultHeads({
  storeRoot,
  receipt,
  proposal,
  decision,
  decisionObjectDigest,
  trustedAssetAuthorityContexts,
  trustedPortfolioAuthorityContexts,
  trustedHighImpactApprovalGrants,
  verifyUnchanged = false,
}) {
  const registryChanged = receipt.result_heads.registry_snapshot_digest
    !== receipt.base_heads.registry_snapshot_digest;
  const portfolioChanged = receipt.result_heads.portfolio_lock_digest
    !== receipt.base_heads.portfolio_lock_digest;
  let resultRegistry = null;
  let resultPortfolio = null;
  const completedRegistrySteps = receiptStepsForHead(receipt, "registry_snapshot_digest", { completedOnly: true });
  const registryApplySteps = completedRegistrySteps.filter(({ operation }) => operation === "apply_asset_transition");
  const completedPortfolioSteps = receiptStepsForHead(receipt, "portfolio_lock_digest", { completedOnly: true });
  const portfolioApplySteps = completedPortfolioSteps.filter(({ operation }) => operation === "apply_portfolio_transition");

  if (registryChanged || verifyUnchanged || completedRegistrySteps.length > 0) {
    resultRegistry = verifyAssetRegistry({
      storeRoot,
      snapshotDigest: receipt.result_heads.registry_snapshot_digest,
      trustedAuthorityContexts: trustedAssetAuthorityContexts,
    });
  }
  if (registryApplySteps.length > 0) {
    const [step] = registryApplySteps;
    const snapshot = readContentAddressedJson({ storeRoot, digest: receipt.result_heads.registry_snapshot_digest }).value;
    if (proposal.lifecycle_plan.asset_transitions.length === 0
      || snapshot.predecessor?.snapshot_digest !== step.input_digest
      || snapshot.lifecycle_authority_context_digest !== step.authority_context_digest) {
      throw new Error("Evolution receipt Registry result is not the exact completed Asset transition");
    }
    const context = readTrustedReceiptAuthorityContext({
      storeRoot,
      contextDigest: step.authority_context_digest,
      trustedContexts: trustedAssetAuthorityContexts,
      label: "Evolution receipt Registry authority",
    });
    assertReceiptAuthorityBinding({
      context,
      resource: "Registry",
      predecessorDigest: step.input_digest,
      transitions: proposal.lifecycle_plan.asset_transitions,
      decision,
      decisionObjectDigest,
    });
  } else if (registryChanged) {
    throw new Error("Evolution receipt Registry result changed without a completed Asset transition");
  }
  for (const marker of completedRegistrySteps.filter(({ operation }) => operation === "verify_asset_commit_marker")) {
    verifyAssetRegistry({
      storeRoot,
      snapshotDigest: marker.output_digest,
      trustedAuthorityContexts: trustedAssetAuthorityContexts,
    });
    const snapshot = readContentAddressedJson({ storeRoot, digest: marker.output_digest }).value;
    if (snapshot.lifecycle_authority_context_digest !== marker.authority_context_digest) {
      throw new Error("Evolution receipt Registry verification marker authority does not match the verified head");
    }
  }

  if (portfolioChanged || verifyUnchanged || completedPortfolioSteps.length > 0) {
    resultPortfolio = verifyPortfolioLock({
      storeRoot,
      lockDigest: receipt.result_heads.portfolio_lock_digest,
      trustedPortfolioAuthorityContexts,
      trustedAssetAuthorityContexts,
      trustedHighImpactApprovalGrants,
    });
  }
  if (portfolioApplySteps.length > 0) {
    const [step] = portfolioApplySteps;
    if (proposal.lifecycle_plan.portfolio_transitions.length === 0
      || resultPortfolio.lock.predecessor?.lock_digest !== step.input_digest
      || resultPortfolio.lock.authority_context_digest !== step.authority_context_digest
      || resultPortfolio.lock.current_manifest_digest !== proposal.lifecycle_plan.target_manifest.manifest_digest
      || resultPortfolio.lock.current_asset_set_digest !== proposal.lifecycle_plan.target_manifest.asset_set_digest) {
      throw new Error("Evolution receipt Portfolio result is not the exact completed approved transition");
    }
    const context = readTrustedReceiptAuthorityContext({
      storeRoot,
      contextDigest: step.authority_context_digest,
      trustedContexts: trustedPortfolioAuthorityContexts,
      label: "Evolution receipt Portfolio authority",
    });
    assertReceiptAuthorityBinding({
      context,
      resource: "Portfolio",
      predecessorDigest: step.input_digest,
      transitions: proposal.lifecycle_plan.portfolio_transitions,
      decision,
      decisionObjectDigest,
    });
  } else if (portfolioChanged) {
    throw new Error("Evolution receipt Portfolio result changed without a completed Portfolio transition");
  }
  for (const marker of completedPortfolioSteps.filter(({ operation }) => operation === "verify_portfolio_commit_marker")) {
    verifyPortfolioLock({
      storeRoot,
      lockDigest: marker.output_digest,
      trustedPortfolioAuthorityContexts,
      trustedAssetAuthorityContexts,
      trustedHighImpactApprovalGrants,
    });
    const lock = readContentAddressedJson({ storeRoot, digest: marker.output_digest }).value;
    if (lock.authority_context_digest !== marker.authority_context_digest) {
      throw new Error("Evolution receipt Portfolio verification marker authority does not match the verified head");
    }
  }

  return { resultRegistry, resultPortfolio };
}

export function verifyEvolutionApplicationReceipt({
  storeRoot,
  receiptObjectDigest,
  decisionObjectDigest,
  proposalObjectDigest,
  candidateObjectDigest,
  experimentObjectDigest,
  recommendationObjectDigest,
  trustedHumanDecisionAuthorities = [],
  trustedExperimentAuthorities = [],
  trustedEvaluationAuthorities = [],
  trustedAssetAuthorityContexts = [],
  trustedPortfolioAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  const receipt = readArtifact({ storeRoot, objectDigest: receiptObjectDigest, validate: validateEvolutionApplicationReceipt, label: "Evolution application receipt" });
  const decision = verifyEvolutionHumanDecision({
    storeRoot,
    decisionObjectDigest,
    proposalObjectDigest,
    candidateObjectDigest,
    experimentObjectDigest,
    recommendationObjectDigest,
    trustedHumanDecisionAuthorities,
    trustedExperimentAuthorities,
    trustedEvaluationAuthorities,
    trustedAssetAuthorityContexts,
    trustedPortfolioAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  for (const [field, expected] of [
    ["candidate_digest", decision.candidate.candidate_digest],
    ["experiment_digest", decision.experiment.experiment_digest],
    ["recommendation_digest", decision.recommendation.recommendation_digest],
    ["proposal_digest", decision.proposal.proposal_digest],
    ["decision_digest", decision.decision.decision_digest],
  ]) if (receipt[field] !== expected) throw new Error(`Evolution receipt ${field} transplant rejected`);
  if (receipt.action !== decision.proposal.action) {
    throw new Error("Evolution receipt action mismatch");
  }
  const expectedBaseHeads = {
    registry_snapshot_digest: decision.proposal.lifecycle_plan.base_registry_snapshot_digest,
    portfolio_lock_digest: decision.proposal.lifecycle_plan.base_portfolio_lock_digest,
  };
  if (!compareCanonical(receipt.rollback_anchor, decision.proposal.lifecycle_plan.rollback_anchor)) {
    throw new Error("Evolution receipt rollback anchor differs from the approved proposal");
  }
  const predecessorChain = [];
  const seenReceiptObjects = new Set([receiptObjectDigest]);
  let successor = receipt;
  while (successor.predecessor_receipt_digest !== null) {
    const predecessorObjectDigest = successor.predecessor_receipt_digest;
    if (seenReceiptObjects.has(predecessorObjectDigest)) {
      throw new Error("Evolution predecessor receipt chain contains a cycle");
    }
    seenReceiptObjects.add(predecessorObjectDigest);
    const predecessor = readArtifact({
      storeRoot,
      objectDigest: predecessorObjectDigest,
      validate: validateEvolutionApplicationReceipt,
      label: "Evolution predecessor receipt",
    });
    assertReceiptClosureMatches(predecessor, receipt, "Evolution predecessor receipt");
    if (!compareCanonical(predecessor.result_heads, successor.base_heads)) {
      throw new Error("Evolution receipt predecessor head drift rejected");
    }
    predecessorChain.push(predecessor);
    successor = predecessor;
  }
  if (!compareCanonical(successor.base_heads, expectedBaseHeads)) {
    throw new Error("Evolution receipt base heads differ from the approved proposal");
  }
  for (const predecessor of predecessorChain) {
    if (predecessor.steps.some(({ status }) => status === "completed")
      && decision.decision.disposition !== "approved") {
      throw new Error("Evolution predecessor completed steps require an approved human decision");
    }
    verifyReceiptResultHeads({
      storeRoot,
      receipt: predecessor,
      proposal: decision.proposal,
      decision: decision.decision,
      decisionObjectDigest,
      trustedAssetAuthorityContexts,
      trustedPortfolioAuthorityContexts,
      trustedHighImpactApprovalGrants,
      verifyUnchanged: true,
    });
  }
  if (receipt.steps.some(({ status }) => status === "completed")
    && decision.decision.disposition !== "approved") {
    throw new Error("Evolution receipt completed steps require an approved human decision");
  }
  const { resultPortfolio } = verifyReceiptResultHeads({
    storeRoot,
    receipt,
    proposal: decision.proposal,
    decision: decision.decision,
    decisionObjectDigest,
    trustedAssetAuthorityContexts,
    trustedPortfolioAuthorityContexts,
    trustedHighImpactApprovalGrants,
    verifyUnchanged: receipt.state === "completed",
  });
  if (receipt.state === "completed") {
    if (decision.decision.disposition !== "approved") {
      throw new Error("completed Evolution receipt requires an approved human decision");
    }
    if (receipt.action === "adopt_candidate") {
      if (receipt.result_heads.registry_snapshot_digest !== receipt.base_heads.registry_snapshot_digest) {
        throw new Error("Portfolio-only Evolution receipt cannot change the Registry head");
      }
      if (receipt.steps.length !== 1) throw new Error("completed candidate adoption receipt requires exactly one Portfolio step");
      const [step] = receipt.steps;
      if (step.step_id !== "portfolio_activation"
        || step.operation !== "apply_portfolio_transition"
        || step.input_digest !== receipt.base_heads.portfolio_lock_digest
        || step.output_digest !== receipt.result_heads.portfolio_lock_digest) {
        throw new Error("Evolution receipt step input or output differs from the exact approved Portfolio transition");
      }
      if (resultPortfolio.lock.predecessor?.lock_digest !== receipt.base_heads.portfolio_lock_digest
        || resultPortfolio.lock.authority_context_digest !== step.authority_context_digest) {
        throw new Error("Evolution receipt step authority or predecessor differs from the resulting Portfolio lock");
      }
      if (resultPortfolio.lock.current_manifest_digest !== decision.proposal.lifecycle_plan.target_manifest.manifest_digest
        || resultPortfolio.lock.current_asset_set_digest !== decision.proposal.lifecycle_plan.target_manifest.asset_set_digest) {
        throw new Error("Evolution receipt result does not activate the exact approved target manifest");
      }
      const rollbackEntry = resultPortfolio.lock.entries.find(({ manifest_digest }) => manifest_digest === receipt.rollback_anchor.manifest_digest);
      if (!rollbackEntry
        || rollbackEntry.asset_set_digest !== receipt.rollback_anchor.asset_set_digest
        || !["historical", "superseded"].includes(rollbackEntry.state)) {
        throw new Error("Evolution receipt rollback anchor is not preserved in the resulting Portfolio history");
      }
    } else if (NOOP_ACTIONS.has(receipt.action)) {
      if (!compareCanonical(receipt.result_heads, receipt.base_heads) || receipt.steps.length !== 0) {
        throw new Error("completed Evolution no-op receipt must preserve exact heads and contain no lifecycle steps");
      }
    } else {
      throw new Error(`completed Evolution receipt for ${receipt.action} requires a dedicated lifecycle verifier`);
    }
  }
  return deepFreeze({ receipt_object_digest: receiptObjectDigest, receipt: cloneJson(receipt), ...decision });
}

export function verifyEvolutionClosure(options) {
  return verifyEvolutionApplicationReceipt(options);
}

export function applyApprovedEvolutionPortfolioAction({
  storeRoot,
  decisionObjectDigest,
  proposalObjectDigest,
  candidateObjectDigest,
  experimentObjectDigest,
  recommendationObjectDigest,
  portfolioAuthorityContext,
  trustedHumanDecisionAuthorities = [],
  trustedExperimentAuthorities = [],
  trustedEvaluationAuthorities = [],
  trustedAssetAuthorityContexts = [],
  trustedPortfolioAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
  predecessorReceiptDigest = null,
}) {
  const closure = verifyEvolutionHumanDecision({
    storeRoot,
    decisionObjectDigest,
    proposalObjectDigest,
    candidateObjectDigest,
    experimentObjectDigest,
    recommendationObjectDigest,
    trustedHumanDecisionAuthorities,
    trustedExperimentAuthorities,
    trustedEvaluationAuthorities,
    trustedAssetAuthorityContexts,
    trustedPortfolioAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  if (closure.decision.disposition !== "approved" || closure.proposal.action !== "adopt_candidate") {
    throw new Error("only an approved bounded adopt_candidate proposal may mutate a Portfolio");
  }
  if (closure.proposal.decision_scope !== "portfolio_canary_only") {
    throw new Error("MVP Portfolio mutation is limited to the bounded canary decision scope");
  }
  if (portfolioAuthorityContext.authority.kind !== "external_portfolio_activation_authority"
    || portfolioAuthorityContext.authority.authority_evidence_digest !== decisionObjectDigest
    || portfolioAuthorityContext.authority.authority_id !== closure.decision.authority.authority_id) {
    throw new Error("Portfolio lifecycle authority must separately bind the exact human decision object digest");
  }
  if (portfolioAuthorityContext.predecessor_lock_digest !== closure.proposal.lifecycle_plan.base_portfolio_lock_digest
    || !compareCanonical(portfolioAuthorityContext.transitions, closure.proposal.lifecycle_plan.portfolio_transitions)) {
    throw new Error("Portfolio lifecycle authority predecessor or transition batch differs from the approved proposal");
  }
  exactTrustedAuthority(portfolioAuthorityContext, trustedPortfolioAuthorityContexts, "Portfolio activation");
  const applied = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: closure.proposal.lifecycle_plan.base_portfolio_lock_digest,
    authorityContext: portfolioAuthorityContext,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  const verified = verifyPortfolioLock({
    storeRoot,
    lockDigest: applied.lock_digest,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  if (verified.lock.current_manifest_digest !== closure.proposal.lifecycle_plan.target_manifest.manifest_digest) {
    throw new Error("approved Evolution target manifest is not current in the resulting Portfolio lock");
  }
  const retainedRollback = verified.lock.entries.find(({ manifest_digest }) => manifest_digest === closure.proposal.lifecycle_plan.rollback_anchor.manifest_digest);
  if (!retainedRollback || !["historical", "superseded"].includes(retainedRollback.state)
    || retainedRollback.asset_set_digest !== closure.proposal.lifecycle_plan.rollback_anchor.asset_set_digest) {
    throw new Error("Evolution Portfolio update did not preserve the exact rollback anchor");
  }
  const receipt = buildEvolutionApplicationReceipt({
    schema_version: SCHEMA_VERSION,
    object_kind: "evolution_application_receipt",
    predecessor_receipt_digest: predecessorReceiptDigest,
    candidate_digest: closure.candidate.candidate_digest,
    experiment_digest: closure.experiment.experiment_digest,
    recommendation_digest: closure.recommendation.recommendation_digest,
    proposal_digest: closure.proposal.proposal_digest,
    decision_digest: closure.decision.decision_digest,
    action: closure.proposal.action,
    state: "completed",
    base_heads: {
      registry_snapshot_digest: closure.proposal.lifecycle_plan.base_registry_snapshot_digest,
      portfolio_lock_digest: closure.proposal.lifecycle_plan.base_portfolio_lock_digest,
    },
    result_heads: {
      registry_snapshot_digest: closure.proposal.lifecycle_plan.base_registry_snapshot_digest,
      portfolio_lock_digest: applied.lock_digest,
    },
    steps: [{
      step_id: "portfolio_activation",
      operation: "apply_portfolio_transition",
      input_digest: closure.proposal.lifecycle_plan.base_portfolio_lock_digest,
      authority_context_digest: applied.authority_context_digest,
      output_digest: applied.lock_digest,
      status: "completed",
    }],
    rollback_anchor: cloneJson(closure.proposal.lifecycle_plan.rollback_anchor),
    stop: null,
    next_step: null,
    history_preserved: true,
    authority_implied: false,
  });
  const published = publishEvolutionApplicationReceipt({ storeRoot, receipt });
  return deepFreeze({ ...published, lock_digest: applied.lock_digest, lock_revision: applied.lock_revision });
}

export function recordEvolutionNoopReceipt({
  storeRoot,
  closure,
  baseRegistrySnapshotDigest,
  basePortfolioLockDigest,
  predecessorReceiptDigest = null,
  state = "completed",
  stop = null,
  nextStep = null,
}) {
  if (!NOOP_ACTIONS.has(closure.proposal.action)) {
    throw new Error("Evolution no-op receipt cannot record an action that requires Portfolio mutation");
  }
  const receipt = buildEvolutionApplicationReceipt({
    schema_version: SCHEMA_VERSION,
    object_kind: "evolution_application_receipt",
    predecessor_receipt_digest: predecessorReceiptDigest,
    candidate_digest: closure.candidate.candidate_digest,
    experiment_digest: closure.experiment.experiment_digest,
    recommendation_digest: closure.recommendation.recommendation_digest,
    proposal_digest: closure.proposal.proposal_digest,
    decision_digest: closure.decision.decision_digest,
    action: closure.proposal.action,
    state,
    base_heads: { registry_snapshot_digest: baseRegistrySnapshotDigest, portfolio_lock_digest: basePortfolioLockDigest },
    result_heads: { registry_snapshot_digest: baseRegistrySnapshotDigest, portfolio_lock_digest: basePortfolioLockDigest },
    steps: [],
    rollback_anchor: cloneJson(closure.proposal.lifecycle_plan.rollback_anchor),
    stop,
    next_step: nextStep,
    history_preserved: true,
    authority_implied: false,
  });
  return publishEvolutionApplicationReceipt({ storeRoot, receipt });
}
