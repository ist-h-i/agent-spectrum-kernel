import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES,
  assertNoSymlinkPathSegments,
  canonicalDigest,
  putContentAddressedJson,
  readContentAddressedJson,
  readStableBytes,
  stableCanonicalJson,
} from "./content-addressed-store.mjs";
import { validateJsonSchema } from "./execution-envelope.mjs";

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = "1.0.0";
const ASSET_TYPES = new Set(["skill", "prompt", "evaluator_reference"]);
const LIFECYCLE_STATES = new Set(["candidate", "admitted", "current", "historical", "superseded", "retired"]);
const AUTHORITY_KINDS = new Set(["external_asset_lifecycle_authority", "external_asset_rollback_authority"]);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PORTABLE_PATH_PATTERN = /^(?!(?:.*\/)?\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const DESCRIPTOR_KEYS = new Set([
  "schema_version", "asset_type", "stable_id", "version", "version_scheme", "type_extension",
  "content", "source", "provenance", "derivation", "dependencies", "compatibility", "applicability",
  "permissions_and_effects", "safety", "mechanism_and_evidence", "evaluation_history", "maintenance",
]);

const schemaPath = (name) => {
  const colocated = resolve(RUNTIME_ROOT, name);
  return existsSync(colocated) ? colocated : resolve(RUNTIME_ROOT, "../schemas", name);
};

const SCHEMAS = {
  content: schemaPath("asset-content.schema.json"),
  record: schemaPath("asset-record.schema.json"),
  authority: schemaPath("asset-lifecycle-authority-context.schema.json"),
  snapshot: schemaPath("asset-registry-snapshot.schema.json"),
};

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function cloneJson(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function assertAllowedKeys(value, allowed, label) {
  assertObject(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} has unknown property ${key}`);
  }
}

function assertDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) throw new Error(`${label} must be a sha256 digest`);
}

function validateSchema(value, path, label) {
  const errors = validateJsonSchema(value, { schemaPath: path });
  if (errors.length > 0) throw new Error(`${label} failed closed schema validation: ${errors.join("; ")}`);
}

function compareCanonical(left, right) {
  return stableCanonicalJson(left) === stableCanonicalJson(right);
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function exactRefFromEntry(entry) {
  return {
    asset_type: entry.asset_type,
    stable_id: entry.stable_id,
    version: entry.version,
    record_digest: entry.record_digest,
    content_digest: entry.content_digest,
  };
}

function refKey(ref) {
  return `${ref.stable_id}\u0000${ref.version}`;
}

function entryCompare(left, right) {
  return compareText(left.stable_id, right.stable_id)
    || compareText(left.version, right.version)
    || compareText(left.record_digest, right.record_digest);
}

function refCompare(left, right) {
  return compareText(left.stable_id, right.stable_id)
    || compareText(left.version, right.version)
    || compareText(left.record_digest, right.record_digest)
    || compareText(left.content_digest, right.content_digest);
}

function transitionCompare(left, right) {
  return refCompare(left.asset, right.asset)
    || compareText(left.from_state, right.from_state)
    || compareText(left.to_state, right.to_state);
}

function unorderedRecordTextSets(record) {
  return [
    [record.compatibility.asset_contract_versions, "Asset contract-version set"],
    [record.compatibility.runtime_profiles, "Asset runtime-profile set"],
    ...["models", "adapters", "stacks", "domains", "projects", "task_classes"].flatMap((dimensionName) => [
      [record.applicability[dimensionName].included, `Asset applicability ${dimensionName} included set`],
      [record.applicability[dimensionName].excluded, `Asset applicability ${dimensionName} excluded set`],
    ]),
    [record.applicability.included_scopes, "Asset included-scope set"],
    [record.applicability.excluded_scopes, "Asset excluded-scope set"],
    [record.applicability.required_capabilities, "Asset required-capability set"],
    [record.permissions_and_effects.requested_permissions, "Asset requested-permission set"],
    [record.permissions_and_effects.possible_effects, "Asset possible-effect set"],
    [record.permissions_and_effects.permission_refs, "Asset permission-reference set"],
    [record.permissions_and_effects.effect_refs, "Asset effect-reference set"],
    [record.safety.classifications, "Asset safety-classification set"],
    [record.safety.constraint_refs, "Asset safety-constraint-reference set"],
    [record.mechanism_and_evidence.mechanism_refs, "Asset mechanism-reference set"],
    [record.mechanism_and_evidence.evidence_refs, "Asset mechanism-evidence-reference set"],
    [record.evaluation_history.evidence_refs, "Asset evaluation-evidence-reference set"],
    [record.maintenance.refresh_conditions, "Asset refresh-condition set"],
    [record.maintenance.regression_refs, "Asset regression-reference set"],
  ];
}

function normalizeRecordTextSets(record) {
  for (const [values] of unorderedRecordTextSets(record)) values.sort(compareText);
}

function assertSortedUnique(values, compare, label) {
  for (let index = 1; index < values.length; index += 1) {
    const order = compare(values[index - 1], values[index]);
    if (order === 0) throw new Error(`${label} contains a duplicate entry`);
    if (order > 0) throw new Error(`${label} is not deterministically ordered`);
  }
}

function normalizeSourcePath(path) {
  if (typeof path !== "string" || isAbsolute(path) || path.includes("\\") || !PORTABLE_PATH_PATTERN.test(path)) {
    throw new Error("source path traversal or escape is not allowed");
  }
  return path;
}

function sourceFilePath(sourceRoot, portablePath) {
  const suppliedRoot = resolve(sourceRoot);
  const suppliedRootStatus = lstatSync(suppliedRoot);
  if (suppliedRootStatus.isSymbolicLink()) throw new Error("Asset source root must not be a symlink");
  if (!suppliedRootStatus.isDirectory()) throw new Error("Asset source root must be a directory");
  const root = realpathSync(suppliedRoot);
  assertNoSymlinkPathSegments(root, "Asset source root");
  const target = resolve(root, ...portablePath.split("/"));
  const fromRoot = relative(root, target);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error("source path is outside source root");
  }
  assertNoSymlinkPathSegments(target, "Asset source file");
  return target;
}

function allowedTypeExtensionKinds(assetType) {
  if (assetType === "skill") return new Set(["skill"]);
  if (assetType === "prompt") return new Set(["prompt_template", "rendered_prompt_bundle"]);
  if (assetType === "evaluator_reference") return new Set(["public_evaluator_reference"]);
  throw new Error("unsupported Asset type extension mapping");
}

function validateTypeExtension(assetType, extension, inventory) {
  if (!allowedTypeExtensionKinds(assetType).has(extension?.kind)) throw new Error("Asset type extension does not match asset_type");
  if (extension.kind === "rendered_prompt_bundle") {
    assertSortedUnique(extension.entrypoints, compareText, "rendered Prompt bundle entrypoint inventory");
    const projectedInventory = inventory.map(({ path, raw_digest }) => ({ path, raw_digest }));
    if (!compareCanonical(extension.entrypoints, projectedInventory.map(({ path }) => path))) {
      throw new Error("rendered Prompt bundle entrypoints must exactly match the complete content inventory");
    }
    if (extension.renderer.projection_digest !== canonicalDigest(projectedInventory)) {
      throw new Error("rendered Prompt bundle projection digest does not match the exact content inventory");
    }
    if (extension.runtime_application_implied !== false) {
      throw new Error("rendered Prompt bundle registration cannot imply runtime application or activation");
    }
    return;
  }
  if (!inventory.some((file) => file.path === extension.entrypoint)) throw new Error("Asset type extension entrypoint is missing from the content inventory");
  if (assetType === "evaluator_reference") {
    if (extension.private_evaluator_content_included !== false) throw new Error("private evaluator content is not permitted in an evaluator-reference Asset");
    return;
  }
  if (assetType === "prompt" && extension.rendered_runtime_content !== false) throw new Error("prompt template registration cannot claim rendered runtime content");
}

function buildContentPackage({ sourceRoot, descriptor }) {
  assertObject(descriptor.content, "Asset descriptor content");
  assertAllowedKeys(descriptor.content, new Set(["package_format", "files"]), "Asset descriptor content");
  if (descriptor.content.package_format !== "canonical_json_base64_files") throw new Error("Asset content package format is unsupported");
  if (!Array.isArray(descriptor.content.files) || descriptor.content.files.length === 0) throw new Error("Asset content inventory must not be empty");
  const files = descriptor.content.files.map((declared, index) => {
    assertAllowedKeys(declared, new Set(["path", "media_type", "raw_digest"]), `Asset content file ${index}`);
    const path = normalizeSourcePath(declared.path);
    assertDigest(declared.raw_digest, `Asset content file ${path} raw digest`);
    const bytes = readStableBytes(sourceFilePath(sourceRoot, path), `Asset source file ${path}`, DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES);
    const actualDigest = rawDigest(bytes);
    if (actualDigest !== declared.raw_digest) throw new Error(`source content digest mismatch for ${path}; source content drift detected`);
    return {
      path,
      media_type: declared.media_type,
      encoding: "base64",
      byte_length: bytes.length,
      raw_digest: actualDigest,
      bytes_base64: bytes.toString("base64"),
    };
  }).sort((left, right) => compareText(left.path, right.path));
  assertSortedUnique(files, (left, right) => compareText(left.path, right.path), "Asset content inventory");
  const content = {
    schema_version: SCHEMA_VERSION,
    object_kind: "asset_content_package",
    asset_type: descriptor.asset_type,
    package_format: descriptor.content.package_format,
    files,
    type_extension: cloneJson(descriptor.type_extension),
  };
  validateSchema(content, SCHEMAS.content, "Asset content package");
  validateContentSemantics(content);
  return content;
}

function validateContentSemantics(content) {
  validateSchema(content, SCHEMAS.content, "Asset content package");
  assertSortedUnique(content.files, (left, right) => compareText(left.path, right.path), "Asset content inventory");
  for (const file of content.files) {
    const bytes = Buffer.from(file.bytes_base64, "base64");
    if (bytes.toString("base64") !== file.bytes_base64) throw new Error(`Asset content ${file.path} has non-canonical base64 bytes`);
    if (bytes.length !== file.byte_length) throw new Error(`Asset content ${file.path} byte length mismatch`);
    if (rawDigest(bytes) !== file.raw_digest) throw new Error(`Asset content ${file.path} raw digest mismatch`);
  }
  validateTypeExtension(content.asset_type, content.type_extension, content.files);
}

function validateDescriptor(descriptor) {
  if (descriptor?.program === "ask_verification_evidence" || String(descriptor?.schema_path ?? "").includes("verification-evidence")) {
    throw new Error("verification evidence object is not an Asset registration input");
  }
  assertAllowedKeys(descriptor, DESCRIPTOR_KEYS, "Asset descriptor");
  if (descriptor.schema_version !== SCHEMA_VERSION) throw new Error("Asset descriptor schema version is unsupported");
  if (!ASSET_TYPES.has(descriptor.asset_type)) throw new Error("Asset descriptor asset_type is unsupported");
  if (typeof descriptor.stable_id !== "string" || descriptor.stable_id.length === 0) throw new Error("Asset descriptor stable_id is required");
  if (typeof descriptor.version !== "string" || descriptor.version.length === 0) throw new Error("Asset descriptor version is required");
  if (!Array.isArray(descriptor.dependencies)) throw new Error("Asset descriptor dependencies must be an array");
  if (descriptor.version_scheme === "git_revision") {
    if (descriptor.version !== `git:${descriptor.source?.revision ?? ""}`) throw new Error("git revision Asset version must bind the exact source revision");
  } else if (descriptor.version_scheme !== "semantic") {
    throw new Error("Asset descriptor version_scheme is unsupported");
  }
}

function buildRecord(descriptor, contentDigest, content) {
  const record = {
    schema_version: SCHEMA_VERSION,
    object_kind: "asset_record",
    asset_type: descriptor.asset_type,
    stable_id: descriptor.stable_id,
    version: descriptor.version,
    version_scheme: descriptor.version_scheme,
    content: {
      package_format: content.package_format,
      content_digest: contentDigest,
      files: content.files.map(({ path, raw_digest }) => ({ path, raw_digest })),
    },
    source: cloneJson(descriptor.source),
    provenance: cloneJson(descriptor.provenance),
    derivation: cloneJson(descriptor.derivation),
    dependencies: cloneJson(descriptor.dependencies).sort(refCompare),
    compatibility: cloneJson(descriptor.compatibility),
    applicability: cloneJson(descriptor.applicability),
    permissions_and_effects: cloneJson(descriptor.permissions_and_effects),
    safety: cloneJson(descriptor.safety),
    mechanism_and_evidence: cloneJson(descriptor.mechanism_and_evidence),
    evaluation_history: cloneJson(descriptor.evaluation_history),
    maintenance: cloneJson(descriptor.maintenance),
    type_extension: cloneJson(descriptor.type_extension),
  };
  validateSchema(record, SCHEMAS.record, "Asset record");
  normalizeRecordTextSets(record);
  validateRecordSemantics(record, content);
  return record;
}

function validateRecordSemantics(record, content) {
  validateSchema(record, SCHEMAS.record, "Asset record");
  validateContentSemantics(content);
  if (record.asset_type !== content.asset_type) throw new Error("Asset record/content type mismatch");
  if (record.content.content_digest !== canonicalDigest(content)) throw new Error("Asset record content digest mismatch");
  const contentFiles = content.files.map(({ path, raw_digest }) => ({ path, raw_digest }));
  if (!compareCanonical(record.content.files, contentFiles)) throw new Error("Asset record content inventory mismatch");
  if (!compareCanonical(record.type_extension, content.type_extension)) throw new Error("Asset record/content type extension mismatch");
  assertSortedUnique(record.dependencies, refCompare, "Asset dependency list");
  for (const [values, label] of unorderedRecordTextSets(record)) assertSortedUnique(values, compareText, label);
  for (const dependency of record.dependencies) {
    if (dependency.stable_id === record.stable_id && dependency.version === record.version) throw new Error("Asset record contains a self dependency; dependency cycle rejected");
  }
  if (record.derivation.kind === "full_content_revision") {
    if (record.derivation.parent.stable_id !== record.stable_id || record.derivation.parent.asset_type !== record.asset_type) {
      throw new Error("Asset parent transplant is not allowed");
    }
    if (record.derivation.parent.version === record.version || record.derivation.parent.content_digest === record.content.content_digest) {
      throw new Error("Asset full-content revision must differ from its exact parent");
    }
  }
  const rollbackTarget = record.maintenance.rollback.target;
  if (rollbackTarget !== null
    && (rollbackTarget.stable_id !== record.stable_id
      || rollbackTarget.asset_type !== record.asset_type
      || rollbackTarget.version === record.version)) {
    throw new Error("Asset rollback target must be a different exact revision of the same stable ID and Asset type");
  }
  if (record.type_extension.kind === "rendered_prompt_bundle") {
    const adapterBinding = record.applicability.adapters;
    if (adapterBinding.status !== "bounded"
      || !compareCanonical(adapterBinding.included, [record.type_extension.adapter])
      || adapterBinding.excluded.length !== 0) {
      throw new Error("rendered Prompt bundle applicability adapter binding must exactly match its adapter");
    }
    if (record.derivation.kind === "full_content_revision"
      && (rollbackTarget === null || !compareCanonical(rollbackTarget, record.derivation.parent))) {
      throw new Error("rendered Prompt bundle full-content revision requires its direct parent as the exact rollback target");
    }
  }
  if (record.provenance.license.status === "unknown" && (record.provenance.license.spdx_id !== null || record.provenance.license.evidence_ref !== null)) {
    throw new Error("unknown Asset license status cannot carry an asserted license identity");
  }
  if (record.provenance.license.status === "supported"
    && (record.provenance.license.spdx_id === null || record.provenance.license.evidence_ref === null)) {
    throw new Error("supported Asset license status requires an identity and evidence reference");
  }
  if (record.provenance.owner.status === "unknown" && (record.provenance.owner.owner_id !== null || record.provenance.owner.evidence_ref !== null)) {
    throw new Error("unknown Asset owner status cannot carry asserted owner authority");
  }
  if (record.provenance.owner.status === "supported"
    && (record.provenance.owner.owner_id === null || record.provenance.owner.evidence_ref === null)) {
    throw new Error("supported Asset owner status requires an identity and evidence reference");
  }
  for (const dimensionName of ["models", "adapters", "stacks", "domains", "projects", "task_classes"]) {
    const dimension = record.applicability[dimensionName];
    const values = [...dimension.included, ...dimension.excluded];
    if ((dimension.status === "unknown" || dimension.status === "unrestricted") && values.length > 0) {
      throw new Error(`Asset applicability ${dimensionName} ${dimension.status} status cannot carry included or excluded values`);
    }
    if (dimension.status === "bounded" && values.length === 0) {
      throw new Error(`Asset applicability ${dimensionName} bounded status requires an included or excluded value`);
    }
    const included = new Set(dimension.included);
    if (dimension.excluded.some((value) => included.has(value))) {
      throw new Error(`Asset applicability ${dimensionName} cannot include and exclude the same value`);
    }
  }
  const includedScopes = new Set(record.applicability.included_scopes);
  if (record.applicability.excluded_scopes.some((scope) => includedScopes.has(scope))) {
    throw new Error("Asset applicability cannot include and exclude the same scope");
  }
  const unsupportedVerifiedClaims = [
    [record.provenance.license.status, "license"],
    [record.provenance.owner.status, "owner"],
    [record.permissions_and_effects.status, "permissions and effects"],
    [record.safety.status, "safety"],
    [record.mechanism_and_evidence.status, "mechanism and evidence"],
    [record.evaluation_history.status, "evaluation history"],
  ];
  for (const [status, label] of unsupportedVerifiedClaims) {
    if (status === "verified") throw new Error(`Asset Registry v1 cannot establish verified ${label} status`);
  }
  if (record.permissions_and_effects.status === "supported"
    && record.permissions_and_effects.permission_refs.length + record.permissions_and_effects.effect_refs.length === 0) {
    throw new Error("supported Asset permissions and effects status requires a reference");
  }
  if (record.permissions_and_effects.status === "not_evaluated"
    && record.permissions_and_effects.permission_refs.length + record.permissions_and_effects.effect_refs.length > 0) {
    throw new Error("not-evaluated Asset permissions and effects cannot carry evidence references");
  }
  if (record.safety.status === "supported" && record.safety.constraint_refs.length === 0) {
    throw new Error("supported Asset safety status requires a constraint reference");
  }
  if (record.mechanism_and_evidence.status === "supported" && record.mechanism_and_evidence.evidence_refs.length === 0) {
    throw new Error("supported Asset mechanism status requires an evidence reference");
  }
  if (record.evaluation_history.status === "supported" && record.evaluation_history.evidence_refs.length === 0) {
    throw new Error("supported Asset evaluation history requires an evidence reference");
  }
  validateTypeExtension(record.asset_type, record.type_extension, content.files);
}

function validateAuthorityContext(context) {
  validateSchema(context, SCHEMAS.authority, "Asset lifecycle authority context");
  if (!AUTHORITY_KINDS.has(context.authority.kind)) {
    throw new Error("verification evidence or producer identity is not Asset lifecycle authority");
  }
  assertSortedUnique(context.transitions, transitionCompare, "Asset lifecycle transition batch");
  const transitionBasis = canonicalDigest(context.transitions);
  if (context.transition_basis_digest !== transitionBasis) throw new Error("Asset lifecycle authority transition basis digest mismatch");
  const basis = cloneJson(context);
  delete basis.context_digest;
  if (context.context_digest !== canonicalDigest(basis)) throw new Error("Asset lifecycle authority context digest mismatch");
  const subjects = new Set();
  for (const transition of context.transitions) {
    const key = refKey(transition.asset);
    if (subjects.has(key)) throw new Error("Asset lifecycle transition batch contains duplicate subjects");
    subjects.add(key);
  }
  return context;
}

function assertReferenceMatches(ref, entry, relation) {
  if (ref.asset_type !== entry.asset_type
    || ref.record_digest !== entry.record_digest
    || ref.content_digest !== entry.content_digest) {
    throw new Error(`${relation} digest mismatch; ${relation} transplant rejected`);
  }
}

function assertCurrentUniqueness(entries) {
  const current = new Set();
  for (const entry of entries) {
    if (entry.state !== "current") continue;
    const key = `${entry.scope_id}\u0000${entry.stable_id}`;
    if (current.has(key)) throw new Error(`multiple current Asset revisions exist for ${entry.stable_id}`);
    current.add(key);
  }
}

function isAllowedTransition(fromState, toState, authorityKind) {
  if (!LIFECYCLE_STATES.has(fromState) || !LIFECYCLE_STATES.has(toState) || fromState === toState || fromState === "retired") return false;
  if ((fromState === "historical" || fromState === "superseded") && toState === "current") {
    return authorityKind === "external_asset_rollback_authority";
  }
  if (fromState === "current" && ["historical", "superseded"].includes(toState)) {
    return AUTHORITY_KINDS.has(authorityKind);
  }
  if (toState === "retired") return authorityKind === "external_asset_lifecycle_authority";
  if (authorityKind !== "external_asset_lifecycle_authority") return false;
  return (fromState === "candidate" && toState === "admitted")
    || (fromState === "admitted" && toState === "current")
    ;
}

function applyTransitionsToEntries(entries, context) {
  const next = entries.map(cloneJson);
  const byKey = new Map(next.map((entry) => [refKey(entry), entry]));
  for (const transition of context.transitions) {
    const entry = byKey.get(refKey(transition.asset));
    if (!entry) throw new Error(`lifecycle transition subject ${transition.asset.stable_id}@${transition.asset.version} is not registered`);
    assertReferenceMatches(transition.asset, entry, "lifecycle transition subject");
    if (entry.state !== transition.from_state) throw new Error(`lifecycle transition source state mismatch for ${entry.stable_id}@${entry.version}`);
    const rollbackTransition = (entry.state === "historical" || entry.state === "superseded") && transition.to_state === "current";
    if (rollbackTransition && context.authority.kind !== "external_asset_rollback_authority") {
      throw new Error("rollback transition requires explicit rollback authority");
    }
    if (!isAllowedTransition(entry.state, transition.to_state, context.authority.kind)) {
      throw new Error(`Asset lifecycle transition ${entry.state} -> ${transition.to_state} is not allowed by ${context.authority.kind}`);
    }
    entry.state = transition.to_state;
  }
  for (const transition of context.transitions) {
    if (transition.to_state !== "superseded") continue;
    const replacement = context.transitions.find((candidate) => candidate !== transition
      && candidate.asset.asset_type === transition.asset.asset_type
      && candidate.asset.stable_id === transition.asset.stable_id
      && candidate.asset.version !== transition.asset.version
      && candidate.to_state === "current");
    if (!replacement) {
      throw new Error(`superseded transition for ${transition.asset.stable_id}@${transition.asset.version} requires an exact same-batch replacement current revision`);
    }
  }
  next.sort(entryCompare);
  assertCurrentUniqueness(next);
  return next;
}

function loadSnapshotAssets({ storeRoot, snapshot }) {
  assertSortedUnique(snapshot.entries, entryCompare, "Asset registry snapshot entries");
  const assets = [];
  const byKey = new Map();
  for (const entry of snapshot.entries) {
    if (entry.scope_id !== snapshot.scope_id) throw new Error("Asset registry entry lifecycle scope mismatch");
    const key = refKey(entry);
    if (byKey.has(key)) throw new Error(`Asset identity collision for stable ID/version ${entry.stable_id}@${entry.version}`);
    const record = readContentAddressedJson({ storeRoot, digest: entry.record_digest }).value;
    const content = readContentAddressedJson({ storeRoot, digest: entry.content_digest }).value;
    validateRecordSemantics(record, content);
    if (record.stable_id !== entry.stable_id || record.version !== entry.version || record.asset_type !== entry.asset_type) {
      throw new Error("Asset registry entry/record identity mismatch");
    }
    if (record.content.content_digest !== entry.content_digest) throw new Error("Asset registry entry content digest mismatch");
    const asset = {
      ...cloneJson(entry),
      record: cloneJson(record),
      content: cloneJson(content),
      dependency_closure: [],
      parent_closure: [],
    };
    assets.push(asset);
    byKey.set(key, asset);
  }

  const resolveExact = (ref, relation) => {
    const target = byKey.get(refKey(ref));
    if (!target) throw new Error(`${relation} ${ref.stable_id}@${ref.version} is not registered; missing ${relation}`);
    assertReferenceMatches(ref, target, relation);
    return target;
  };

  const walkDependencies = (asset, visiting = new Set(), complete = new Set(), output = []) => {
    const key = refKey(asset);
    if (visiting.has(key)) throw new Error("Asset dependency cycle detected");
    if (complete.has(key)) return output;
    visiting.add(key);
    for (const dependencyRef of asset.record.dependencies) {
      const dependency = resolveExact(dependencyRef, "dependency");
      walkDependencies(dependency, visiting, complete, output);
      if (!output.some((entry) => refKey(entry) === refKey(dependency))) output.push(dependency);
    }
    visiting.delete(key);
    complete.add(key);
    return output;
  };

  const walkParents = (asset, visiting = new Set(), output = []) => {
    const key = refKey(asset);
    if (visiting.has(key)) throw new Error("Asset parent cycle detected");
    if (asset.record.derivation.kind === "root") return output;
    visiting.add(key);
    const parent = resolveExact(asset.record.derivation.parent, "parent");
    if (parent.stable_id !== asset.stable_id || parent.asset_type !== asset.asset_type) throw new Error("Asset parent transplant rejected");
    walkParents(parent, visiting, output);
    if (!output.some((entry) => refKey(entry) === refKey(parent))) output.push(parent);
    visiting.delete(key);
    return output;
  };

  for (const asset of assets) {
    const rollbackTargetRef = asset.record.maintenance.rollback.target;
    if (rollbackTargetRef !== null) {
      const rollbackTarget = resolveExact(rollbackTargetRef, "rollback target");
      if (rollbackTarget.stable_id !== asset.stable_id
        || rollbackTarget.asset_type !== asset.asset_type
        || rollbackTarget.version === asset.version) {
        throw new Error("Asset rollback target transplant rejected");
      }
    }
    asset.dependency_closure = walkDependencies(asset).map((entry) => ({
      ...exactRefFromEntry(entry),
      state: entry.state,
      record: cloneJson(entry.record),
      content: cloneJson(entry.content),
    }));
    asset.parent_closure = walkParents(asset).map((entry) => ({
      ...exactRefFromEntry(entry),
      state: entry.state,
      record: cloneJson(entry.record),
      content: cloneJson(entry.content),
    }));
  }
  return assets.sort(entryCompare);
}

function validateRegistrationSuccessor(snapshot, predecessorSnapshot) {
  if (snapshot.lifecycle_authority_context_digest !== null) throw new Error("candidate registration cannot carry lifecycle authority state");
  const prior = new Map(predecessorSnapshot.entries.map((entry) => [refKey(entry), entry]));
  let additions = 0;
  for (const entry of snapshot.entries) {
    const previous = prior.get(refKey(entry));
    if (!previous) {
      additions += 1;
      if (entry.state !== "candidate") throw new Error("registration creates candidate Assets only");
      continue;
    }
    if (!compareCanonical(entry, previous)) throw new Error(`Asset identity collision for stable ID/version ${entry.stable_id}@${entry.version}`);
    prior.delete(refKey(entry));
  }
  if (prior.size > 0 || additions !== 1) throw new Error("Asset registration snapshot must preserve history and add exactly one candidate");
}

function trustedContextForDigest({ storeRoot, digest, trustedAuthorityContexts }) {
  const stored = readContentAddressedJson({ storeRoot, digest }).value;
  validateAuthorityContext(stored);
  const trusted = trustedAuthorityContexts.find((context) => {
    try {
      return canonicalDigest(context) === digest;
    } catch {
      return false;
    }
  });
  if (!trusted) throw new Error(`trusted lifecycle authority context is required for ${digest}; stored context is untrusted lifecycle authority`);
  validateAuthorityContext(trusted);
  if (!compareCanonical(stored, trusted)) throw new Error("trusted lifecycle authority context does not match the stored exact context");
  return cloneJson(trusted);
}

function verifySnapshotInternal({ storeRoot, snapshotDigest, trustedAuthorityContexts, stack = new Set() }) {
  assertDigest(snapshotDigest, "Asset registry snapshot digest");
  if (stack.has(snapshotDigest)) throw new Error("Asset registry predecessor cycle detected");
  stack.add(snapshotDigest);
  try {
    const snapshot = readContentAddressedJson({ storeRoot, digest: snapshotDigest }).value;
    validateSchema(snapshot, SCHEMAS.snapshot, "Asset registry snapshot");
    assertSortedUnique(snapshot.entries, entryCompare, "Asset registry snapshot entries");
    assertCurrentUniqueness(snapshot.entries);

    let predecessor = null;
    if (snapshot.predecessor === null) {
      if (snapshot.snapshot_revision !== 1 || snapshot.entries.length !== 0 || snapshot.lifecycle_authority_context_digest !== null) {
        throw new Error("initial Asset registry snapshot must be empty revision 1 without lifecycle authority");
      }
    } else {
      predecessor = verifySnapshotInternal({
        storeRoot,
        snapshotDigest: snapshot.predecessor.snapshot_digest,
        trustedAuthorityContexts,
        stack,
      });
      if (snapshot.registry_id !== predecessor.snapshot.registry_id
        || snapshot.repository_id !== predecessor.snapshot.repository_id
        || snapshot.scope_id !== predecessor.snapshot.scope_id) {
        throw new Error("Asset registry snapshot predecessor identity transplant detected");
      }
      if (snapshot.predecessor.snapshot_revision !== predecessor.snapshot.snapshot_revision
        || snapshot.snapshot_revision !== predecessor.snapshot.snapshot_revision + 1) {
        throw new Error("Asset registry snapshot predecessor revision mismatch");
      }
      if (snapshot.lifecycle_authority_context_digest === null) {
        validateRegistrationSuccessor(snapshot, predecessor.snapshot);
      } else {
        const context = trustedContextForDigest({
          storeRoot,
          digest: snapshot.lifecycle_authority_context_digest,
          trustedAuthorityContexts,
        });
        if (context.registry_id !== snapshot.registry_id
          || context.repository_id !== snapshot.repository_id
          || context.scope_id !== snapshot.scope_id) {
          throw new Error("wrong lifecycle authority registry, repository, or scope");
        }
        if (context.predecessor_snapshot_digest !== snapshot.predecessor.snapshot_digest) {
          throw new Error("stale lifecycle authority predecessor snapshot mismatch");
        }
        const expectedEntries = applyTransitionsToEntries(predecessor.snapshot.entries, context);
        if (!compareCanonical(expectedEntries, snapshot.entries)) throw new Error("Asset lifecycle successor inventory does not match the complete authorized transition batch");
      }
    }

    const assets = loadSnapshotAssets({ storeRoot, snapshot });
    return { snapshot, snapshot_digest: snapshotDigest, assets };
  } finally {
    stack.delete(snapshotDigest);
  }
}

function publicVerifiedResult(internal) {
  return deepFreeze({
    schema_version: SCHEMA_VERSION,
    registry_id: internal.snapshot.registry_id,
    repository_id: internal.snapshot.repository_id,
    scope_id: internal.snapshot.scope_id,
    snapshot_revision: internal.snapshot.snapshot_revision,
    snapshot_digest: internal.snapshot_digest,
    predecessor: cloneJson(internal.snapshot.predecessor),
    assets: cloneJson(internal.assets),
  });
}

export function createEmptyAssetRegistry({ storeRoot, registryId, repositoryId, scopeId }) {
  const snapshot = {
    schema_version: SCHEMA_VERSION,
    object_kind: "asset_registry_snapshot",
    registry_id: registryId,
    repository_id: repositoryId,
    scope_id: scopeId,
    snapshot_revision: 1,
    predecessor: null,
    entries: [],
    lifecycle_authority_context_digest: null,
  };
  validateSchema(snapshot, SCHEMAS.snapshot, "initial Asset registry snapshot");
  const publication = putContentAddressedJson({ storeRoot, artifact: snapshot });
  const verified = verifyAssetRegistry({ storeRoot, snapshotDigest: publication.digest });
  return deepFreeze({
    snapshot_digest: verified.snapshot_digest,
    snapshot_revision: verified.snapshot_revision,
    created: publication.created,
  });
}

function assertExactReferencesAvailable(record, predecessor) {
  const byKey = new Map(predecessor.assets.map((asset) => [refKey(asset), asset]));
  for (const dependency of record.dependencies) {
    const target = byKey.get(refKey(dependency));
    if (!target) throw new Error(`missing dependency ${dependency.stable_id}@${dependency.version}; dependency is not registered`);
    assertReferenceMatches(dependency, target, "dependency");
  }
  if (record.derivation.kind === "full_content_revision") {
    const parent = byKey.get(refKey(record.derivation.parent));
    if (!parent) throw new Error(`missing parent ${record.derivation.parent.stable_id}@${record.derivation.parent.version}`);
    assertReferenceMatches(record.derivation.parent, parent, "parent");
    if (parent.stable_id !== record.stable_id || parent.asset_type !== record.asset_type) throw new Error("Asset parent transplant rejected");
  }
  const rollbackTargetRef = record.maintenance.rollback.target;
  if (rollbackTargetRef !== null) {
    const rollbackTarget = byKey.get(refKey(rollbackTargetRef));
    if (!rollbackTarget) throw new Error(`missing rollback target ${rollbackTargetRef.stable_id}@${rollbackTargetRef.version}`);
    assertReferenceMatches(rollbackTargetRef, rollbackTarget, "rollback target");
    if (rollbackTarget.stable_id !== record.stable_id || rollbackTarget.asset_type !== record.asset_type) {
      throw new Error("Asset rollback target transplant rejected");
    }
  }
}

export function registerAsset({
  storeRoot,
  sourceRoot,
  predecessorSnapshotDigest,
  descriptor,
  trustedAuthorityContexts = [],
}) {
  if (!Array.isArray(trustedAuthorityContexts)) throw new Error("trusted lifecycle authority contexts must be an array");
  const detachedDescriptor = cloneJson(descriptor);
  validateDescriptor(detachedDescriptor);
  const predecessor = verifySnapshotInternal({
    storeRoot,
    snapshotDigest: predecessorSnapshotDigest,
    trustedAuthorityContexts,
  });
  if (detachedDescriptor.source?.repository_id !== predecessor.snapshot.repository_id) {
    throw new Error("Asset descriptor source repository does not match the registry repository");
  }

  const content = buildContentPackage({ sourceRoot, descriptor: detachedDescriptor });
  const contentDigest = canonicalDigest(content);
  const record = buildRecord(detachedDescriptor, contentDigest, content);
  assertExactReferencesAvailable(record, predecessor);
  const recordDigest = canonicalDigest(record);

  const existing = predecessor.snapshot.entries.find((entry) => entry.stable_id === record.stable_id && entry.version === record.version);
  if (existing) {
    if (existing.asset_type === record.asset_type
      && existing.record_digest === recordDigest
      && existing.content_digest === contentDigest) {
      return deepFreeze({
        snapshot_digest: predecessorSnapshotDigest,
        snapshot_revision: predecessor.snapshot.snapshot_revision,
        record_digest: existing.record_digest,
        content_digest: existing.content_digest,
        state: existing.state,
        created: false,
      });
    }
    throw new Error(`stable ID and version collision for Asset ${record.stable_id}@${record.version}`);
  }

  const contentPublication = putContentAddressedJson({ storeRoot, artifact: content });
  const recordPublication = putContentAddressedJson({ storeRoot, artifact: record });

  const entry = {
    asset_type: record.asset_type,
    stable_id: record.stable_id,
    version: record.version,
    record_digest: recordPublication.digest,
    content_digest: contentPublication.digest,
    state: "candidate",
    scope_id: predecessor.snapshot.scope_id,
  };
  const snapshot = {
    schema_version: SCHEMA_VERSION,
    object_kind: "asset_registry_snapshot",
    registry_id: predecessor.snapshot.registry_id,
    repository_id: predecessor.snapshot.repository_id,
    scope_id: predecessor.snapshot.scope_id,
    snapshot_revision: predecessor.snapshot.snapshot_revision + 1,
    predecessor: {
      snapshot_revision: predecessor.snapshot.snapshot_revision,
      snapshot_digest: predecessorSnapshotDigest,
    },
    entries: [...predecessor.snapshot.entries.map(cloneJson), entry].sort(entryCompare),
    lifecycle_authority_context_digest: null,
  };
  validateSchema(snapshot, SCHEMAS.snapshot, "Asset registration snapshot");
  validateRegistrationSuccessor(snapshot, predecessor.snapshot);
  loadSnapshotAssets({ storeRoot, snapshot });
  const snapshotPublication = putContentAddressedJson({ storeRoot, artifact: snapshot });
  verifyAssetRegistry({
    storeRoot,
    snapshotDigest: snapshotPublication.digest,
    trustedAuthorityContexts,
  });
  return deepFreeze({
    snapshot_digest: snapshotPublication.digest,
    snapshot_revision: snapshot.snapshot_revision,
    record_digest: recordPublication.digest,
    content_digest: contentPublication.digest,
    state: "candidate",
    created: snapshotPublication.created,
  });
}

export function buildAssetLifecycleAuthorityContext({
  registryId,
  repositoryId,
  scopeId,
  predecessorSnapshotDigest,
  transitions,
  authority,
}) {
  if (!authority || typeof authority !== "object") throw new Error("Asset lifecycle authority is required");
  if (String(authority.kind ?? "").includes("verification") || String(authority.kind ?? "").includes("producer")) {
    throw new Error("verification evidence producer identity is not Asset lifecycle authority");
  }
  if (!AUTHORITY_KINDS.has(authority.kind)) throw new Error("unsupported Asset lifecycle authority kind");
  if (!Array.isArray(transitions) || transitions.length === 0) throw new Error("Asset lifecycle transition batch must not be empty");
  const sortedTransitions = cloneJson(transitions).sort(transitionCompare);
  const basis = {
    schema_version: SCHEMA_VERSION,
    object_kind: "asset_lifecycle_authority_context",
    registry_id: registryId,
    repository_id: repositoryId,
    scope_id: scopeId,
    predecessor_snapshot_digest: predecessorSnapshotDigest,
    transitions: sortedTransitions,
    transition_basis_digest: canonicalDigest(sortedTransitions),
    authority: cloneJson(authority),
  };
  const context = { ...basis, context_digest: canonicalDigest(basis) };
  validateAuthorityContext(context);
  return deepFreeze(context);
}

export function applyAssetLifecycleTransitions({
  storeRoot,
  predecessorSnapshotDigest,
  authorityContext,
  trustedAuthorityContexts = [],
}) {
  if (!authorityContext) throw new Error("lifecycle authority context is required");
  if (!Array.isArray(trustedAuthorityContexts)) throw new Error("trusted lifecycle authority contexts must be an array");
  const detachedContext = cloneJson(authorityContext);
  validateAuthorityContext(detachedContext);
  const predecessor = verifySnapshotInternal({
    storeRoot,
    snapshotDigest: predecessorSnapshotDigest,
    trustedAuthorityContexts,
  });
  if (detachedContext.predecessor_snapshot_digest !== predecessorSnapshotDigest) {
    throw new Error("stale lifecycle authority predecessor snapshot mismatch");
  }
  if (detachedContext.registry_id !== predecessor.snapshot.registry_id) throw new Error("wrong lifecycle authority registry");
  if (detachedContext.repository_id !== predecessor.snapshot.repository_id) throw new Error("wrong lifecycle authority repository");
  if (detachedContext.scope_id !== predecessor.snapshot.scope_id) throw new Error("wrong lifecycle authority scope");

  const entries = applyTransitionsToEntries(predecessor.snapshot.entries, detachedContext);
  const contextPublication = putContentAddressedJson({ storeRoot, artifact: detachedContext });
  const snapshot = {
    schema_version: SCHEMA_VERSION,
    object_kind: "asset_registry_snapshot",
    registry_id: predecessor.snapshot.registry_id,
    repository_id: predecessor.snapshot.repository_id,
    scope_id: predecessor.snapshot.scope_id,
    snapshot_revision: predecessor.snapshot.snapshot_revision + 1,
    predecessor: {
      snapshot_revision: predecessor.snapshot.snapshot_revision,
      snapshot_digest: predecessorSnapshotDigest,
    },
    entries,
    lifecycle_authority_context_digest: contextPublication.digest,
  };
  validateSchema(snapshot, SCHEMAS.snapshot, "Asset lifecycle successor snapshot");
  loadSnapshotAssets({ storeRoot, snapshot });
  const snapshotPublication = putContentAddressedJson({ storeRoot, artifact: snapshot });
  verifyAssetRegistry({
    storeRoot,
    snapshotDigest: snapshotPublication.digest,
    trustedAuthorityContexts: [...trustedAuthorityContexts, detachedContext],
  });
  return deepFreeze({
    snapshot_digest: snapshotPublication.digest,
    snapshot_revision: snapshot.snapshot_revision,
    authority_context_digest: contextPublication.digest,
    created: snapshotPublication.created,
  });
}

export function verifyAssetRegistry({ storeRoot, snapshotDigest, trustedAuthorityContexts = [] }) {
  if (!Array.isArray(trustedAuthorityContexts)) throw new Error("trusted lifecycle authority contexts must be an array");
  return publicVerifiedResult(verifySnapshotInternal({
    storeRoot,
    snapshotDigest,
    trustedAuthorityContexts: trustedAuthorityContexts.map(cloneJson),
  }));
}

export function listAssets({
  storeRoot,
  snapshotDigest,
  trustedAuthorityContexts = [],
  assetType,
  state,
} = {}) {
  if (assetType !== undefined && !ASSET_TYPES.has(assetType)) throw new Error("Asset list filter has an unsupported asset type");
  if (state !== undefined && !LIFECYCLE_STATES.has(state)) throw new Error("Asset list filter has an unsupported lifecycle state");
  const verified = verifyAssetRegistry({ storeRoot, snapshotDigest, trustedAuthorityContexts });
  const summaries = verified.assets
    .filter((asset) => assetType === undefined || asset.asset_type === assetType)
    .filter((asset) => state === undefined || asset.state === state)
    .map((asset) => ({
      asset_type: asset.asset_type,
      stable_id: asset.stable_id,
      version: asset.version,
      record_digest: asset.record_digest,
      content_digest: asset.content_digest,
      state: asset.state,
      scope_id: asset.scope_id,
    }))
    .sort(entryCompare);
  return deepFreeze(summaries);
}

export function resolveAsset({
  storeRoot,
  snapshotDigest,
  stableId,
  version,
  state,
  trustedAuthorityContexts = [],
} = {}) {
  if (typeof stableId !== "string" || stableId.length === 0) throw new Error("Asset stable ID is required for resolution");
  const verified = verifyAssetRegistry({ storeRoot, snapshotDigest, trustedAuthorityContexts });
  const matchingId = verified.assets.filter((asset) => asset.stable_id === stableId);
  if (version === undefined && state === undefined) {
    const current = matchingId.filter((asset) => asset.state === "current");
    if (current.length === 0) throw new Error(`no current Asset revision exists for ${stableId}; default resolution requires exactly one current Asset`);
    if (current.length !== 1) throw new Error(`default resolution requires exactly one current Asset for ${stableId}`);
    return deepFreeze(cloneJson(current[0]));
  }
  if (version === undefined || state === undefined) throw new Error("non-current resolution requires explicit state and exact version");
  if (!LIFECYCLE_STATES.has(state)) throw new Error("Asset resolution expected state is unsupported");
  const exact = matchingId.filter((asset) => asset.version === version && asset.state === state);
  if (exact.length !== 1) throw new Error(`exact Asset revision ${stableId}@${version} in state ${state} was not found`);
  return deepFreeze(cloneJson(exact[0]));
}

export function exportAssetRegistryReference({ storeRoot, snapshotDigest, trustedAuthorityContexts = [] }) {
  const verified = verifyAssetRegistry({ storeRoot, snapshotDigest, trustedAuthorityContexts });
  const assets = verified.assets.map((asset) => ({
    ...exactRefFromEntry(asset),
    state: asset.state,
    scope_id: asset.scope_id,
    dependencies: asset.record.dependencies.map(cloneJson).sort(refCompare),
    parent: asset.record.derivation.kind === "root" ? null : cloneJson(asset.record.derivation.parent),
    rollback_target: cloneJson(asset.record.maintenance.rollback.target),
  })).sort(entryCompare);
  return deepFreeze({
    schema_version: SCHEMA_VERSION,
    manifest_kind: "asset_registry_exact_reference",
    registry_id: verified.registry_id,
    repository_id: verified.repository_id,
    scope_id: verified.scope_id,
    snapshot_revision: verified.snapshot_revision,
    snapshot_digest: verified.snapshot_digest,
    assets,
    portable_exact_references_only: true,
    runtime_activation_implied: false,
  });
}
