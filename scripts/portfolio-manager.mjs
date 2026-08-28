import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest,
  listContentAddressedJson,
  putContentAddressedJson,
  readContentAddressedJson,
  stableCanonicalJson,
} from "./content-addressed-store.mjs";
import { verifyAssetRegistry } from "./asset-registry.mjs";
import {
  planExactReuse,
  sealVerificationEvidence,
  validateVerificationRequirements,
  validateVerificationReusePlan,
} from "./verification-evidence.mjs";
import { validateJsonSchema } from "./execution-envelope.mjs";

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = "1.0.0";
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PORTFOLIO_STATES = new Set(["current", "historical", "superseded", "retired"]);
const AUTHORITY_KINDS = new Set([
  "external_portfolio_activation_authority",
  "external_portfolio_rollback_authority",
]);
const ACTION_SEVERITY = new Map([["bypass", 1], ["downgrade", 2], ["stop", 3]]);
const SELECTOR_DIMENSIONS = [
  "task_classes",
  "projects",
  "models",
  "adapters",
  "stacks",
  "domains",
  "capabilities",
  "risk_classes",
];
const CONTEXT_SELECTOR_FIELDS = {
  task_classes: "task_class",
  projects: "project_id",
  models: "model",
  adapters: "adapter",
  stacks: "stack",
  domains: "domain",
  risk_classes: "risk_class",
};
const CONTEXT_ALLOWLIST_SET_FIELDS = ["capabilities", "operation_scopes"];
const BUDGET_METRICS = ["token_count", "duration_ms", "cost_microunits"];
const PROHIBITED_SELECTION_KEY = /(?:^|_)(?:result|results|score|scores|correctness|recommendation|recommendations|completion_claim|outcome|outcomes|measured_result|measured_metric|hidden_test|hidden_answer|oracle|evaluator_result|evaluator_outcome|evaluator_decision|evaluation_decision|promotion_decision|post_execution|post_result|verdict|verdicts|reward|rewards|pass_rate|failure_rate|success_rate|observed_quality|telemetry)(?:_|$)/iu;

const schemaPath = (name) => {
  const colocated = resolve(RUNTIME_ROOT, name);
  return existsSync(colocated) ? colocated : resolve(RUNTIME_ROOT, "../schemas", name);
};

const SCHEMAS = {
  manifest: schemaPath("portfolio-manifest.schema.json"),
  lock: schemaPath("portfolio-lock.schema.json"),
  authority: schemaPath("portfolio-authority-context.schema.json"),
  selectionContext: schemaPath("portfolio-selection-context.schema.json"),
  selection: schemaPath("portfolio-selection.schema.json"),
};

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

function assertSortedUnique(values, compare, label) {
  for (let index = 1; index < values.length; index += 1) {
    const order = compare(values[index - 1], values[index]);
    if (order === 0) throw new Error(`${label} contains a duplicate entry`);
    if (order > 0) throw new Error(`${label} is not deterministically ordered`);
  }
}

function sortedText(values) {
  return [...values].sort(compareText);
}

function exactAssetRef(value) {
  return {
    asset_type: value.asset_type,
    stable_id: value.stable_id,
    version: value.version,
    record_digest: value.record_digest,
    content_digest: value.content_digest,
  };
}

function assetRefKey(ref) {
  return `${ref.stable_id}\u0000${ref.version}`;
}

function assetRefCompare(left, right) {
  return compareText(left.stable_id, right.stable_id)
    || compareText(left.version, right.version)
    || compareText(left.record_digest, right.record_digest)
    || compareText(left.content_digest, right.content_digest);
}

function entryCompare(left, right) {
  return compareText(left.entry_id, right.entry_id)
    || assetRefCompare(left.asset, right.asset);
}

function manifestEntryCompare(left, right) {
  return compareText(left.revision, right.revision)
    || compareText(left.manifest_digest, right.manifest_digest);
}

function portfolioRefFromManifest(manifest, manifestDigest) {
  return {
    portfolio_id: manifest.portfolio_id,
    revision: manifest.revision,
    manifest_digest: manifestDigest,
    asset_set_digest: manifest.asset_set_digest,
  };
}

function portfolioRefCompare(left, right) {
  return compareText(left.portfolio_id, right.portfolio_id)
    || compareText(left.revision, right.revision)
    || compareText(left.manifest_digest, right.manifest_digest)
    || compareText(left.asset_set_digest, right.asset_set_digest);
}

function transitionCompare(left, right) {
  return portfolioRefCompare(left.manifest, right.manifest)
    || compareText(left.from_state ?? "", right.from_state ?? "")
    || compareText(left.to_state, right.to_state);
}

function grantCompare(left, right) {
  return compareText(left.manifest_digest, right.manifest_digest)
    || compareText(left.entry_id, right.entry_id)
    || assetRefCompare(left.asset, right.asset)
    || compareText(left.approval_authority.authority_id, right.approval_authority.authority_id)
    || compareText(left.approval_authority.authority_revision, right.approval_authority.authority_revision)
    || compareText(left.approval_authority.authority_evidence_digest, right.approval_authority.authority_evidence_digest);
}

function normalizeSelector(selector) {
  for (const dimensionName of SELECTOR_DIMENSIONS) {
    selector[dimensionName].included = sortedText(selector[dimensionName].included);
    selector[dimensionName].excluded = sortedText(selector[dimensionName].excluded);
  }
}

function validateSelector(selector, label) {
  for (const dimensionName of SELECTOR_DIMENSIONS) {
    const dimension = selector[dimensionName];
    assertSortedUnique(dimension.included, compareText, `${label} ${dimensionName} included set`);
    assertSortedUnique(dimension.excluded, compareText, `${label} ${dimensionName} excluded set`);
    const overlap = dimension.included.filter((value) => dimension.excluded.includes(value));
    if (overlap.length > 0) throw new Error(`${label} ${dimensionName} contains contradictory include/exclude values: ${overlap.join(", ")}`);
    if (dimension.status === "bounded" && dimension.included.length + dimension.excluded.length === 0) {
      throw new Error(`${label} bounded ${dimensionName} selector must declare an include or exclude value`);
    }
    if (dimension.status !== "bounded" && dimension.included.length + dimension.excluded.length > 0) {
      throw new Error(`${label} ${dimensionName} ${dimension.status} selector cannot carry values`);
    }
  }
}

function validateSelectionContextAllowlist(allowlist) {
  scanProhibitedSelectionKeys(allowlist, "$.selection_context_allowlist");
  for (const field of [...Object.keys(CONTEXT_SELECTOR_FIELDS), ...CONTEXT_ALLOWLIST_SET_FIELDS]) {
    assertSortedUnique(allowlist[field], compareText, `Portfolio selection-context ${field} allowlist`);
  }
}

function assertValuesAllowed(values, allowedValues, label) {
  const disallowed = values.filter((value) => !allowedValues.includes(value));
  if (disallowed.length > 0) {
    throw new Error(`${label} contains values outside the sealed pre-result allowlist: ${disallowed.join(", ")}`);
  }
}

function validateSelectorVocabulary(selector, allowlist, label) {
  for (const field of Object.keys(CONTEXT_SELECTOR_FIELDS)) {
    assertValuesAllowed(selector[field].included, allowlist[field], `${label} ${field} included set`);
    assertValuesAllowed(selector[field].excluded, allowlist[field], `${label} ${field} excluded set`);
  }
  assertValuesAllowed(selector.capabilities.included, allowlist.capabilities, `${label} capabilities included set`);
  assertValuesAllowed(selector.capabilities.excluded, allowlist.capabilities, `${label} capabilities excluded set`);
}

function validateAssetApplicabilityVocabulary(asset, allowlist, label) {
  const applicability = asset.record.applicability;
  for (const field of ["task_classes", "projects", "models", "adapters", "stacks", "domains"]) {
    assertValuesAllowed(applicability[field].included, allowlist[field], `${label} ${field} included set`);
    assertValuesAllowed(applicability[field].excluded, allowlist[field], `${label} ${field} excluded set`);
  }
  assertValuesAllowed(applicability.required_capabilities, allowlist.capabilities, `${label} required capabilities`);
  assertValuesAllowed(applicability.included_scopes, allowlist.operation_scopes, `${label} included operation scopes`);
  assertValuesAllowed(applicability.excluded_scopes, allowlist.operation_scopes, `${label} excluded operation scopes`);
}

function validateQuantity(quantity, label) {
  if (quantity.status === "known" && !Number.isInteger(quantity.value)) throw new Error(`${label} known quantity requires an integer value`);
  if (quantity.status === "unknown" && quantity.value !== null) throw new Error(`${label} unknown quantity must keep a null value`);
}

function validateLimit(limit, label) {
  if (limit.status === "bounded" && !Number.isInteger(limit.maximum)) throw new Error(`${label} bounded limit requires an integer maximum`);
  if (limit.status === "unbounded" && limit.maximum !== null) throw new Error(`${label} unbounded limit must keep a null maximum`);
}

function normalizeManifestDraft(draft) {
  const manifest = cloneJson(draft);
  normalizeSelector(manifest.selectors);
  for (const field of [...Object.keys(CONTEXT_SELECTOR_FIELDS), ...CONTEXT_ALLOWLIST_SET_FIELDS]) {
    manifest.selection_context_allowlist[field] = sortedText(manifest.selection_context_allowlist[field]);
  }
  for (const entry of manifest.entries) {
    normalizeSelector(entry.selectors);
    entry.prohibited_task_classes = sortedText(entry.prohibited_task_classes);
    entry.evidence_requirement_ids = sortedText(entry.evidence_requirement_ids);
  }
  manifest.entries.sort(entryCompare);
  for (const requirement of manifest.evidence_requirements) {
    requirement.entry_ids = sortedText(requirement.entry_ids);
    requirement.allowed_dispositions = sortedText(requirement.allowed_dispositions);
    requirement.required_current_state_refs.sort((left, right) => compareText(left.state_id, right.state_id)
      || compareText(left.state_digest, right.state_digest));
  }
  manifest.evidence_requirements.sort((left, right) => compareText(left.requirement_id, right.requirement_id));
  manifest.safety_guardrails.prohibited_effects = sortedText(manifest.safety_guardrails.prohibited_effects);
  for (const conflict of manifest.unresolved_conflicts) {
    conflict.entry_ids = sortedText(conflict.entry_ids);
    normalizeSelector(conflict.selectors);
  }
  manifest.unresolved_conflicts.sort((left, right) => compareText(left.conflict_id, right.conflict_id));
  manifest.benchmark_compatibility.sort((left, right) => compareText(left.condition_id, right.condition_id)
    || compareText(left.config_path, right.config_path));
  return manifest;
}

