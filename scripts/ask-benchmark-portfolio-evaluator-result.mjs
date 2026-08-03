import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { posix, relative, resolve, sep, win32 } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { computePortfolioCatalogDigest } from "./ask-benchmark-portfolio-catalog.mjs";
import {
  computeEvaluationDigest,
  computeEvaluationId,
  computeEvaluatorReferenceDigest,
  EVALUATOR_REFERENCE_SCHEMA_PATH,
  EVALUATOR_RESULT_SCHEMA_PATH,
  validateExecutionEventEvidenceReferences,
  verifyPrivateEvaluatorBundle,
  verifyEvaluatorResult,
} from "./ask-benchmark-evaluator-boundary.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { readStableJsonFile } from "./ask-benchmark-duplicate-key-json.mjs";
import { validatePortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import {
  LIFECYCLE_NEUTRAL_BINARY_PROFILE_NAME,
  validateLifecycleNeutralResultProfile,
} from "./ask-benchmark-portfolio-result-profile.mjs";
import {
  computeFinalAdmissionRecordDigest,
  computeOutputContractDigest,
  computePolicyManifestDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeScoringInputFreezeManifestDigest,
  computeScoringPolicyDigest,
  FINAL_ADMISSION_RECORD_SCHEMA_PATH,
  SCORING_INPUT_FREEZE_MANIFEST_SCHEMA_PATH,
  validateRequirementRecordContract,
  validateRequirementResultObservations,
  validateScoringContractSchemaParity,
} from "./ask-benchmark-scoring-contract.mjs";

const MAX_PUBLIC_JSON_BYTES = 1024 * 1024;
const CATALOG_SCHEMA_PATH = "benchmarks/schemas/portfolio-catalog.schema.json";
const POLICY_MANIFEST_SCHEMA_PATH = "benchmarks/schemas/portfolio-policy-manifest.schema.json";
const SCORING_POLICY_SCHEMA_PATH = "benchmarks/schemas/portfolio-scoring-policy.schema.json";
const REQUIREMENT_RECORD_SCHEMA_PATH = "benchmarks/schemas/portfolio-requirement-record.schema.json";
const OUTPUT_CONTRACT_SCHEMA_PATH = "benchmarks/schemas/portfolio-output-contract.schema.json";
const R21_ADMISSION_OPTIONAL_FIELDS = Object.freeze([
  "evaluator_authority_manifest_path",
  "evaluator_authority_manifest_raw_sha256",
  "evaluator_authority_manifest_digest",
  "evaluator_source_identity",
  "requirement_authority_digest",
]);
const PUBLIC_FORBIDDEN_FIELDS = new Set([
  "credential", "credentials", "customer_data", "expected_decision", "expected_finding", "expected_finding_details",
  "expected_patch", "hidden_answer", "hidden_test_source", "hidden_tests", "matcher", "matcher_expression", "oracle",
  "oracle_text", "personal_data", "private_evaluator_path", "private_storage_uri", "raw_evaluator_prompt", "reference_answer",
  "rubric", "secret", "secrets",
]);

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function isInside(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${sep}`);
}

function assertPortableRelativePath(value, label) {
  const segments = typeof value === "string" ? value.split("/") : [];
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 240
    || value.includes("\\")
    || value.includes(":")
    || value.includes("\0")
    || posix.isAbsolute(value)
    || win32.isAbsolute(value)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
    || posix.normalize(value) !== value
  ) throw new Error(`${label} must be a portable repository-relative path`);
  return value;
}

function readJson(path, label) {
  return readStableJsonFile(path, label, MAX_PUBLIC_JSON_BYTES, { allowEmpty: false });
}

function looksLikePrivatePathOrUri(value) {
  return posix.isAbsolute(value)
    || win32.isAbsolute(value)
    || value.includes("\\")
    || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value);
}

function assertPublicArtifactTree(value, label, path = "$", depth = 0) {
  if (depth > 12) throw new Error(`${label} exceeds the public structure depth limit`);
  if (typeof value === "string") {
    if (value.length > 256) throw new Error(`${label} contains oversized raw text at ${path}`);
    if (looksLikePrivatePathOrUri(value)) throw new Error(`${label} contains a private path or storage URI at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) assertPublicArtifactTree(value[index], label, `${path}[${index}]`, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (PUBLIC_FORBIDDEN_FIELDS.has(key.toLowerCase())) throw new Error(`${label} contains prohibited answer-bearing or private field ${key}`);
    assertPublicArtifactTree(child, label, `${path}.${key}`, depth + 1);
  }
}