function assetSetIdentity(entries) {
  return entries.map((entry) => ({
    entry_id: entry.entry_id,
    role: entry.role,
    assurance_lane: entry.assurance_lane,
    asset: cloneJson(entry.asset),
    expected_registry_state: entry.expected_registry_state,
    expected_scope_id: entry.expected_scope_id,
    exposure: cloneJson(entry.exposure),
  }));
}

export function computePortfolioAssetSetDigest(value) {
  const entries = Array.isArray(value) ? value : value.entries;
  return canonicalDigest(assetSetIdentity([...entries].sort(entryCompare)));
}

function selectionBasis(manifest) {
  const basis = cloneJson(manifest);
  delete basis.evidence_requirements;
  delete basis.asset_set_digest;
  delete basis.selection_basis_digest;
  return basis;
}

export function computePortfolioSelectionBasisDigest(manifest) {
  const normalized = normalizeManifestDraft({
    ...cloneJson(manifest),
    evidence_requirements: cloneJson(manifest.evidence_requirements ?? []),
  });
  return canonicalDigest(selectionBasis(normalized));
}

function assertManifestComputedIdentity(manifest) {
  const expectedAssetSet = computePortfolioAssetSetDigest(manifest);
  if (manifest.asset_set_digest !== expectedAssetSet) throw new Error("Portfolio manifest Asset-set digest mismatch");
  const expectedBasis = canonicalDigest(selectionBasis(manifest));
  if (manifest.selection_basis_digest !== expectedBasis) throw new Error("Portfolio manifest selection-basis digest mismatch");
}

function validateEvidenceRequirementBindings(manifest) {
  const entriesById = new Map(manifest.entries.map((entry) => [entry.entry_id, entry]));
  const requirementsById = new Map();
  for (const requirement of manifest.evidence_requirements) {
    if (requirementsById.has(requirement.requirement_id)) throw new Error(`duplicate Portfolio evidence requirement ${requirement.requirement_id}`);
    requirementsById.set(requirement.requirement_id, requirement);
    assertSortedUnique(requirement.entry_ids, compareText, `${requirement.requirement_id} entry IDs`);
    assertSortedUnique(requirement.allowed_dispositions, compareText, `${requirement.requirement_id} allowed dispositions`);
    assertSortedUnique(requirement.required_current_state_refs, (left, right) => compareText(left.state_id, right.state_id)
      || compareText(left.state_digest, right.state_digest), `${requirement.requirement_id} current-state references`);
    if (requirement.entry_ids.length === 0) throw new Error(`${requirement.requirement_id} must bind at least one Portfolio entry`);
    if (requirement.required_current_state_refs.length === 0) {
      throw new Error(`${requirement.requirement_id} must bind at least one exact current-state reference`);
    }
    const currentStateIds = new Set();
    for (const stateRef of requirement.required_current_state_refs) {
      if (currentStateIds.has(stateRef.state_id)) {
        throw new Error(`${requirement.requirement_id} repeats current-state ID ${stateRef.state_id}`);
      }
      currentStateIds.add(stateRef.state_id);
    }
    const repositoryTreeState = requirement.required_current_state_refs.find((stateRef) => stateRef.state_id === "repository-tree");
    if (!repositoryTreeState || repositoryTreeState.state_digest !== requirement.requirements.target.tree_digest) {
      throw new Error(`${requirement.requirement_id} repository-tree state must bind the exact verification target tree`);
    }
    for (const entryId of requirement.entry_ids) {
      if (!entriesById.has(entryId)) throw new Error(`${requirement.requirement_id} references unknown Portfolio entry ${entryId}`);
    }
    validateVerificationRequirements(requirement.requirements);
    if (requirement.requirements.target.repository_id !== manifest.repository_id
      || requirement.requirements.target.target_revision !== manifest.source_revision) {
      throw new Error(`${requirement.requirement_id} target does not match the Portfolio repository/source revision`);
    }
    for (const gate of requirement.requirements.required_gates) {
      const bindings = gate.reuse_identity.consumed_inputs.filter((input) => (
        input.kind === "manifest"
        && input.path === "portfolio-selection-basis.json"
      ));
      if (bindings.length !== 1 || bindings[0].digest !== manifest.selection_basis_digest) {
        throw new Error(`${requirement.requirement_id} must bind the exact Portfolio selection-basis digest`);
      }
    }
  }
  for (const entry of manifest.entries) {
    for (const requirementId of entry.evidence_requirement_ids) {
      const requirement = requirementsById.get(requirementId);
      if (!requirement || !requirement.entry_ids.includes(entry.entry_id)) {
        throw new Error(`Portfolio entry ${entry.entry_id} evidence requirement binding is incomplete`);
      }
    }
    const reverse = manifest.evidence_requirements
      .filter((requirement) => requirement.entry_ids.includes(entry.entry_id))
      .map((requirement) => requirement.requirement_id);
    if (stableCanonicalJson(reverse) !== stableCanonicalJson(entry.evidence_requirement_ids)) {
      throw new Error(`Portfolio entry ${entry.entry_id} evidence requirement references are not bidirectional`);
    }
    if (entry.assurance_lane !== "exploratory" && entry.evidence_requirement_ids.length === 0) {
      throw new Error(`Portfolio entry ${entry.entry_id} assurance lane requires exact evidence requirements`);
    }
  }
}

function validateEntrySemantics(entry) {
  validateSelector(entry.selectors, `Portfolio entry ${entry.entry_id}`);
  assertSortedUnique(entry.prohibited_task_classes, compareText, `Portfolio entry ${entry.entry_id} prohibited task classes`);
  assertSortedUnique(entry.evidence_requirement_ids, compareText, `Portfolio entry ${entry.entry_id} evidence requirement IDs`);
  for (const metric of BUDGET_METRICS) validateQuantity(entry.cost_estimate[metric], `Portfolio entry ${entry.entry_id} ${metric} estimate`);
  if (entry.exposure.mode === "canary") {
    if (!Number.isInteger(entry.exposure.canary_percent) || entry.exposure.canary_percent < 1 || entry.exposure.canary_percent > 99) {
      throw new Error(`Portfolio entry ${entry.entry_id} canary exposure must be bounded from 1 through 99 percent`);
    }
  } else if (entry.exposure.canary_percent !== null) {
    throw new Error(`Portfolio entry ${entry.entry_id} non-canary exposure cannot carry canary_percent`);
  }
  if (entry.assurance_lane === "exploratory") {
    if (entry.role !== "experimental" || entry.exposure.mode !== "shadow") {
      throw new Error(`Portfolio entry ${entry.entry_id} exploratory lane is experimental shadow only`);
    }
  } else if (entry.assurance_lane === "challenger") {
    if (entry.role !== "challenger" || !["shadow", "canary"].includes(entry.exposure.mode)) {
      throw new Error(`Portfolio entry ${entry.entry_id} challenger lane requires challenger shadow/canary use`);
    }
  } else if (entry.assurance_lane === "admitted") {
    if (entry.role !== "baseline" || entry.exposure.mode !== "active" || entry.expected_registry_state !== "current") {
      throw new Error(`Portfolio entry ${entry.entry_id} admitted lane requires an active current baseline`);
    }
  } else if (entry.assurance_lane === "high_impact_active") {
    if (entry.role !== "baseline" || entry.exposure.mode !== "active" || entry.expected_registry_state !== "current") {
      throw new Error(`Portfolio entry ${entry.entry_id} high-impact lane requires an active current baseline`);
    }
  }
  const expectedRequirement = entry.assurance_lane === "high_impact_active"
    ? "high_impact_independent_activation"
    : "portfolio_activation";
  if (entry.activation_requirement !== expectedRequirement) {
    throw new Error(`Portfolio entry ${entry.entry_id} activation requirement does not match its assurance lane`);
  }
  if (entry.expected_registry_state === "candidate" && entry.exposure.mode === "active") {
    throw new Error(`Portfolio entry ${entry.entry_id} candidate Asset cannot be active`);
  }
}

export function validatePortfolioManifest(manifest) {
  validateSchema(manifest, SCHEMAS.manifest, "Portfolio manifest");
  const normalized = normalizeManifestDraft(manifest);
  if (!compareCanonical(normalized, manifest)) throw new Error("Portfolio manifest unordered sets or entries are not deterministically ordered");
  assertManifestComputedIdentity(manifest);
  validateSelector(manifest.selectors, "Portfolio manifest");
  validateSelectionContextAllowlist(manifest.selection_context_allowlist);
  validateSelectorVocabulary(manifest.selectors, manifest.selection_context_allowlist, "Portfolio manifest");
  assertSortedUnique(manifest.entries, entryCompare, "Portfolio manifest entries");
  assertSortedUnique(manifest.unresolved_conflicts, (left, right) => compareText(left.conflict_id, right.conflict_id), "Portfolio unresolved conflicts");
  assertSortedUnique(manifest.benchmark_compatibility, (left, right) => compareText(left.condition_id, right.condition_id)
    || compareText(left.config_path, right.config_path), "Portfolio benchmark compatibility bindings");
  const entryIds = new Set();
  const assetRefs = new Set();
  for (const entry of manifest.entries) {
    if (entryIds.has(entry.entry_id)) throw new Error(`duplicate Portfolio entry ID ${entry.entry_id}`);
    entryIds.add(entry.entry_id);
    const assetKey = stableCanonicalJson(entry.asset);
    if (assetRefs.has(assetKey)) throw new Error(`Portfolio manifest repeats exact Asset ${entry.asset.stable_id}@${entry.asset.version}`);
    assetRefs.add(assetKey);
    validateEntrySemantics(entry);
    validateSelectorVocabulary(entry.selectors, manifest.selection_context_allowlist, `Portfolio entry ${entry.entry_id}`);
    assertValuesAllowed(
      entry.prohibited_task_classes,
      manifest.selection_context_allowlist.task_classes,
      `Portfolio entry ${entry.entry_id} prohibited task classes`,
    );
  }
  for (const conflict of manifest.unresolved_conflicts) {
    validateSelector(conflict.selectors, `Portfolio conflict ${conflict.conflict_id}`);
    validateSelectorVocabulary(conflict.selectors, manifest.selection_context_allowlist, `Portfolio conflict ${conflict.conflict_id}`);
    assertSortedUnique(conflict.entry_ids, compareText, `Portfolio conflict ${conflict.conflict_id} entry IDs`);
    if (conflict.entry_ids.length < 2 || conflict.entry_ids.some((entryId) => !entryIds.has(entryId))) {
      throw new Error(`Portfolio conflict ${conflict.conflict_id} must bind at least two known entries`);
    }
  }
  for (const metric of BUDGET_METRICS) validateLimit(manifest.budgets.policy_limits[metric], `Portfolio ${metric} policy`);
  assertSortedUnique(manifest.safety_guardrails.prohibited_effects, compareText, "Portfolio prohibited effects");
  if (manifest.rollback.mode === "none" && manifest.rollback.target !== null) throw new Error("Portfolio rollback none mode cannot carry a target");
  if (manifest.rollback.mode === "exact") {
    if (manifest.rollback.target === null) throw new Error("Portfolio exact rollback requires a target");
    if (manifest.rollback.target.portfolio_id !== manifest.portfolio_id || manifest.rollback.target.revision === manifest.revision) {
      throw new Error("Portfolio rollback target must be a different revision of the same Portfolio");
    }
  }
  const kernelSegments = manifest.kernel_foundation.source_path.split("/");
  if (kernelSegments.some((segment) => segment === "." || segment === "..")) throw new Error("Portfolio Kernel foundation path cannot contain traversal segments");
  validateEvidenceRequirementBindings(manifest);
  return manifest;
}

export function buildPortfolioManifest(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error("Portfolio manifest draft must be an object");
  const suppliedAssetSet = draft.asset_set_digest;
  const suppliedSelectionBasis = draft.selection_basis_digest;
  const manifest = normalizeManifestDraft({
    ...cloneJson(draft),
    asset_set_digest: draft.asset_set_digest ?? "sha256:".padEnd(71, "0"),
    selection_basis_digest: draft.selection_basis_digest ?? "sha256:".padEnd(71, "0"),
  });
  manifest.asset_set_digest = computePortfolioAssetSetDigest(manifest);
  manifest.selection_basis_digest = canonicalDigest(selectionBasis(manifest));
  if (suppliedAssetSet !== undefined && suppliedAssetSet !== manifest.asset_set_digest) throw new Error("caller-supplied Portfolio Asset-set digest mismatch");
  if (suppliedSelectionBasis !== undefined && suppliedSelectionBasis !== manifest.selection_basis_digest) throw new Error("caller-supplied Portfolio selection-basis digest mismatch");
  validatePortfolioManifest(manifest);
  return deepFreeze(manifest);
}

function verifiedRegistryForManifest({ storeRoot, manifest, trustedAssetAuthorityContexts }) {
  const registry = verifyAssetRegistry({
    storeRoot,
    snapshotDigest: manifest.registry.snapshot_digest,
    trustedAuthorityContexts: trustedAssetAuthorityContexts,
  });
  for (const field of ["registry_id", "repository_id", "scope_id", "snapshot_revision"]) {
    if (registry[field] !== manifest.registry[field]) throw new Error(`Portfolio manifest Registry ${field} binding mismatch`);
  }
  if (manifest.repository_id !== registry.repository_id || manifest.scope_id !== registry.scope_id) {
    throw new Error("Portfolio manifest repository/scope does not match its verified Asset Registry");
  }
  const assetsByKey = new Map(registry.assets.map((asset) => [assetRefKey(asset), asset]));
  const boundAssets = [];
  for (const entry of manifest.entries) {
    const asset = assetsByKey.get(assetRefKey(entry.asset));
    if (!asset) throw new Error(`Portfolio entry ${entry.entry_id} exact Asset version is not registered`);
    if (!compareCanonical(exactAssetRef(asset), entry.asset)) throw new Error(`Portfolio entry ${entry.entry_id} Asset digest transplant rejected`);
    if (asset.state !== entry.expected_registry_state) throw new Error(`Portfolio entry ${entry.entry_id} expected Registry state mismatch`);
    if (asset.scope_id !== entry.expected_scope_id) throw new Error(`Portfolio entry ${entry.entry_id} Asset scope transplant rejected`);
    if (entry.expected_scope_id !== manifest.scope_id) throw new Error(`Portfolio entry ${entry.entry_id} expected scope differs from the Portfolio scope`);
    if (["historical", "superseded", "retired"].includes(asset.state)) throw new Error(`Portfolio entry ${entry.entry_id} references an ineligible Registry state`);
    if (entry.exposure.mode === "active" && asset.record.applicability.excluded_scopes.includes("automatic_portfolio_activation")) {
      throw new Error(`Portfolio entry ${entry.entry_id} Asset excludes automatic Portfolio activation`);
    }
    const classifiedHighImpact = asset.record.safety.classifications.includes("high_impact");
    if (classifiedHighImpact && entry.assurance_lane !== "high_impact_active") {
      throw new Error(`Portfolio entry ${entry.entry_id} cannot downgrade a high-impact Asset assurance lane`);
    }
    validateAssetApplicabilityVocabulary(
      asset,
      manifest.selection_context_allowlist,
      `Portfolio entry ${entry.entry_id} Asset applicability`,
    );
    boundAssets.push({ entry_id: entry.entry_id, asset });
  }
  return { registry, boundAssets };
}

export function publishPortfolioManifest({
  storeRoot,
  draft,
  trustedAssetAuthorityContexts = [],
}) {
  if (!Array.isArray(trustedAssetAuthorityContexts)) throw new Error("trusted Asset authority contexts must be an array");
  const manifest = buildPortfolioManifest(draft);
  verifiedRegistryForManifest({ storeRoot, manifest, trustedAssetAuthorityContexts });
  const publication = putContentAddressedJson({ storeRoot, artifact: manifest });
  return deepFreeze({
    portfolio_id: manifest.portfolio_id,
    revision: manifest.revision,
    manifest_digest: publication.digest,
    asset_set_digest: manifest.asset_set_digest,
    selection_basis_digest: manifest.selection_basis_digest,
    created: publication.created,
  });
}

export function verifyPortfolioManifest({
  storeRoot,
  manifestDigest,
  trustedAssetAuthorityContexts = [],
}) {
  assertDigest(manifestDigest, "Portfolio manifest digest");
  const stored = readContentAddressedJson({ storeRoot, digest: manifestDigest });
  validatePortfolioManifest(stored.value);
  const closure = verifiedRegistryForManifest({
    storeRoot,
    manifest: stored.value,
    trustedAssetAuthorityContexts,
  });
  return deepFreeze({
    manifest_digest: manifestDigest,
    manifest: cloneJson(stored.value),
    registry: cloneJson(closure.registry),
    bound_assets: cloneJson(closure.boundAssets),
  });
}

function normalizeAuthorityContextDraft(draft) {
  const context = cloneJson(draft);
  context.transitions.sort(transitionCompare);
  context.grants.sort(grantCompare);
  return context;
}

function validateAuthorityContext(context) {
  validateSchema(context, SCHEMAS.authority, "Portfolio authority context");
  if (!AUTHORITY_KINDS.has(context.authority.kind)) {
    throw new Error("verification, evaluator, Asset, or producer identity is not Portfolio lifecycle authority");
  }
  assertSortedUnique(context.transitions, transitionCompare, "Portfolio authority transition batch");
  assertSortedUnique(context.grants, grantCompare, "Portfolio high-impact activation grants");
  const transitionSubjects = new Set();
  for (const transition of context.transitions) {
    const key = transition.manifest.manifest_digest;
    if (transitionSubjects.has(key)) throw new Error("Portfolio authority transition batch contains duplicate manifest subjects");
    transitionSubjects.add(key);
    if (transition.manifest.portfolio_id !== context.portfolio_id) throw new Error("Portfolio authority transition subject uses the wrong Portfolio ID");
    if (transition.from_state === transition.to_state) throw new Error("Portfolio authority transition must change state");
  }
  if (context.transition_basis_digest !== canonicalDigest(context.transitions)) {
    throw new Error("Portfolio authority transition-basis digest mismatch");
  }
  if (context.grant_basis_digest !== canonicalDigest(context.grants)) {
    throw new Error("Portfolio authority grant-basis digest mismatch");
  }
  const basis = cloneJson(context);
  delete basis.context_digest;
  if (context.context_digest !== canonicalDigest(basis)) throw new Error("Portfolio authority context digest mismatch");
  if (context.authority.kind === "external_portfolio_activation_authority" && context.rollback_target !== null) {
    throw new Error("ordinary Portfolio activation authority cannot carry a rollback target");
  }
  if (context.authority.kind === "external_portfolio_rollback_authority" && context.rollback_target === null) {
    throw new Error("Portfolio rollback authority requires an exact rollback target");
  }
  return context;
}

export function buildPortfolioAuthorityContext({
  portfolioId,
  repositoryId,
  scopeId,
  predecessorLockDigest,
  transitions,
  grants = [],
  rollbackTarget = null,
  authority,
}) {
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) throw new Error("Portfolio lifecycle authority is required");
  if (String(authority.kind ?? "").includes("verification")
    || String(authority.kind ?? "").includes("producer")
    || String(authority.kind ?? "").includes("evaluator")
    || String(authority.kind ?? "").includes("asset")) {
    throw new Error("verification, evaluator, Asset, or producer identity is not Portfolio lifecycle authority");
  }
  if (!AUTHORITY_KINDS.has(authority.kind)) throw new Error("unsupported Portfolio lifecycle authority kind");
  if (!Array.isArray(transitions) || transitions.length === 0) throw new Error("Portfolio lifecycle transition batch must not be empty");
  if (!Array.isArray(grants)) throw new Error("Portfolio high-impact grants must be an array");
  const basis = normalizeAuthorityContextDraft({
    schema_version: SCHEMA_VERSION,
    object_kind: "portfolio_authority_context",
    portfolio_id: portfolioId,
    repository_id: repositoryId,
    scope_id: scopeId,
    predecessor_lock_digest: predecessorLockDigest,
    transitions: cloneJson(transitions),
    transition_basis_digest: "",
    grants: cloneJson(grants),
    grant_basis_digest: "",
    rollback_target: cloneJson(rollbackTarget),
    authority: cloneJson(authority),
  });
  basis.transition_basis_digest = canonicalDigest(basis.transitions);
  basis.grant_basis_digest = canonicalDigest(basis.grants);
  const context = { ...basis, context_digest: canonicalDigest(basis) };
  validateAuthorityContext(context);
  return deepFreeze(context);
}