function checkedInBytes(root, path) {
  try {
    return execFileSync("git", ["-C", root, "show", `HEAD:${path}`], { encoding: null, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function resolveAuthorityPath(root, path, label) {
  assertPortableRelativePath(path, `${label} path`);
  const absolute = resolve(root, path);
  if (!isInside(root, absolute)) throw new Error(`${label} path escapes the authority root`);
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isFile()) throw new Error(`${label} must be a non-symlink regular file`);
  if (!isInside(realpathSync(root), realpathSync(absolute))) throw new Error(`${label} path escapes the authority root`);
  return absolute;
}

function readFreezeManifest({ root, path, sourceDigest }) {
  if (!path) throw new Error("scoring input freeze manifest path is required");
  const relativePath = relative(root, resolve(path)).split(sep).join("/");
  const authoritativePath = resolveAuthorityPath(root, relativePath, "scoring input freeze manifest");
  if (resolve(path) !== authoritativePath) throw new Error("scoring input freeze manifest supplied path does not match its authority path");
  const source = readJson(authoritativePath, "scoring input freeze manifest");
  const committed = checkedInBytes(root, relativePath);
  if (!committed || Buffer.compare(committed, source.bytes) !== 0) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(sourceDigest ?? "") || sourceDigest !== source.rawByteDigest) throw new Error("scoring input freeze manifest requires checked-in bytes or an external immutable source digest");
  }
  assertBenchmarkSchemaInstance(source.value, { schemaPath: resolve(root, SCORING_INPUT_FREEZE_MANIFEST_SCHEMA_PATH), label: "scoring input freeze manifest" });
  assertPublicArtifactTree(source.value, "scoring input freeze manifest");
  if (source.value.manifest_digest !== computeScoringInputFreezeManifestDigest(source.value)) throw new Error("scoring input freeze manifest digest closure is invalid");
  return { ...source, path: authoritativePath, relativePath, sourceDigest: source.rawByteDigest };
}

function readFrozenJson({ root, freezeReference, suppliedPath, schemaPath = null, label }) {
  const authoritativePath = resolveAuthorityPath(root, freezeReference.path, label);
  if (!suppliedPath || resolve(suppliedPath) !== authoritativePath) throw new Error(`${label} supplied path does not match the freeze authority path`);
  const source = readJson(authoritativePath, label);
  if (source.rawByteDigest !== freezeReference.raw_byte_digest) throw new Error(`${label} raw-byte digest does not match the scoring input freeze manifest`);
  if (schemaPath) assertBenchmarkSchemaInstance(source.value, { schemaPath: resolve(root, schemaPath), label });
  assertPublicArtifactTree(source.value, label);
  return { ...source, path: authoritativePath, relativePath: freezeReference.path };
}

function computeRequirementAuthorityDigest(record) {
  if (!Object.hasOwn(record, "requirement_authority_digest")) return record.admission_digest;
  const {
    admission_digest: _admissionDigest,
    evaluator_authority_manifest_path: _authorityManifestPath,
    evaluator_authority_manifest_raw_sha256: _authorityManifestRawSha256,
    evaluator_authority_manifest_digest: _authorityManifestDigest,
    requirement_authority_digest: _requirementAuthorityDigest,
    ...requirementAuthority
  } = record;
  return canonicalDigest(requirementAuthority);
}

function validateLifecycleNeutralAdmission({ root, admissionRecord, schema }) {
  const schemaFields = Object.keys(schema.properties ?? {});
  const allowed = new Set([...schemaFields, ...R21_ADMISSION_OPTIONAL_FIELDS]);
  const unknown = Object.keys(admissionRecord).filter((field) => !allowed.has(field));
  const missing = (schema.required ?? []).filter((field) => !Object.hasOwn(admissionRecord, field));
  if (unknown.length > 0 || missing.length > 0) throw new Error(`frozen admission record field closure is invalid: unknown=${unknown.join(",")} missing=${missing.join(",")}`);
  const baseProjection = Object.fromEntries(Object.entries(admissionRecord).filter(([field]) => schemaFields.includes(field)));
  assertBenchmarkSchemaInstance(baseProjection, { schemaPath: resolve(root, FINAL_ADMISSION_RECORD_SCHEMA_PATH), label: "frozen lifecycle-neutral admission record" });
  for (const field of ["evidence_map_ids", "mutation_set_ids"]) {
    const values = admissionRecord[field];
    if (!Array.isArray(values) || values.length === 0 || new Set(values).size !== values.length) throw new Error(`frozen admission ${field} must be a non-empty unique array`);
  }
  if (admissionRecord.admission_digest !== computeFinalAdmissionRecordDigest(admissionRecord)) throw new Error("frozen admission record semantic digest is invalid");
  const requirementAuthorityDigest = computeRequirementAuthorityDigest(admissionRecord);
  if (admissionRecord.requirement_authority_digest && admissionRecord.requirement_authority_digest !== requirementAuthorityDigest) throw new Error("frozen admission requirement-authority digest is invalid");
  return requirementAuthorityDigest;
}

function readLifecycleNeutralScoringInputs(options, bundle) {
  const { root } = options;
  const freezeSource = readFreezeManifest({ root, path: options.scoringInputFreezeManifestPath, sourceDigest: options.scoringInputFreezeManifestSourceDigest });
  const freezeManifest = freezeSource.value;
  const sources = {
    catalog: readFrozenJson({ root, freezeReference: freezeManifest.catalog, suppliedPath: options.catalogPath, schemaPath: CATALOG_SCHEMA_PATH, label: "portfolio catalog" }),
    policyManifest: readFrozenJson({ root, freezeReference: freezeManifest.policy_manifest, suppliedPath: options.policyManifestPath, schemaPath: POLICY_MANIFEST_SCHEMA_PATH, label: "portfolio policy manifest" }),
    scoringPolicy: readFrozenJson({ root, freezeReference: freezeManifest.scoring_policy, suppliedPath: options.scoringPolicyPath, schemaPath: SCORING_POLICY_SCHEMA_PATH, label: "portfolio scoring policy" }),
    admissionRecord: readFrozenJson({ root, freezeReference: freezeManifest.admission_record, suppliedPath: options.admissionRecordPath, label: "frozen final admission record" }),
    requirementRecord: readFrozenJson({ root, freezeReference: freezeManifest.requirement_record, suppliedPath: options.requirementRecordPath, schemaPath: REQUIREMENT_RECORD_SCHEMA_PATH, label: "frozen requirement record" }),
    outputContract: readFrozenJson({ root, freezeReference: freezeManifest.output_contract, suppliedPath: options.outputContractPath, schemaPath: OUTPUT_CONTRACT_SCHEMA_PATH, label: "frozen output contract" }),
    evaluatorReference: readFrozenJson({ root, freezeReference: freezeManifest.evaluator_public_reference, suppliedPath: options.referencePath, schemaPath: EVALUATOR_REFERENCE_SCHEMA_PATH, label: "frozen evaluator public reference" }),
  };
  if (freezeManifest.evaluator_authority_manifest) {
    sources.evaluatorAuthorityManifest = readFrozenJson({
      root,
      freezeReference: freezeManifest.evaluator_authority_manifest,
      suppliedPath: resolve(root, freezeManifest.evaluator_authority_manifest.path),
      schemaPath: "benchmarks/schemas/evaluator-authority-manifest.schema.json",
      label: "frozen evaluator authority manifest",
    });
  }
  const values = Object.fromEntries(Object.entries(sources).map(([field, source]) => [field, source.value]));
  const { catalog, policyManifest, scoringPolicy, admissionRecord, requirementRecord, outputContract, evaluatorReference, evaluatorAuthorityManifest = null } = values;
  validatePortfolioPolicyArtifacts({ root, catalogPath: options.catalogPath, policyManifestPath: options.policyManifestPath, scoringPolicyPath: options.scoringPolicyPath });
  if (catalog.catalog_digest !== computePortfolioCatalogDigest(catalog) || freezeManifest.catalog.semantic_digest !== catalog.catalog_digest) throw new Error("portfolio catalog semantic authority is invalid");
  if (freezeManifest.policy_manifest.semantic_digest !== computePolicyManifestDigest(policyManifest)) throw new Error("policy manifest semantic authority is invalid");
  if (freezeManifest.scoring_policy.semantic_digest !== computeScoringPolicyDigest(scoringPolicy)) throw new Error("scoring policy semantic authority is invalid");
  if (freezeManifest.admission_record.semantic_digest !== computeFinalAdmissionRecordDigest(admissionRecord)) throw new Error("frozen admission semantic authority is invalid");
  if (freezeManifest.requirement_record.record_digest !== computeRequirementRecordDigest(requirementRecord) || freezeManifest.requirement_record.set_digest !== computeRequirementSetDigest(requirementRecord)) throw new Error("frozen requirement authority is invalid");
  if (freezeManifest.output_contract.semantic_digest !== computeOutputContractDigest(outputContract)) throw new Error("frozen output-contract authority is invalid");
  if (freezeManifest.evaluator_public_reference.semantic_digest !== computeEvaluatorReferenceDigest(evaluatorReference)) throw new Error("frozen evaluator-reference authority is invalid");
  if (evaluatorAuthorityManifest && (
    freezeManifest.evaluator_authority_manifest.semantic_digest !== evaluatorAuthorityManifest.manifest_digest
    || evaluatorAuthorityManifest.manifest_digest !== canonicalDigest(withoutField(evaluatorAuthorityManifest, "manifest_digest"))
  )) throw new Error("frozen evaluator-authority manifest semantic identity is invalid");
  const requirementSchema = readJson(resolve(root, REQUIREMENT_RECORD_SCHEMA_PATH), "requirement record Schema").value;
  const resultSchema = readJson(resolve(root, EVALUATOR_RESULT_SCHEMA_PATH), "evaluator result Schema").value;
  const admissionSchema = readJson(resolve(root, FINAL_ADMISSION_RECORD_SCHEMA_PATH), "final admission record Schema").value;
  validateScoringContractSchemaParity({ scoringPolicy, requirementRecordSchema: requirementSchema, evaluatorResultSchema: resultSchema });
  const requirementAuthorityDigest = validateLifecycleNeutralAdmission({ root, admissionRecord, schema: admissionSchema });
  validateRequirementRecordContract({ scoringPolicy, requirementRecord, requirementRecordSchema: requirementSchema, evaluatorResultSchema: resultSchema });
  if (policyManifest.scoring_policy?.path !== freezeManifest.scoring_policy.path) throw new Error("policy manifest scoring-policy path is invalid");
  if (requirementRecord.requirement_record_path !== freezeManifest.requirement_record.path || outputContract.output_contract_path !== freezeManifest.output_contract.path || outputContract.evaluator_public_reference_path !== freezeManifest.evaluator_public_reference.path) throw new Error("frozen scoring input internal path closure is invalid");
  const fixture = catalog.fixtures.find(({ fixture_id: fixtureId }) => fixtureId === freezeManifest.fixture_id);
  if (!fixture) throw new Error("frozen scoring input fixture is absent from the catalog");
  if ([admissionRecord.fixture_id, requirementRecord.fixture_id, outputContract.fixture_id, evaluatorReference.fixture_id].some((fixtureId) => fixtureId !== freezeManifest.fixture_id)) throw new Error("frozen scoring input fixture identity is transplanted");
  if (admissionRecord.input_manifest_digest !== freezeManifest.fixture_input_digest || evaluatorReference.fixture_input_digest !== freezeManifest.fixture_input_digest) throw new Error("frozen scoring input fixture digest is transplanted");
  if (admissionRecord.catalog_digest !== catalog.catalog_digest) throw new Error("frozen admission catalog identity is invalid");
  if (admissionRecord.evaluator_bundle_id !== evaluatorReference.evaluator_bundle_id || admissionRecord.evaluator_bundle_digest !== evaluatorReference.evaluator_bundle_digest) throw new Error("frozen admission evaluator identity is invalid");
  if (admissionRecord.evaluator_requirement_count !== requirementRecord.requirements.length) throw new Error("frozen admission requirement count is invalid");
  const expectedEvidenceIds = requirementRecord.requirements.flatMap(({ evidence_map_ids }) => evidence_map_ids).sort();
  const expectedMutationIds = requirementRecord.requirements.flatMap(({ mutation_ids }) => mutation_ids).sort();
  if (stableCanonicalJson([...admissionRecord.evidence_map_ids].sort()) !== stableCanonicalJson(expectedEvidenceIds) || stableCanonicalJson([...admissionRecord.mutation_set_ids].sort()) !== stableCanonicalJson(expectedMutationIds)) throw new Error("frozen admission requirement inventory is invalid");
  if (requirementRecord.admission_record_digest !== requirementAuthorityDigest) throw new Error("requirement record does not bind the frozen admission requirement authority");
  if (stableCanonicalJson(evaluatorReference) !== stableCanonicalJson(bundle.reference)) throw new Error("private bundle reference differs from the frozen evaluator reference");
  if (admissionRecord.evaluator_source_identity || evaluatorReference.evaluator_source_identity) {
    if (stableCanonicalJson(admissionRecord.evaluator_source_identity) !== stableCanonicalJson(evaluatorReference.evaluator_source_identity)) throw new Error("frozen admission evaluator source identity is invalid");
  }
  if (evaluatorAuthorityManifest) {
    const expected = {
      evaluator_authority_manifest_path: freezeManifest.evaluator_authority_manifest.path,
      evaluator_authority_manifest_raw_sha256: freezeManifest.evaluator_authority_manifest.raw_byte_digest,
      evaluator_authority_manifest_digest: evaluatorAuthorityManifest.manifest_digest,
    };
    for (const [artifact, label] of [[admissionRecord, "admission"], [outputContract, "output contract"], [evaluatorReference, "evaluator reference"]]) {
      if (Object.entries(expected).some(([field, value]) => artifact[field] !== value)) throw new Error(`frozen ${label} evaluator-authority manifest closure is invalid`);
    }
  }
  return { freezeManifest, freezeManifestSource: freezeSource, freezeManifestSourceDigest: freezeSource.sourceDigest, ...values, sources, requirementAuthorityDigest };
}

function assertEvaluatorResultIdentity(result) {
  if (result.evaluation_id !== computeEvaluationId(result)) throw new Error("evaluator result evaluation ID is invalid");
  if (result.evaluation_digest !== computeEvaluationDigest(result)) throw new Error("evaluator result digest closure is invalid");
  const notes = result.evaluator_notes_state;
  if ((notes.digest === null) !== (notes.bytes === null)) throw new Error("evaluator note digest and bytes must be paired");
  if (notes.state === "not_recorded" && notes.digest !== null) throw new Error("unrecorded evaluator notes retain identity metadata");
  if (notes.state === "digested" && notes.digest === null) throw new Error("digested evaluator notes require identity metadata");
  const identities = [
    [[...result.findings, ...result.false_positives, ...result.scope_deviations], "finding_id"],
    [[...result.required_mechanisms, ...result.unnecessary_mechanisms], "mechanism_id"],
    [result.unsafe_attempted_actions, "action_id"],
  ];
  for (const [items, field] of identities) if (new Set(items.map((entry) => entry[field])).size !== items.length) throw new Error(`evaluator result contains duplicate ${field}`);
  const evidenceReferences = [];
  function collect(value) {
    if (Array.isArray(value)) for (const entry of value) collect(entry);
    else if (value && typeof value === "object") {
      if (value.kind && value.digest && Object.hasOwn(value, "bytes")) evidenceReferences.push(value);
      else for (const child of Object.values(value)) collect(child);
    }
  }
  collect(result);
  for (const reference of evidenceReferences.filter(({ kind }) => kind === "normalized_result")) {
    if (reference.digest !== result.normalized_result_digest) throw new Error("evaluator result contains a transplanted normalized-result evidence reference");
  }
}

function normalizedRecordFor(verified, result) {
  const reference = verified.manifest.cases.flatMap((entry) => entry.normalized_attempts).find((entry) => entry.normalized_result_id === result.normalized_result_id);
  if (!reference) throw new Error("evaluator result references an absent normalized result");
  const source = readJson(resolve(verified.generationPath, reference.path), "bound normalized result");
  if (source.value.normalized_result_digest !== result.normalized_result_digest) throw new Error("evaluator result normalized digest is invalid");
  return source.value;
}

function assertBoundaryLineage(bundle, verified) {
  const source = verified.manifest.source;
  const materialized = readStableJsonFile(bundle.markerPaths.materializedPath, "materialized root manifest", MAX_PUBLIC_JSON_BYTES, { allowEmpty: false });
  const selection = readStableJsonFile(bundle.markerPaths.selectionState, "selection-state root index", MAX_PUBLIC_JSON_BYTES, { allowEmpty: false });
  const runIdentity = readJson(bundle.markerPaths.runDir, "execution run identity").value;
  if (materialized.rawByteDigest !== source.materialization_manifest_digest || selection.rawByteDigest !== source.selection_state_digest) throw new Error("evaluator boundary root digest lineage is invalid");
  if (canonicalDigest(runIdentity) !== source.run_identity_digest || runIdentity.run_instance_id !== source.run_instance_id) throw new Error("evaluator boundary run identity is invalid");
  if (!isInside(bundle.canonicalRoots.normalizedResultsPath, verified.generationPath)) throw new Error("normalized generation escapes the verified root");
}

function validateLifecycleNeutralBindings({ scoringInputs, normalized, result }) {
  const { freezeManifest, catalog, policyManifest, scoringPolicy, admissionRecord, requirementRecord, outputContract, evaluatorReference } = scoringInputs;
  if (requirementRecord.fixture_id !== normalized.lineage.fixture_id || requirementRecord.catalog_digest !== catalog.catalog_digest || requirementRecord.policy_manifest_digest !== policyManifest.manifest_digest || requirementRecord.scoring_policy_digest !== scoringPolicy.policy_digest) throw new Error("requirement record normalized or policy lineage is invalid");
  if (outputContract.fixture_id !== normalized.lineage.fixture_id || outputContract.catalog_digest !== catalog.catalog_digest || outputContract.policy_manifest_digest !== policyManifest.manifest_digest || outputContract.evaluator_public_reference_digest !== evaluatorReference.public_metadata_digest) throw new Error("output contract lineage is invalid");
  const fixture = catalog.fixtures.find(({ fixture_id: fixtureId }) => fixtureId === normalized.lineage.fixture_id);
  if (!fixture || fixture.suite !== normalized.lineage.suite || fixture.task_class !== normalized.lineage.task_class) throw new Error("normalized fixture catalog lineage is invalid");
  const expected = {
    scoring_input_freeze_manifest_source_digest: scoringInputs.freezeManifestSourceDigest,
    scoring_input_freeze_manifest_digest: freezeManifest.manifest_digest,
    catalog_digest: catalog.catalog_digest,
    policy_manifest_digest: policyManifest.manifest_digest,
    scoring_policy_digest: scoringPolicy.policy_digest,
    admission_record_digest: admissionRecord.admission_digest,
    requirement_record_digest: requirementRecord.requirement_record_digest,
    requirement_set_digest: requirementRecord.requirement_set_digest,
    output_contract_digest: outputContract.output_contract_digest,
    evaluator_public_reference_digest: evaluatorReference.public_metadata_digest,
    plan_digest: normalized.lineage.plan_digest,
  };
  for (const [field, value] of Object.entries(expected)) if (result[field] !== value) throw new Error(`evaluator scoring-input binding mismatch at ${field}`);
  if (evaluatorReference.fixture_id !== normalized.lineage.fixture_id || evaluatorReference.fixture_input_digest !== normalized.lineage.fixture_input_digest) throw new Error("evaluator reference normalized lineage is invalid");
  const evaluation = validateRequirementResultObservations({ scoringPolicy, requirementRecord, evaluatorResult: result });
  validateLifecycleNeutralResultProfile({ outputContract, freezeManifest, evaluatorResult: result, requirementRecord, normalizedResult: normalized });
  return evaluation;
}

export function verifyLifecycleNeutralEvaluatorResult(options) {
  readStableJsonFile(resolve(options.normalizedResultsPath, "normalized-results-root.json"), "normalized result collection root", MAX_PUBLIC_JSON_BYTES, { allowEmpty: false });
  const bundle = verifyPrivateEvaluatorBundle(options);
  if (!options.resultPath || isInside(options.privateRoot, options.resultPath)) throw new Error("public evaluator result must not overlap the private evaluator root");
  const resultSource = readJson(options.resultPath, "evaluator result envelope");
  const result = resultSource.value;
  assertBenchmarkSchemaInstance(result, { schemaPath: resolve(options.root, EVALUATOR_RESULT_SCHEMA_PATH), label: "evaluator result envelope" });
  assertPublicArtifactTree(result, "evaluator result envelope");
  assertEvaluatorResultIdentity(result);
  const requiresCompletePrivateAuthority = result.result_profile?.name === LIFECYCLE_NEUTRAL_BINARY_PROFILE_NAME;
  if (requiresCompletePrivateAuthority) {
    const privateAuthorityPaths = [options.privateEvaluationRoot, options.privateEvaluationRecordPath, options.privateFragmentPath];
    if (privateAuthorityPaths.filter(Boolean).length !== privateAuthorityPaths.length) {
      throw new Error("binary scope verification requires --private-evaluation-root, --private-evaluation-record, and --private-fragment together");
    }
  }
  const scoringInputs = readLifecycleNeutralScoringInputs(options, bundle);
  const verified = verifyNormalizedPortfolioResults({ root: options.root, outputPath: options.normalizedResultsPath, sourceSnapshotDigest: result.source_snapshot_digest });
  readStableJsonFile(resolve(verified.generationPath, "normalized-run.json"), "normalized run manifest", MAX_PUBLIC_JSON_BYTES, { allowEmpty: false });
  if (result.source_snapshot_digest !== verified.manifest.source_snapshot_digest) throw new Error("evaluator result source snapshot lineage is invalid");
  assertBoundaryLineage(bundle, verified);
  const normalized = normalizedRecordFor(verified, result);
  validateExecutionEventEvidenceReferences({ normalized, result });
  const lineage = normalized.lineage;
  const expectedLineage = {
    normalized_result_id: normalized.normalized_result_id,
    normalized_result_digest: normalized.normalized_result_digest,
    run_instance_id: lineage.run_instance_id,
    plan_id: lineage.plan_id,
    plan_digest: lineage.plan_digest,
    fixture_id: lineage.fixture_id,
    fixture_input_digest: lineage.fixture_input_digest,
    case_id: lineage.case_id,
    attempt: lineage.attempt,
    adapter: lineage.adapter_track,
    condition: lineage.condition,
    repetition: lineage.repetition,
    evaluator_bundle_id: bundle.manifest.evaluator_bundle_id,
    evaluator_bundle_digest: bundle.manifest.evaluator_bundle_digest,
    evaluator_revision: bundle.manifest.evaluator_revision,
  };
  for (const [field, value] of Object.entries(expectedLineage)) if (result[field] !== value) throw new Error(`evaluator result lineage mismatch at ${field}`);
  if (bundle.reference.fixture_id !== lineage.fixture_id || bundle.reference.fixture_input_digest !== lineage.fixture_input_digest || bundle.reference.task_class !== lineage.task_class || bundle.reference.suite !== lineage.suite) throw new Error("evaluator reference is transplanted across normalized authority");
  const evaluation = validateLifecycleNeutralBindings({ scoringInputs, normalized, result });
  if (scoringInputs.admissionRecord.admission_status === "admitted" || requiresCompletePrivateAuthority) {
    const legacy = verifyEvaluatorResult(options);
    if (
      stableCanonicalJson(legacy.result) !== stableCanonicalJson(result)
      || stableCanonicalJson(legacy.normalized) !== stableCanonicalJson(normalized)
      || legacy.scoringReady !== evaluation.scoringReady
    ) throw new Error("lifecycle-neutral evaluator verification differs from the legacy admitted projection");
  }
  return { bundle, normalized, result, verified, scoringInputs, evaluationReady: evaluation.scoringReady, scoringReady: evaluation.scoringReady };
}