function validateLockShape(lock) {
  validateSchema(lock, SCHEMAS.lock, "Portfolio lock");
  assertSortedUnique(lock.entries, manifestEntryCompare, "Portfolio lock entries");
  const current = lock.entries.filter((entry) => entry.state === "current");
  const revisions = new Set();
  for (const entry of lock.entries) {
    if (revisions.has(entry.revision)) throw new Error(`Portfolio lock repeats manifest revision ${entry.revision}`);
    revisions.add(entry.revision);
  }
  if (lock.entries.length === 0) {
    if (lock.current_manifest_digest !== null || lock.current_asset_set_digest !== null) {
      throw new Error("empty Portfolio lock cannot carry a current manifest");
    }
  } else {
    if (current.length !== 1) throw new Error("non-empty Portfolio lock must contain exactly one current manifest");
    if (lock.current_manifest_digest !== current[0].manifest_digest
      || lock.current_asset_set_digest !== current[0].asset_set_digest) {
      throw new Error("Portfolio lock current identity does not match its current entry");
    }
  }
  return lock;
}

export function createEmptyPortfolioLock({
  storeRoot,
  portfolioId,
  repositoryId,
  scopeId,
}) {
  const lock = {
    schema_version: SCHEMA_VERSION,
    object_kind: "portfolio_lock",
    portfolio_id: portfolioId,
    repository_id: repositoryId,
    scope_id: scopeId,
    lock_revision: 1,
    predecessor: null,
    entries: [],
    current_manifest_digest: null,
    current_asset_set_digest: null,
    authority_context_digest: null,
  };
  validateLockShape(lock);
  const publication = putContentAddressedJson({ storeRoot, artifact: lock });
  const verified = verifyPortfolioLock({ storeRoot, lockDigest: publication.digest });
  return deepFreeze({
    lock_digest: verified.lock_digest,
    lock_revision: verified.lock.lock_revision,
    created: publication.created,
  });
}

function lockEntryFromRef(ref, state) {
  return {
    revision: ref.revision,
    manifest_digest: ref.manifest_digest,
    asset_set_digest: ref.asset_set_digest,
    state,
  };
}

function assertPortfolioRefMatchesManifest(ref, closure, relation) {
  const expected = portfolioRefFromManifest(closure.manifest, closure.manifest_digest);
  if (!compareCanonical(ref, expected)) throw new Error(`${relation} exact manifest identity mismatch; Portfolio transplant rejected`);
}

function highImpactGrantsForManifest(context, closure, trustedHighImpactApprovalGrants) {
  const requiredEntries = closure.manifest.entries.filter((entry) => entry.assurance_lane === "high_impact_active");
  const grants = context.grants.filter((grant) => grant.manifest_digest === closure.manifest_digest);
  for (const entry of requiredEntries) {
    const matches = grants.filter((grant) => (
      grant.entry_id === entry.entry_id
      && compareCanonical(grant.asset, entry.asset)
    ));
    if (matches.length !== 1) {
      throw new Error(`Portfolio entry ${entry.entry_id} high-impact activation requires one exact independent approval grant`);
    }
    const [grant] = matches;
    if (grant.approval_authority.authority_id === context.authority.authority_id) {
      throw new Error(`Portfolio entry ${entry.entry_id} high-impact approval authority must be independent from lifecycle activation authority`);
    }
    if (!trustedHighImpactApprovalGrants.some((trusted) => compareCanonical(trusted, grant))) {
      throw new Error(`Portfolio entry ${entry.entry_id} requires a separately trusted exact high-impact approval grant`);
    }
  }
  if (grants.length !== requiredEntries.length || context.grants.length !== requiredEntries.length) {
    throw new Error("Portfolio authority context contains unused or transplanted high-impact activation grants");
  }
}

function assertCurrentRollbackTargetAvailable(entries, currentClosure) {
  const rollback = currentClosure.manifest.rollback;
  if (rollback.mode === "none") return;
  const target = entries.find((entry) => entry.manifest_digest === rollback.target.manifest_digest);
  if (!target
    || target.revision !== rollback.target.revision
    || target.asset_set_digest !== rollback.target.asset_set_digest) {
    throw new Error("current Portfolio rollback target is absent or its exact identity drifted");
  }
  if (!["historical", "superseded"].includes(target.state)) {
    throw new Error("current Portfolio exact rollback target must remain historical or superseded; it cannot be current or retired");
  }
}

function applyPortfolioTransitionsToEntries({
  storeRoot,
  predecessor,
  context,
  trustedAssetAuthorityContexts,
  trustedHighImpactApprovalGrants,
}) {
  const next = predecessor.entries.map(cloneJson);
  const byDigest = new Map(next.map((entry) => [entry.manifest_digest, entry]));
  const manifestClosures = new Map();
  for (const transition of context.transitions) {
    const closure = verifyPortfolioManifest({
      storeRoot,
      manifestDigest: transition.manifest.manifest_digest,
      trustedAssetAuthorityContexts,
    });
    assertPortfolioRefMatchesManifest(transition.manifest, closure, "Portfolio lifecycle transition subject");
    if (closure.manifest.portfolio_id !== predecessor.portfolio_id
      || closure.manifest.repository_id !== predecessor.repository_id
      || closure.manifest.scope_id !== predecessor.scope_id) {
      throw new Error("Portfolio lifecycle transition manifest identity differs from the lock scope");
    }
    manifestClosures.set(transition.manifest.manifest_digest, closure);
    const existing = byDigest.get(transition.manifest.manifest_digest);
    if (transition.from_state === null) {
      if (existing) throw new Error("Portfolio lifecycle transition claims an existing manifest is absent");
      if (transition.to_state !== "current" || context.authority.kind !== "external_portfolio_activation_authority") {
        throw new Error("new Portfolio manifest may enter a lock only as current under activation authority");
      }
      const entry = lockEntryFromRef(transition.manifest, transition.to_state);
      next.push(entry);
      byDigest.set(entry.manifest_digest, entry);
      continue;
    }
    if (!existing) throw new Error("Portfolio lifecycle transition subject is not present in the predecessor lock");
    if (existing.state !== transition.from_state) throw new Error("Portfolio lifecycle transition source state mismatch");
    if (existing.revision !== transition.manifest.revision || existing.asset_set_digest !== transition.manifest.asset_set_digest) {
      throw new Error("Portfolio lifecycle transition entry identity drift");
    }
    if (existing.state === "retired") throw new Error("retired Portfolio manifest is terminal");
    const rollbackToCurrent = ["historical", "superseded"].includes(existing.state) && transition.to_state === "current";
    if (rollbackToCurrent && context.authority.kind !== "external_portfolio_rollback_authority") {
      throw new Error("Portfolio rollback transition requires explicit rollback authority");
    }
    if (context.authority.kind === "external_portfolio_rollback_authority") {
      const allowed = rollbackToCurrent
        || (existing.state === "current" && ["historical", "superseded"].includes(transition.to_state));
      if (!allowed) throw new Error(`Portfolio rollback authority cannot perform ${existing.state} -> ${transition.to_state}`);
    } else {
      const allowed = (existing.state === "current" && ["historical", "superseded"].includes(transition.to_state))
        || (transition.to_state === "retired");
      if (!allowed) throw new Error(`Portfolio activation authority cannot perform ${existing.state} -> ${transition.to_state}`);
    }
    existing.state = transition.to_state;
  }
  next.sort(manifestEntryCompare);
  const current = next.filter((entry) => entry.state === "current");
  if (current.length !== 1) throw new Error("Portfolio lifecycle transition must produce exactly one current manifest");
  const currentClosure = manifestClosures.get(current[0].manifest_digest)
    ?? verifyPortfolioManifest({
      storeRoot,
      manifestDigest: current[0].manifest_digest,
      trustedAssetAuthorityContexts,
    });
  highImpactGrantsForManifest(context, currentClosure, trustedHighImpactApprovalGrants);
  assertCurrentRollbackTargetAvailable(next, currentClosure);

  const predecessorCurrent = predecessor.entries.find((entry) => entry.state === "current") ?? null;
  if (context.authority.kind === "external_portfolio_activation_authority") {
    if (predecessorCurrent && predecessorCurrent.manifest_digest !== current[0].manifest_digest) {
      const rollback = currentClosure.manifest.rollback;
      const expectedTarget = {
        portfolio_id: predecessor.portfolio_id,
        revision: predecessorCurrent.revision,
        manifest_digest: predecessorCurrent.manifest_digest,
        asset_set_digest: predecessorCurrent.asset_set_digest,
      };
      if (rollback.mode !== "exact" || !compareCanonical(rollback.target, expectedTarget)) {
        throw new Error("new current Portfolio manifest must bind the exact prior current manifest as its rollback target");
      }
    } else if (!predecessorCurrent && currentClosure.manifest.rollback.mode !== "none") {
      throw new Error("initial current Portfolio manifest cannot claim a prior rollback target");
    }
  } else {
    if (!predecessorCurrent) throw new Error("Portfolio rollback requires a predecessor current manifest");
    const outgoingClosure = verifyPortfolioManifest({
      storeRoot,
      manifestDigest: predecessorCurrent.manifest_digest,
      trustedAssetAuthorityContexts,
    });
    const expectedTarget = {
      portfolio_id: predecessor.portfolio_id,
      revision: current[0].revision,
      manifest_digest: current[0].manifest_digest,
      asset_set_digest: current[0].asset_set_digest,
    };
    if (!compareCanonical(context.rollback_target, expectedTarget)) throw new Error("Portfolio rollback authority target drift");
    if (outgoingClosure.manifest.rollback.mode !== "exact"
      || !compareCanonical(outgoingClosure.manifest.rollback.target, expectedTarget)) {
      throw new Error("current Portfolio manifest does not authorize reconstruction of the requested exact rollback target");
    }
  }
  return next;
}

function trustedPortfolioContextForDigest({ storeRoot, digest, trustedPortfolioAuthorityContexts }) {
  const stored = readContentAddressedJson({ storeRoot, digest }).value;
  validateAuthorityContext(stored);
  const trusted = trustedPortfolioAuthorityContexts.find((context) => {
    try {
      return canonicalDigest(context) === digest;
    } catch {
      return false;
    }
  });
  if (!trusted) throw new Error(`trusted Portfolio authority context is required for ${digest}; stored context is not a trust root`);
  validateAuthorityContext(trusted);
  if (!compareCanonical(stored, trusted)) throw new Error("trusted Portfolio authority context does not match the stored exact context");
  return cloneJson(trusted);
}

function verifyPortfolioLockInternal({
  storeRoot,
  lockDigest,
  trustedPortfolioAuthorityContexts,
  trustedAssetAuthorityContexts,
  trustedHighImpactApprovalGrants,
  stack = new Set(),
}) {
  assertDigest(lockDigest, "Portfolio lock digest");
  if (stack.has(lockDigest)) throw new Error("Portfolio lock predecessor cycle detected");
  stack.add(lockDigest);
  try {
    const lock = readContentAddressedJson({ storeRoot, digest: lockDigest }).value;
    validateLockShape(lock);
    const manifests = new Map();
    if (lock.predecessor === null) {
      if (lock.lock_revision !== 1
        || lock.entries.length !== 0
        || lock.authority_context_digest !== null) {
        throw new Error("initial Portfolio lock must be empty revision 1 without authority");
      }
    } else {
      const predecessor = verifyPortfolioLockInternal({
        storeRoot,
        lockDigest: lock.predecessor.lock_digest,
        trustedPortfolioAuthorityContexts,
        trustedAssetAuthorityContexts,
        trustedHighImpactApprovalGrants,
        stack,
      });
      if (lock.portfolio_id !== predecessor.lock.portfolio_id
        || lock.repository_id !== predecessor.lock.repository_id
        || lock.scope_id !== predecessor.lock.scope_id) {
        throw new Error("Portfolio lock predecessor identity transplant detected");
      }
      if (lock.predecessor.lock_revision !== predecessor.lock.lock_revision
        || lock.lock_revision !== predecessor.lock.lock_revision + 1) {
        throw new Error("Portfolio lock predecessor revision mismatch");
      }
      if (lock.authority_context_digest === null) throw new Error("non-initial Portfolio lock requires lifecycle authority");
      const context = trustedPortfolioContextForDigest({
        storeRoot,
        digest: lock.authority_context_digest,
        trustedPortfolioAuthorityContexts,
      });
      if (context.portfolio_id !== lock.portfolio_id
        || context.repository_id !== lock.repository_id
        || context.scope_id !== lock.scope_id) {
        throw new Error("wrong Portfolio authority Portfolio/repository/scope");
      }
      if (context.predecessor_lock_digest !== lock.predecessor.lock_digest) {
        throw new Error("stale Portfolio authority predecessor lock mismatch");
      }
      const expectedEntries = applyPortfolioTransitionsToEntries({
        storeRoot,
        predecessor: predecessor.lock,
        context,
        trustedAssetAuthorityContexts,
        trustedHighImpactApprovalGrants,
      });
      if (!compareCanonical(expectedEntries, lock.entries)) {
        throw new Error("Portfolio lock inventory does not match the complete authorized transition batch");
      }
    }
    for (const entry of lock.entries) {
      const closure = verifyPortfolioManifest({
        storeRoot,
        manifestDigest: entry.manifest_digest,
        trustedAssetAuthorityContexts,
      });
      if (closure.manifest.portfolio_id !== lock.portfolio_id
        || closure.manifest.repository_id !== lock.repository_id
        || closure.manifest.scope_id !== lock.scope_id
        || closure.manifest.revision !== entry.revision
        || closure.manifest.asset_set_digest !== entry.asset_set_digest) {
        throw new Error("Portfolio lock entry manifest identity transplant detected");
      }
      manifests.set(entry.manifest_digest, closure);
    }
    return { lock, lock_digest: lockDigest, manifests };
  } finally {
    stack.delete(lockDigest);
  }
}

export function verifyPortfolioLock({
  storeRoot,
  lockDigest,
  trustedPortfolioAuthorityContexts = [],
  trustedAssetAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  if (!Array.isArray(trustedPortfolioAuthorityContexts)
    || !Array.isArray(trustedAssetAuthorityContexts)
    || !Array.isArray(trustedHighImpactApprovalGrants)) {
    throw new Error("trusted Portfolio, Asset, and high-impact approval inputs must be arrays");
  }
  const verified = verifyPortfolioLockInternal({
    storeRoot,
    lockDigest,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  return deepFreeze({
    lock_digest: verified.lock_digest,
    lock: cloneJson(verified.lock),
    manifests: [...verified.manifests.values()].map((closure) => ({
      manifest_digest: closure.manifest_digest,
      manifest: cloneJson(closure.manifest),
      registry: cloneJson(closure.registry),
      bound_assets: cloneJson(closure.bound_assets),
    })),
  });
}

export function applyPortfolioTransitions({
  storeRoot,
  predecessorLockDigest,
  authorityContext,
  trustedPortfolioAuthorityContexts = [],
  trustedAssetAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  if (!authorityContext) throw new Error("Portfolio authority context is required");
  if (!Array.isArray(trustedHighImpactApprovalGrants)) throw new Error("trusted high-impact approval grants must be an array");
  const detachedContext = cloneJson(authorityContext);
  validateAuthorityContext(detachedContext);
  const predecessor = verifyPortfolioLockInternal({
    storeRoot,
    lockDigest: predecessorLockDigest,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  if (detachedContext.predecessor_lock_digest !== predecessorLockDigest) {
    throw new Error("stale Portfolio authority predecessor lock mismatch");
  }
  if (detachedContext.portfolio_id !== predecessor.lock.portfolio_id
    || detachedContext.repository_id !== predecessor.lock.repository_id
    || detachedContext.scope_id !== predecessor.lock.scope_id) {
    throw new Error("wrong Portfolio authority Portfolio/repository/scope");
  }
  const entries = applyPortfolioTransitionsToEntries({
    storeRoot,
    predecessor: predecessor.lock,
    context: detachedContext,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  const contextPublication = putContentAddressedJson({ storeRoot, artifact: detachedContext });
  const current = entries.find((entry) => entry.state === "current");
  const lock = {
    schema_version: SCHEMA_VERSION,
    object_kind: "portfolio_lock",
    portfolio_id: predecessor.lock.portfolio_id,
    repository_id: predecessor.lock.repository_id,
    scope_id: predecessor.lock.scope_id,
    lock_revision: predecessor.lock.lock_revision + 1,
    predecessor: {
      lock_revision: predecessor.lock.lock_revision,
      lock_digest: predecessorLockDigest,
    },
    entries,
    current_manifest_digest: current.manifest_digest,
    current_asset_set_digest: current.asset_set_digest,
    authority_context_digest: contextPublication.digest,
  };
  validateLockShape(lock);
  const publication = putContentAddressedJson({ storeRoot, artifact: lock });
  verifyPortfolioLock({
    storeRoot,
    lockDigest: publication.digest,
    trustedPortfolioAuthorityContexts: [...trustedPortfolioAuthorityContexts, detachedContext],
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  return deepFreeze({
    lock_digest: publication.digest,
    lock_revision: lock.lock_revision,
    current_manifest_digest: lock.current_manifest_digest,
    current_asset_set_digest: lock.current_asset_set_digest,
    authority_context_digest: contextPublication.digest,
    created: publication.created,
  });
}

export function resolveCurrentPortfolio({
  storeRoot,
  lockDigest,
  trustedPortfolioAuthorityContexts = [],
  trustedAssetAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  const verified = verifyPortfolioLockInternal({
    storeRoot,
    lockDigest,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  const current = verified.lock.entries.find((entry) => entry.state === "current");
  if (!current) throw new Error("Portfolio lock has no current manifest");
  const closure = verified.manifests.get(current.manifest_digest);
  return deepFreeze({
    lock_digest: lockDigest,
    lock_revision: verified.lock.lock_revision,
    manifest_digest: current.manifest_digest,
    manifest: cloneJson(closure.manifest),
    registry: cloneJson(closure.registry),
    bound_assets: cloneJson(closure.bound_assets),
  });
}

function scanProhibitedSelectionKeys(value, path = "$", seen = new Set()) {
  if (typeof value === "string") {
    if (path === "$.selection_phase" && value === "pre_result") return;
    const normalizedValue = value.replace(/[.:#@/+~-]+/gu, "_");
    if (PROHIBITED_SELECTION_KEY.test(normalizedValue)) {
      throw new Error(`Portfolio selector input contains prohibited result/evaluator value ${path}`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new Error("Portfolio selector input must be acyclic JSON");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanProhibitedSelectionKeys(entry, `${path}[${index}]`, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      if (PROHIBITED_SELECTION_KEY.test(key)) {
        throw new Error(`Portfolio selector input contains prohibited result/evaluator field ${path}.${key}`);
      }
      scanProhibitedSelectionKeys(entry, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function normalizeSelectionContextDraft(draft) {
  const context = cloneJson(draft);
  context.capabilities = sortedText(context.capabilities);
  context.operation_scopes = sortedText(context.operation_scopes);
  context.current_state_refs.sort((left, right) => compareText(left.state_id, right.state_id)
    || compareText(left.state_digest, right.state_digest));
  return context;
}

export function computePortfolioSelectionContextDigest(context) {
  const basis = cloneJson(context);
  delete basis.context_digest;
  return canonicalDigest(basis);
}

export function validatePortfolioSelectionContext(context) {
  scanProhibitedSelectionKeys(context);
  validateSchema(context, SCHEMAS.selectionContext, "Portfolio selection context");
  const normalized = normalizeSelectionContextDraft(context);
  if (!compareCanonical(normalized, context)) throw new Error("Portfolio selection context sets are not deterministically ordered");
  assertSortedUnique(context.capabilities, compareText, "Portfolio selection context capabilities");
  assertSortedUnique(context.operation_scopes, compareText, "Portfolio selection context operation scopes");
  assertSortedUnique(context.current_state_refs, (left, right) => compareText(left.state_id, right.state_id)
    || compareText(left.state_digest, right.state_digest), "Portfolio selection current-state references");
  const currentStateIds = new Set();
  for (const stateRef of context.current_state_refs) {
    if (currentStateIds.has(stateRef.state_id)) {
      throw new Error(`Portfolio selection context repeats current-state ID ${stateRef.state_id}`);
    }
    currentStateIds.add(stateRef.state_id);
  }
  for (const metric of BUDGET_METRICS) validateQuantity(context.available_budget[metric], `Portfolio available ${metric}`);
  if (context.context_digest !== computePortfolioSelectionContextDigest(context)) {
    throw new Error("Portfolio selection context digest mismatch");
  }
  return context;
}

export function buildPortfolioSelectionContext(draft) {
  scanProhibitedSelectionKeys(draft);
  const suppliedDigest = draft.context_digest;
  const context = normalizeSelectionContextDraft({
    ...cloneJson(draft),
    context_digest: draft.context_digest ?? "sha256:".padEnd(71, "0"),
  });
  context.context_digest = computePortfolioSelectionContextDigest(context);
  if (suppliedDigest !== undefined && suppliedDigest !== context.context_digest) {
    throw new Error("caller-supplied Portfolio selection context digest mismatch");
  }
  validatePortfolioSelectionContext(context);
  return deepFreeze(context);
}

function dimensionMatches(dimension, actual) {
  if (dimension.status === "unknown") return { matches: false, unknown: true };
  if (dimension.status === "unrestricted") return { matches: true, unknown: false };
  if (dimension.excluded.includes(actual)) return { matches: false, unknown: false };
  if (dimension.included.length > 0 && !dimension.included.includes(actual)) return { matches: false, unknown: false };
  return { matches: true, unknown: false };
}

function selectorsMatch(selector, context) {
  const mismatched = [];
  const unknown = [];
  for (const [dimensionName, contextField] of Object.entries(CONTEXT_SELECTOR_FIELDS)) {
    const outcome = dimensionMatches(selector[dimensionName], context[contextField]);
    if (!outcome.matches) mismatched.push(dimensionName);
    if (outcome.unknown) unknown.push(dimensionName);
  }
  const capabilitySelector = selector.capabilities;
  const actualCapabilities = new Set(context.capabilities);
  let missingCapabilities = [];
  if (capabilitySelector.status === "unknown") {
    unknown.push("capabilities");
    mismatched.push("capabilities");
  } else if (capabilitySelector.status === "bounded") {
    missingCapabilities = capabilitySelector.included.filter((capability) => !actualCapabilities.has(capability));
    const prohibited = capabilitySelector.excluded.filter((capability) => actualCapabilities.has(capability));
    if (missingCapabilities.length > 0 || prohibited.length > 0) mismatched.push("capabilities");
  }
  return {
    matches: mismatched.length === 0,
    mismatched: sortedText([...new Set(mismatched)]),
    unknown: sortedText([...new Set(unknown)]),
    missingCapabilities: sortedText(missingCapabilities),
  };
}

function validateSelectionContextAgainstManifest(context, manifest) {
  const allowlist = manifest.selection_context_allowlist;
  for (const [field, contextField] of Object.entries(CONTEXT_SELECTOR_FIELDS)) {
    if (!allowlist[field].includes(context[contextField])) {
      throw new Error(`Portfolio selection ${contextField} is not in the sealed pre-result allowlist`);
    }
  }
  for (const field of CONTEXT_ALLOWLIST_SET_FIELDS) {
    assertValuesAllowed(context[field], allowlist[field], `Portfolio selection ${field}`);
  }
}

function assetApplicability(asset, context) {
  const applicability = asset.record.applicability;
  const mapping = {
    task_classes: ["task_class", applicability.task_classes],
    projects: ["project_id", applicability.projects],
    models: ["model", applicability.models],
    adapters: ["adapter", applicability.adapters],
    stacks: ["stack", applicability.stacks],
    domains: ["domain", applicability.domains],
  };
  const mismatched = [];
  const unknown = [];
  for (const [dimensionName, [contextField, dimension]] of Object.entries(mapping)) {
    const outcome = dimensionMatches(dimension, context[contextField]);
    if (!outcome.matches) mismatched.push(dimensionName);
    if (outcome.unknown) unknown.push(dimensionName);
  }
  const actualCapabilities = new Set(context.capabilities);
  const missingCapabilities = applicability.required_capabilities.filter((capability) => !actualCapabilities.has(capability));
  if (missingCapabilities.length > 0) mismatched.push("capabilities");
  const actualScopes = new Set(context.operation_scopes);
  const missingScopes = applicability.included_scopes.filter((scope) => !actualScopes.has(scope));
  const excludedScopes = applicability.excluded_scopes.filter((scope) => actualScopes.has(scope));
  if (missingScopes.length > 0 || excludedScopes.length > 0) mismatched.push("operation_scopes");
  return {
    matches: mismatched.length === 0,
    mismatched: sortedText([...new Set(mismatched)]),
    unknown: sortedText([...new Set(unknown)]),
    missingCapabilities: sortedText(missingCapabilities),
  };
}

function selectorConflictMatches(conflict, context) {
  const result = selectorsMatch(conflict.selectors, context);
  return result.matches || result.unknown.length > 0;
}

function severityAction(left, right) {
  if (!left) return right;
  if (!right) return left;
  return ACTION_SEVERITY.get(right) > ACTION_SEVERITY.get(left) ? right : left;
}

function reasonCompare(left, right) {
  return (ACTION_SEVERITY.get(right.action) - ACTION_SEVERITY.get(left.action))
    || compareText(left.code, right.code)
    || compareText(left.entry_id ?? "", right.entry_id ?? "")
    || compareText(left.subject_digest ?? "", right.subject_digest ?? "");
}

function evidenceMaterialFamilyIdentity(reuseIdentity) {
  return {
    gate: cloneJson(reuseIdentity.gate),
    target: {
      repository_id: reuseIdentity.target.repository_id,
    },
    consumed_inputs: reuseIdentity.consumed_inputs.map(({ kind, path }) => ({ kind, path })),
    execution: {
      command: cloneJson(reuseIdentity.execution.command),
      runner: {
        runner_id: reuseIdentity.execution.runner.runner_id,
        adapter_id: reuseIdentity.execution.runner.adapter_id,
        evidence_level: reuseIdentity.execution.runner.evidence_level,
      },
      toolchain: reuseIdentity.execution.toolchain.map(({ name }) => ({ name })),
      environment: {
        os: reuseIdentity.execution.environment.os,
        architecture: reuseIdentity.execution.environment.architecture,
      },
    },
  };
}

function storedVerificationEvidence(storeRoot) {
  const evidenceRecords = [];
  for (const record of listContentAddressedJson({ storeRoot })) {
    if (record.value?.program !== "ask_verification_evidence") continue;
    evidenceRecords.push(sealVerificationEvidence(record.value));
  }
  return evidenceRecords;
}

function evidenceAuthorityAcceptedForGate(evidence, requiredGate) {
  return requiredGate.authority.accepted_producers.some((producer) => (
    producer.kind === evidence.producer.kind
    && producer.identity_digest === evidence.producer.identity_digest
  )) && requiredGate.authority.accepted_evidence_levels.includes(
    evidence.execution.runner.evidence_level,
  );
}

function hasAcceptedEvidenceInMaterialFamily(evidenceRecords, requiredGate) {
  const requiredFamilyDigest = canonicalDigest(
    evidenceMaterialFamilyIdentity(requiredGate.reuse_identity),
  );
  return evidenceRecords.some((evidence) => (
    canonicalDigest(evidenceMaterialFamilyIdentity(evidence)) === requiredFamilyDigest
    && evidenceAuthorityAcceptedForGate(evidence, requiredGate)
  ));
}

function classifyEvidenceDisposition(
  disposition,
  requiredGate,
  allowedDispositions,
  evidenceRecords,
) {
  if (allowedDispositions.includes(disposition.disposition)) return null;
  if (disposition.reason_code === "conflicting_exact_evidence") return "evidence_conflict";
  if (disposition.reason_code === "no_exact_evidence") {
    if (!requiredGate || requiredGate.gate_id !== disposition.gate_id) {
      throw new Error(`${disposition.gate_id} disposition has no matching material requirement`);
    }
    return hasAcceptedEvidenceInMaterialFamily(evidenceRecords, requiredGate)
      ? "evidence_stale"
      : "evidence_missing";
  }
  if (disposition.reason_code === "exact_evidence_not_passing") return "evidence_not_passing";
  if (disposition.reason_code === "exact_evidence_authority_mismatch") return "evidence_authority_mismatch";
  if (disposition.reason_code === "exact_evidence_coverage_mismatch") return "evidence_coverage_mismatch";
  if (disposition.reason_code === "execution_unavailable") return "evidence_missing";
  if (disposition.disposition === "independent_judgment_required") return "evidence_coverage_mismatch";
  return "evidence_missing";
}

function evidenceActionForCode(entry, code) {
  if (code === "evidence_conflict") return entry.failure_actions.evidence_conflict;
  if (code === "evidence_stale") return entry.failure_actions.evidence_stale;
  return entry.failure_actions.evidence_missing;
}

function quantitySum(entries, metric) {
  if (entries.some((entry) => entry.cost_estimate[metric].status === "unknown")) return { status: "unknown", value: null };
  return {
    status: "known",
    value: entries.reduce((sum, entry) => sum + entry.cost_estimate[metric].value, 0),
  };
}

function budgetDisposition(entries, metric, context, manifest) {
  const estimated = quantitySum(entries, metric);
  const available = cloneJson(context.available_budget[metric]);
  const policyLimit = cloneJson(manifest.budgets.policy_limits[metric]);
  let status = "within";
  if (estimated.status === "unknown" || available.status === "unknown") status = "unknown";
  else if (estimated.value > available.value
    || (policyLimit.status === "bounded" && estimated.value > policyLimit.maximum)) status = "exceeded";
  return { estimated, available, policy_limit: policyLimit, status };
}

function computeBudget(entries, context, manifest) {
  return Object.fromEntries(BUDGET_METRICS.map((metric) => [
    metric,
    budgetDisposition(entries, metric, context, manifest),
  ]));
}

function selectedAssetFromEntry(entry) {
  return {
    entry_id: entry.entry_id,
    role: entry.role,
    assurance_lane: entry.assurance_lane,
    asset: cloneJson(entry.asset),
    exposure: cloneJson(entry.exposure),
  };
}

function selectedAssetCompare(left, right) {
  return assetRefCompare(left.asset, right.asset)
    || compareText(left.role, right.role)
    || compareText(left.entry_id, right.entry_id);
}

function omissionCompare(left, right) {
  return compareText(left.entry_id, right.entry_id) || assetRefCompare(left.asset, right.asset);
}

function evidencePlanCompare(left, right) {
  return compareText(left.requirement_id, right.requirement_id);
}

function capabilityDowngradeCompare(left, right) {
  return compareText(left.entry_id, right.entry_id);
}

export function computePortfolioSelectionDigest(selection) {
  const basis = cloneJson(selection);
  delete basis.selection_digest;
  return canonicalDigest(basis);
}

export function validatePortfolioSelection(selection) {
  validateSchema(selection, SCHEMAS.selection, "Portfolio selection");
  assertSortedUnique(selection.selected_assets, selectedAssetCompare, "Portfolio selected Assets");
  assertSortedUnique(selection.omitted_assets, omissionCompare, "Portfolio omitted Assets");
  assertSortedUnique(selection.reasons, reasonCompare, "Portfolio selection reasons");
  assertSortedUnique(selection.evidence_plans, evidencePlanCompare, "Portfolio evidence plans");
  assertSortedUnique(selection.capability_downgrades, capabilityDowngradeCompare, "Portfolio capability downgrades");
  const selectedEntryIds = new Set();
  for (const selected of selection.selected_assets) {
    if (selectedEntryIds.has(selected.entry_id)) throw new Error(`Portfolio selection repeats selected entry ${selected.entry_id}`);
    selectedEntryIds.add(selected.entry_id);
  }
  const omittedEntryIds = new Set();
  for (const omitted of selection.omitted_assets) {
    if (omittedEntryIds.has(omitted.entry_id)) throw new Error(`Portfolio selection repeats omitted entry ${omitted.entry_id}`);
    if (selectedEntryIds.has(omitted.entry_id)) throw new Error(`Portfolio entry ${omitted.entry_id} cannot be both selected and omitted`);
    omittedEntryIds.add(omitted.entry_id);
    assertSortedUnique(omitted.reason_codes, compareText, `Portfolio omitted entry ${omitted.entry_id} reason codes`);
    if (omitted.reason_codes.length === 0) throw new Error(`Portfolio omitted entry ${omitted.entry_id} requires a typed reason code`);
  }
  for (const downgrade of selection.capability_downgrades) {
    assertSortedUnique(downgrade.missing_capabilities, compareText, `Portfolio entry ${downgrade.entry_id} missing capabilities`);
  }
  if (["bypass", "stop"].includes(selection.decision) && selection.selected_assets.length !== 0) {
    throw new Error(`${selection.decision} Portfolio selection cannot expose selected Assets`);
  }
  if (selection.decision === "selected" && selection.reasons.length !== 0) {
    throw new Error("selected Portfolio decision cannot carry failure reasons");
  }
  if (selection.selection_digest !== computePortfolioSelectionDigest(selection)) {
    throw new Error("Portfolio selection digest mismatch");
  }
  return selection;
}

function normalizeSelection(selection) {
  selection.selected_assets.sort(selectedAssetCompare);
  for (const omitted of selection.omitted_assets) omitted.reason_codes = sortedText(omitted.reason_codes);
  selection.omitted_assets.sort(omissionCompare);
  selection.reasons.sort(reasonCompare);
  selection.evidence_plans.sort(evidencePlanCompare);
  for (const downgrade of selection.capability_downgrades) downgrade.missing_capabilities = sortedText(downgrade.missing_capabilities);
  selection.capability_downgrades.sort(capabilityDowngradeCompare);
  return selection;
}

export function resolvePortfolioSelection({
  storeRoot,
  lockDigest,
  selectorContext,
  trustedPortfolioAuthorityContexts = [],
  trustedAssetAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  const context = buildPortfolioSelectionContext(selectorContext);
  if (context.portfolio_lock_digest !== lockDigest) throw new Error("Portfolio selection context lock binding mismatch");
  const verified = verifyPortfolioLockInternal({
    storeRoot,
    lockDigest,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  if (verified.lock.repository_id !== context.repository_id) throw new Error("Portfolio selection context repository transplant rejected");
  const current = verified.lock.entries.find((entry) => entry.state === "current");
  if (!current) throw new Error("Portfolio selection requires a current manifest");
  const closure = verified.manifests.get(current.manifest_digest);
  const manifest = closure.manifest;
  validateSelectionContextAgainstManifest(context, manifest);
  const assetsByEntry = new Map(closure.bound_assets.map((binding) => [binding.entry_id, binding.asset]));
  const reasons = [];
  const entryReasonMap = new Map(manifest.entries.map((entry) => [entry.entry_id, []]));
  const capabilityDowngrades = [];
  const evidencePlans = [];
  const addReason = ({ action, code, entryId = null, subjectDigest = null }) => {
    const reason = { action, code, entry_id: entryId, subject_digest: subjectDigest };
    const key = stableCanonicalJson(reason);
    if (!reasons.some((entry) => stableCanonicalJson(entry) === key)) reasons.push(reason);
    if (entryId !== null) {
      const values = entryReasonMap.get(entryId);
      if (values && !values.some((entry) => stableCanonicalJson(entry) === key)) values.push(reason);
    }
  };

  const portfolioSelector = selectorsMatch(manifest.selectors, context);
  if (!portfolioSelector.matches) {
    const action = manifest.selection_policy.portfolio_inapplicable_action;
    addReason({
      action,
      code: "portfolio_inapplicable",
      subjectDigest: manifest.selection_basis_digest,
    });
    for (const entry of manifest.entries) {
      addReason({
        action,
        code: "portfolio_inapplicable",
        entryId: entry.entry_id,
        subjectDigest: entry.asset.record_digest,
      });
    }
  }
  for (const conflict of manifest.unresolved_conflicts) {
    if (selectorConflictMatches(conflict, context)) {
      const subjectDigest = canonicalDigest(conflict);
      addReason({
        action: manifest.selection_policy.selector_conflict_action,
        code: "selector_conflict",
        subjectDigest,
      });
      for (const entry of manifest.entries) {
        addReason({
          action: manifest.selection_policy.selector_conflict_action,
          code: "selector_conflict",
          entryId: entry.entry_id,
          subjectDigest,
        });
      }
    }
  }

  for (const entry of manifest.entries) {
    const entrySelector = selectorsMatch(entry.selectors, context);
    if (!entrySelector.matches) {
      const capabilityOnly = entrySelector.mismatched.length === 1 && entrySelector.mismatched[0] === "capabilities";
      const code = capabilityOnly ? "capability_missing" : "asset_inapplicable";
      const action = capabilityOnly ? entry.failure_actions.capability_missing : entry.failure_actions.inapplicable;
      addReason({ action, code, entryId: entry.entry_id, subjectDigest: entry.asset.record_digest });
      if (entrySelector.missingCapabilities.length > 0) {
        capabilityDowngrades.push({
          entry_id: entry.entry_id,
          missing_capabilities: entrySelector.missingCapabilities,
          action,
        });
      }
    }
    const asset = assetsByEntry.get(entry.entry_id);
    const applicability = assetApplicability(asset, context);
    if (!applicability.matches) {
      const capabilityOnly = applicability.mismatched.length === 1 && applicability.mismatched[0] === "capabilities";
      const code = capabilityOnly ? "capability_missing" : "asset_inapplicable";
      const action = capabilityOnly ? entry.failure_actions.capability_missing : entry.failure_actions.inapplicable;
      addReason({ action, code, entryId: entry.entry_id, subjectDigest: asset.record_digest });
      if (applicability.missingCapabilities.length > 0
        && !capabilityDowngrades.some((candidate) => candidate.entry_id === entry.entry_id)) {
        capabilityDowngrades.push({
          entry_id: entry.entry_id,
          missing_capabilities: applicability.missingCapabilities,
          action,
        });
      }
    }
    if (entry.prohibited_task_classes.includes(context.task_class)) {
      addReason({
        action: entry.failure_actions.prohibited_task,
        code: "prohibited_task_class",
        entryId: entry.entry_id,
        subjectDigest: entry.asset.record_digest,
      });
    }
    const safetyUnknown = asset.record.safety.status === "not_evaluated"
      || ["not_evaluated", "declared_by_consumer"].includes(asset.record.permissions_and_effects.status)
      || asset.record.maintenance.stale_status !== "fresh";
    if (safetyUnknown) {
      addReason({
        action: severityAction(entry.failure_actions.safety_unknown, manifest.safety_guardrails.unknown_safety_action),
        code: "safety_unknown",
        entryId: entry.entry_id,
        subjectDigest: entry.asset.record_digest,
      });
    }
    const prohibitedEffect = asset.record.permissions_and_effects.possible_effects
      .find((effect) => manifest.safety_guardrails.prohibited_effects.includes(effect));
    if (prohibitedEffect) {
      addReason({
        action: "stop",
        code: "prohibited_effect",
        entryId: entry.entry_id,
        subjectDigest: entry.asset.record_digest,
      });
    }
  }

  const evidenceRecords = storedVerificationEvidence(storeRoot);
  for (const requirement of manifest.evidence_requirements) {
    const plan = planExactReuse({ storeRoot, requirements: requirement.requirements });
    validateVerificationReusePlan(plan, {
      requirements: requirement.requirements,
      storeRoot,
    });
    evidencePlans.push({ requirement_id: requirement.requirement_id, plan: cloneJson(plan) });
    const contextStateById = new Map(context.current_state_refs.map((stateRef) => [stateRef.state_id, stateRef.state_digest]));
    const currentStateStale = requirement.required_current_state_refs.some((stateRef) => (
      contextStateById.get(stateRef.state_id) !== stateRef.state_digest
    ));
    const contextStale = requirement.requirements.target.repository_id !== context.repository_id
      || requirement.requirements.target.target_revision !== context.source_revision
      || requirement.requirements.target.tree_digest !== context.tree_digest
      || currentStateStale;
    if (contextStale) {
      for (const entryId of requirement.entry_ids) {
        const entry = manifest.entries.find((candidate) => candidate.entry_id === entryId);
        addReason({
          action: entry.failure_actions.evidence_stale,
          code: "evidence_stale",
          entryId,
          subjectDigest: requirement.requirements.requirements_digest,
        });
      }
      continue;
    }
    const requiredGateById = new Map(
      requirement.requirements.required_gates.map((gate) => [gate.gate_id, gate]),
    );
    const failures = plan.dispositions
      .map((disposition) => classifyEvidenceDisposition(
        disposition,
        requiredGateById.get(disposition.gate_id),
        requirement.allowed_dispositions,
        evidenceRecords,
      ))
      .filter(Boolean);
    for (const code of sortedText([...new Set(failures)])) {
      for (const entryId of requirement.entry_ids) {
        const entry = manifest.entries.find((candidate) => candidate.entry_id === entryId);
        addReason({
          action: evidenceActionForCode(entry, code),
          code,
          entryId,
          subjectDigest: requirement.requirements.requirements_digest,
        });
      }
    }
  }

  const entryBlocked = (entry) => (entryReasonMap.get(entry.entry_id) ?? []).length > 0;
  let eligibleEntries = manifest.entries.filter((entry) => !entryBlocked(entry));
  let budget = computeBudget(eligibleEntries, context, manifest);
  const unknownBudget = Object.values(budget).some((entry) => entry.status === "unknown");
  const exceededBudget = Object.values(budget).some((entry) => entry.status === "exceeded");
  if (unknownBudget || exceededBudget) {
    const budgetFailures = [
      ...(unknownBudget ? [{ action: manifest.budgets.unknown_value_action, code: "budget_unknown" }] : []),
      ...(exceededBudget ? [{ action: manifest.budgets.exceeded_action, code: "budget_exceeded" }] : []),
    ];
    let action = null;
    for (const failure of budgetFailures) {
      action = severityAction(action, failure.action);
      addReason({ ...failure, subjectDigest: manifest.selection_basis_digest });
    }
    const toOmit = action === "bypass"
      ? eligibleEntries
      : action === "downgrade"
        ? eligibleEntries.filter((entry) => entry.role !== "baseline")
        : eligibleEntries;
    for (const entry of toOmit) {
      for (const failure of budgetFailures) {
        addReason({ ...failure, entryId: entry.entry_id, subjectDigest: entry.asset.record_digest });
      }
    }
    eligibleEntries = eligibleEntries.filter((entry) => !toOmit.includes(entry));
    budget = computeBudget(eligibleEntries, context, manifest);
    const remainingInvalid = Object.values(budget).some((entry) => entry.status !== "within");
    if (remainingInvalid && eligibleEntries.length > 0) {
      for (const failure of budgetFailures) {
        addReason({ action: "stop", code: failure.code, subjectDigest: manifest.selection_basis_digest });
      }
      for (const entry of eligibleEntries) {
        for (const failure of budgetFailures) {
          addReason({ action: "stop", code: failure.code, entryId: entry.entry_id, subjectDigest: entry.asset.record_digest });
        }
      }
      eligibleEntries = [];
    }
  }

  if (manifest.entries.length > 0 && eligibleEntries.length === 0) {
    addReason({
      action: manifest.selection_policy.empty_selection_action,
      code: "empty_selection",
      subjectDigest: manifest.asset_set_digest,
    });
  }
  let decision = null;
  for (const reason of reasons) decision = severityAction(decision, reason.action);
  if (decision === null) decision = "selected";
  if (["bypass", "stop"].includes(decision)) eligibleEntries = [];

  const contextPublication = putContentAddressedJson({ storeRoot, artifact: context });

  const selectedIds = new Set(eligibleEntries.map((entry) => entry.entry_id));
  const decisionReasonCodes = sortedText([...new Set(reasons
    .filter((reason) => reason.action === decision)
    .map((reason) => reason.code))]);
  const omittedAssets = manifest.entries
    .filter((entry) => !selectedIds.has(entry.entry_id))
    .map((entry) => {
      const entryReasons = entryReasonMap.get(entry.entry_id) ?? [];
      let action = null;
      for (const reason of entryReasons) action = severityAction(action, reason.action);
      if (action === null) action = decision === "stop" ? "stop" : "bypass";
      return {
        entry_id: entry.entry_id,
        asset: cloneJson(entry.asset),
        action,
        reason_codes: sortedText([...new Set([
          ...entryReasons.map((reason) => reason.code),
          ...(entryReasons.length === 0 ? decisionReasonCodes : []),
        ])]),
      };
    });
  const selection = normalizeSelection({
    schema_version: SCHEMA_VERSION,
    object_kind: "portfolio_selection",
    selection_phase: "pre_result",
    portfolio_lock: {
      lock_revision: verified.lock.lock_revision,
      lock_digest: lockDigest,
    },
    manifest: portfolioRefFromManifest(manifest, current.manifest_digest),
    registry: {
      registry_id: manifest.registry.registry_id,
      snapshot_revision: manifest.registry.snapshot_revision,
      snapshot_digest: manifest.registry.snapshot_digest,
    },
    context_object_digest: contextPublication.digest,
    context_digest: context.context_digest,
    decision,
    selected_assets: eligibleEntries.map(selectedAssetFromEntry),
    omitted_assets: omittedAssets,
    reasons,
    evidence_plans: evidencePlans,
    capability_downgrades: capabilityDowngrades,
    budget,
    rollback_target: cloneJson(manifest.rollback.target),
    selection_digest: "",
  });
  selection.selection_digest = computePortfolioSelectionDigest(selection);
  validatePortfolioSelection(selection);
  const publication = putContentAddressedJson({ storeRoot, artifact: selection });
  return deepFreeze({
    selection_object_digest: publication.digest,
    selection: cloneJson(selection),
    created: publication.created,
  });
}

export function verifyPortfolioSelection({
  storeRoot,
  selectionObjectDigest,
  selectorContext = null,
  trustedPortfolioAuthorityContexts = [],
  trustedAssetAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  assertDigest(selectionObjectDigest, "Portfolio selection object digest");
  const stored = readContentAddressedJson({ storeRoot, digest: selectionObjectDigest }).value;
  validatePortfolioSelection(stored);
  const storedContext = readContentAddressedJson({
    storeRoot,
    digest: stored.context_object_digest,
  }).value;
  validatePortfolioSelectionContext(storedContext);
  if (storedContext.context_digest !== stored.context_digest) {
    throw new Error("Portfolio selection context object binding mismatch");
  }
  const effectiveContext = selectorContext === null ? storedContext : selectorContext;
  if (selectorContext !== null && !compareCanonical(buildPortfolioSelectionContext(selectorContext), storedContext)) {
    throw new Error("supplied Portfolio selection context differs from the stored exact context");
  }
  const expected = resolvePortfolioSelection({
    storeRoot,
    lockDigest: stored.portfolio_lock.lock_digest,
    selectorContext: effectiveContext,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  if (!compareCanonical(stored, expected.selection)) throw new Error("Portfolio selection does not match deterministic reconstruction from exact inputs");
  return deepFreeze({
    selection_object_digest: selectionObjectDigest,
    selection: cloneJson(stored),
  });
}

export function exportPortfolioReference({
  storeRoot,
  lockDigest,
  selectionObjectDigests = [],
  trustedPortfolioAuthorityContexts = [],
  trustedAssetAuthorityContexts = [],
  trustedHighImpactApprovalGrants = [],
}) {
  const verified = verifyPortfolioLockInternal({
    storeRoot,
    lockDigest,
    trustedPortfolioAuthorityContexts,
    trustedAssetAuthorityContexts,
    trustedHighImpactApprovalGrants,
  });
  const current = verified.lock.entries.find((entry) => entry.state === "current") ?? null;
  const requiredAuthorityContextDigests = [];
  const requiredHighImpactGrantDigests = [];
  let cursorDigest = lockDigest;
  while (cursorDigest !== null) {
    const cursor = readContentAddressedJson({ storeRoot, digest: cursorDigest }).value;
    validateLockShape(cursor);
    if (cursor.authority_context_digest !== null) {
      requiredAuthorityContextDigests.push(cursor.authority_context_digest);
      const authorityContext = readContentAddressedJson({
        storeRoot,
        digest: cursor.authority_context_digest,
      }).value;
      validateAuthorityContext(authorityContext);
      for (const grant of authorityContext.grants) requiredHighImpactGrantDigests.push(canonicalDigest(grant));
    }
    cursorDigest = cursor.predecessor?.lock_digest ?? null;
  }
  const sortedSelectionDigests = sortedText(selectionObjectDigests);
  assertSortedUnique(sortedSelectionDigests, compareText, "Portfolio exported selection object digests");
  const selections = sortedSelectionDigests.map((selectionObjectDigest) => {
    assertDigest(selectionObjectDigest, "Portfolio exported selection object digest");
    const selection = verifyPortfolioSelection({
      storeRoot,
      selectionObjectDigest,
      trustedPortfolioAuthorityContexts,
      trustedAssetAuthorityContexts,
      trustedHighImpactApprovalGrants,
    }).selection;
    if (selection.portfolio_lock.lock_digest !== lockDigest) throw new Error("exported Portfolio selection uses another lock");
    return {
      selection_object_digest: selectionObjectDigest,
      selection_digest: selection.selection_digest,
      context_object_digest: selection.context_object_digest,
      context_digest: selection.context_digest,
      decision: selection.decision,
    };
  });
  return deepFreeze({
    schema_version: SCHEMA_VERSION,
    program: "ask_portfolio_reference",
    portfolio_id: verified.lock.portfolio_id,
    repository_id: verified.lock.repository_id,
    scope_id: verified.lock.scope_id,
    lock_revision: verified.lock.lock_revision,
    lock_digest: lockDigest,
    required_portfolio_authority_context_digests: sortedText(requiredAuthorityContextDigests),
    required_high_impact_approval_grant_digests: sortedText([...new Set(requiredHighImpactGrantDigests)]),
    current_manifest: current === null ? null : {
      revision: current.revision,
      manifest_digest: current.manifest_digest,
      asset_set_digest: current.asset_set_digest,
    },
    selections,
    mutable_latest_pointer_used: false,
    runtime_activation_implied: false,
    execution_implied: false,
    effectiveness_implied: false,
  });
}
