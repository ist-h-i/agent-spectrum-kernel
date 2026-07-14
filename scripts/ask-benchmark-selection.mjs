import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, parse, relative, resolve, sep } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, stableCanonicalJson, validateMaterializedPortfolio } from "./ask-benchmark-materialize.mjs";

export const ADAPTIVE_SELECTION_SCHEMA_PATH = "benchmarks/schemas/adaptive-selection.schema.json";
export const ADAPTIVE_SELECTION_INPUT_SCHEMA_PATH = "benchmarks/schemas/adaptive-selection-input.schema.json";
export const ADAPTIVE_SELECTION_STATE_SCHEMA_PATH = "benchmarks/schemas/adaptive-selection-state.schema.json";
export const ADAPTIVE_SELECTION_STATE_INDEX_NAME = "selection-state.json";
export const ADAPTIVE_SELECTION_DIRECTORY_NAME = "selections";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertNoSymlinkSegments(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} traverses a symlink: ${current}`);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
}

function assertRfc3339Timestamp(value, label = "selection timestamp") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an RFC 3339 timestamp`);
  }
  return value;
}

function selectionPath(stateRoot, caseId) {
  return resolve(stateRoot, ADAPTIVE_SELECTION_DIRECTORY_NAME, `${caseId}.json`);
}

function resultArtifactName(path) {
  const lower = path.toLowerCase();
  if (lower.startsWith("workspace/")) return false;
  const base = lower.split("/").at(-1);
  if ([".benchmark-run.json", ".benchmark-final.json", ".benchmark-events.jsonl", ".benchmark-stderr.txt"].includes(base)) return true;
  if (base.startsWith(".benchmark-")) return true;
  return /(?:^|[-_.])(normalized[-_.]?)?(?:output|outputs|result|results|score|scores|telemetry)(?:[-_.]|$)/u.test(base);
}

export function findResultArtifacts(caseRoot) {
  const findings = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      const path = relative(caseRoot, absolute).split(sep).join("/");
      if (entry.isSymbolicLink()) {
        findings.push(path);
        continue;
      }
      if (resultArtifactName(path)) findings.push(path);
      if (entry.isDirectory()) walk(absolute);
    }
  }
  walk(caseRoot);
  return findings.sort();
}

function assertNoResultArtifacts(caseRoot, caseId) {
  const artifacts = findResultArtifacts(caseRoot);
  if (artifacts.length > 0) throw new Error(`${caseId} contains result-like artifact(s) before or during selection verification: ${artifacts.join(", ")}`);
}

function selectionContext({ root, config, planPath, materializedPath, repositoryRevision, caseId }) {
  if (!planPath || !materializedPath || !caseId) throw new Error("selection commands require --plan, --materialized, and --case-id");
  const plan = readJson(planPath);
  const validated = validateMaterializedPortfolio({
    root,
    config,
    plan,
    materializedRoot: materializedPath,
    repositoryRevision,
  });
  const materializedRoot = resolve(materializedPath);
  const materializedCase = validated.casesById.get(caseId);
  const planCase = plan.cases.find((entry) => entry.case_id === caseId);
  if (!materializedCase || !planCase) throw new Error(`selection case does not exist in the validated plan and materialization: ${caseId}`);
  if (materializedCase.condition !== "adaptive_ask") throw new Error(`${caseId} is not an Adaptive ASK case`);
  const adaptive = materializedCase.projection_evidence?.adaptive_projection;
  if (adaptive?.boundary_status !== "available_pre_selection" || adaptive.mechanisms_selected !== false || adaptive.selection_seal_produced !== false || adaptive.runtime_execution_attempted !== false) {
    throw new Error(`${caseId} is not at the Adaptive pre-selection boundary`);
  }
  const caseRoot = resolve(materializedRoot, caseId);
  assertNoResultArtifacts(caseRoot, caseId);
  return {
    plan,
    planCase,
    manifest: validated.manifest,
    manifestDigest: validated.manifestDigest,
    materializedRoot,
    materializedCase,
    caseRoot,
  };
}

function bindingFor(context) {
  const { plan, manifest, manifestDigest, materializedCase } = context;
  return {
    plan_id: plan.plan_id,
    plan_digest: canonicalDigest(plan),
    materialization_manifest_digest: manifestDigest,
    materialization_output_root_identity: manifest.output_root_identity,
    materializer: manifest.materializer,
    case_id: materializedCase.case_id,
    block_id: materializedCase.block_id,
    adapter: materializedCase.adapter,
    condition: materializedCase.condition,
    fixture: materializedCase.fixture,
    repetition: materializedCase.repetition,
    registered_repetitions: materializedCase.registered_repetitions,
    frozen_input_digest: materializedCase.frozen_input_digest,
    condition_projection_digest: materializedCase.condition_projection_digest,
    projection_fingerprint: materializedCase.projection_evidence.projection_fingerprint,
  };
}

function assertSelectionInputSemantics(input, context) {
  assertBenchmarkSchemaInstance(input, { schemaPath: resolve(context.root, ADAPTIVE_SELECTION_INPUT_SCHEMA_PATH), label: "Adaptive selection input" });
  const { materializedCase, planCase } = context;
  if (input.task_class !== planCase.task_class) throw new Error(`${materializedCase.case_id} selection task_class does not match the execution plan`);
  const projection = materializedCase.projection_evidence;
  const suppliedProjection = input.projection;
  for (const [field, actual, expected] of [
    ["adapter_track", suppliedProjection.adapter_track, materializedCase.adapter],
    ["profile", suppliedProjection.profile, projection.selected_profile],
    ["renderer_id", suppliedProjection.renderer_id, projection.renderer_id],
    ["renderer_version", suppliedProjection.renderer_version, projection.renderer_version],
    ["projection_fingerprint", suppliedProjection.projection_fingerprint, projection.projection_fingerprint],
  ]) {
    if (actual !== expected) throw new Error(`${materializedCase.case_id} selection projection ${field} does not match materialization`);
  }
  if (input.expected_evidence.length === 0) throw new Error("Adaptive selection must preserve at least one expected evidence item");
  if (input.selected_mechanisms.some((value) => input.skipped_mechanisms.includes(value))) throw new Error("selected and skipped mechanisms must not overlap");
  if (input.agents.requested.some((value) => input.agents.omitted.includes(value))) throw new Error("requested and omitted agents must not overlap");
  const downgradeCapabilities = input.capability_downgrades.map((entry) => entry.capability);
  if (new Set(downgradeCapabilities).size !== downgradeCapabilities.length) throw new Error("capability downgrades must not repeat a capability");
  if (downgradeCapabilities.some((capability) => input.selected_mechanisms.includes(capability))) throw new Error("an unavailable capability must not be represented as a selected mechanism");
  if (input.lightweight_bypass.used) {
    if (input.lightweight_bypass.reason.trim() === "") throw new Error("lightweight bypass requires a non-empty reason");
    if (input.selected_mechanisms.length !== 0) throw new Error("lightweight bypass must not claim selected mechanisms were applied");
    if (input.skipped_mechanisms.length === 0) throw new Error("lightweight bypass must record deliberately skipped mechanisms");
  } else if (input.selected_mechanisms.length === 0) {
    throw new Error("an empty selection is not a valid lightweight bypass");
  }
}

export function computeSelectionDigest(record) {
  const { selection_digest: _ignored, ...digestInput } = record;
  return sha256(stableCanonicalJson(digestInput));
}

function assertStateOutsideMaterialization(stateDir, materializedRoot) {
  const stateRoot = resolve(stateDir);
  const materialized = resolve(materializedRoot);
  if (stateRoot === materialized || stateRoot.startsWith(`${materialized}${sep}`)) throw new Error("selection state directory must stay outside all materialized case roots");
  return stateRoot;
}

function initializeStateRoot(stateDir, materializedRoot, { create }) {
  const stateRoot = assertStateOutsideMaterialization(stateDir, materializedRoot);
  assertNoSymlinkSegments(stateRoot, "selection state directory");
  if (existsSync(stateRoot)) {
    if (!lstatSync(stateRoot).isDirectory()) throw new Error("selection state directory must be absent or a directory");
  } else {
    if (!create) throw new Error("Adaptive selection state directory is missing");
    mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  }
  for (const name of readdirSync(stateRoot)) {
    if (![ADAPTIVE_SELECTION_STATE_INDEX_NAME, ADAPTIVE_SELECTION_DIRECTORY_NAME].includes(name)) throw new Error(`selection state directory contains an undeclared entry: ${name}`);
  }
  const selections = resolve(stateRoot, ADAPTIVE_SELECTION_DIRECTORY_NAME);
  assertNoSymlinkSegments(selections, "selection state directory");
  if (existsSync(selections)) {
    if (!lstatSync(selections).isDirectory()) throw new Error("selection state selections entry must be a directory");
  } else {
    if (!create) throw new Error("Adaptive selection state selections directory is missing");
    mkdirSync(selections, { recursive: false, mode: 0o700 });
  }
  return { stateRoot, indexPath: resolve(stateRoot, ADAPTIVE_SELECTION_STATE_INDEX_NAME), selections };
}

function stateIdentityFor(context) {
  const binding = bindingFor(context);
  return {
    schema_version: "1.0.0",
    plan_id: binding.plan_id,
    plan_digest: binding.plan_digest,
    materialization_manifest_digest: binding.materialization_manifest_digest,
    materialization_output_root_identity: binding.materialization_output_root_identity,
    materializer: binding.materializer,
    sealed_cases: {},
  };
}

function stableStateIndex(index) {
  return { ...index, sealed_cases: Object.fromEntries(Object.entries(index.sealed_cases).sort(([left], [right]) => left.localeCompare(right))) };
}

function assertStateIdentity(index, context) {
  assertBenchmarkSchemaInstance(index, { schemaPath: resolve(context.root, ADAPTIVE_SELECTION_STATE_SCHEMA_PATH), label: "Adaptive selection state index" });
  const expected = stateIdentityFor(context);
  for (const field of ["plan_id", "plan_digest", "materialization_manifest_digest", "materialization_output_root_identity", "materializer"]) {
    if (stableCanonicalJson(index[field]) !== stableCanonicalJson(expected[field])) throw new Error(`selection state belongs to a different materialization identity: ${field}`);
  }
}

function loadStateIndex(paths, context, { allowInitialize }) {
  assertNoSymlinkSegments(paths.indexPath, "selection state index");
  if (!existsSync(paths.indexPath)) {
    if (readdirSync(paths.selections).length > 0) throw new Error("selection state has records without its identity index");
    if (!allowInitialize) throw new Error("Adaptive selection state index is missing");
    return null;
  }
  if (!lstatSync(paths.indexPath).isFile()) throw new Error("selection state index must be a regular file");
  const index = readJson(paths.indexPath);
  assertStateIdentity(index, context);
  return index;
}

function writeStage(staging, name, value) {
  const path = resolve(staging, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return path;
}

function publishNewFile(stagedPath, destination) {
  linkSync(stagedPath, destination);
  unlinkSync(stagedPath);
  chmodSync(destination, 0o444);
}

function publishReplacement(stagedPath, destination) {
  renameSync(stagedPath, destination);
  chmodSync(destination, 0o444);
}

function assertSealedRecord(record, context) {
  assertBenchmarkSchemaInstance(record, { schemaPath: resolve(context.root, ADAPTIVE_SELECTION_SCHEMA_PATH), label: "sealed Adaptive selection" });
  const expectedBinding = bindingFor(context);
  for (const [field, expected] of Object.entries(expectedBinding)) {
    if (stableCanonicalJson(record[field]) !== stableCanonicalJson(expected)) throw new Error(`${context.materializedCase.case_id} sealed selection binding mismatch: ${field}`);
  }
  const expectedDigest = computeSelectionDigest(record);
  if (record.selection_digest.algorithm !== "sha256" || record.selection_digest.value !== expectedDigest) throw new Error(`${context.materializedCase.case_id} sealed selection digest mismatch`);
  const input = {
    task_class: record.task_class,
    observed_signals: record.observed_signals,
    selected_mechanisms: record.selected_mechanisms,
    skipped_mechanisms: record.skipped_mechanisms,
    required_gates: record.required_gates,
    agents: record.agents,
    expected_evidence: record.expected_evidence,
    capability_downgrades: record.capability_downgrades,
    lightweight_bypass: record.lightweight_bypass,
    projection: record.projection,
  };
  assertSelectionInputSemantics(input, context);
  assertRfc3339Timestamp(record.selected_at);
}

function loadSealedRecord(paths, context) {
  const index = loadStateIndex(paths, context, { allowInitialize: false });
  const stateEntry = index.sealed_cases[context.materializedCase.case_id];
  if (!stateEntry) throw new Error(`Adaptive selection is missing for ${context.materializedCase.case_id}`);
  const expectedPath = `${ADAPTIVE_SELECTION_DIRECTORY_NAME}/${context.materializedCase.case_id}.json`;
  if (stateEntry.selection_path !== expectedPath) throw new Error("selection state index has an invalid selection path");
  const path = selectionPath(paths.stateRoot, context.materializedCase.case_id);
  assertNoSymlinkSegments(path, "sealed selection path");
  if (!existsSync(path)) throw new Error(`selection state index records a prior seal but its file is missing: ${context.materializedCase.case_id}`);
  if (!lstatSync(path).isFile()) throw new Error("sealed selection path must be a regular file");
  const record = readJson(path);
  assertSealedRecord(record, context);
  if (stateEntry.selection_digest !== record.selection_digest.value) throw new Error("selection state index digest does not match the sealed selection");
  return { index, record, path };
}

export function sealAdaptiveSelection({ root, config, planPath, materializedPath, stateDir, caseId, input, repositoryRevision, now = () => new Date().toISOString(), testSelectedAt = null }) {
  if (!stateDir) throw new Error("seal-selection requires --state-dir");
  const context = { ...selectionContext({ root, config, planPath, materializedPath, repositoryRevision, caseId }), root };
  assertSelectionInputSemantics(input, context);
  const paths = initializeStateRoot(stateDir, context.materializedRoot, { create: true });
  let index = loadStateIndex(paths, context, { allowInitialize: true });
  const target = selectionPath(paths.stateRoot, caseId);
  assertNoSymlinkSegments(target, "sealed selection path");
  if (index?.sealed_cases[caseId]) {
    if (!existsSync(target)) throw new Error(`selection state index records a prior seal but its file is missing: ${caseId}`);
    throw new Error(`Adaptive selection is already sealed for ${caseId}`);
  }
  if (existsSync(target)) throw new Error(`selection file already exists without a matching state-index entry: ${caseId}`);

  if (!index) {
    index = stateIdentityFor(context);
    const initialStaging = mkdtempSync(resolve(paths.stateRoot, ".selection-state-staging-"));
    try {
      publishReplacement(writeStage(initialStaging, ADAPTIVE_SELECTION_STATE_INDEX_NAME, stableStateIndex(index)), paths.indexPath);
    } finally {
      rmSync(initialStaging, { recursive: true, force: true });
    }
  }
  const selectedAt = assertRfc3339Timestamp(testSelectedAt ?? now());
  const record = {
    schema_version: "2.0.0",
    ...bindingFor(context),
    ...input,
    selected_at: selectedAt,
    selection_digest: { algorithm: "sha256", value: "" },
  };
  record.selection_digest.value = computeSelectionDigest(record);
  assertSealedRecord(record, context);
  const nextIndex = stableStateIndex({
    ...index,
    sealed_cases: {
      ...index.sealed_cases,
      [caseId]: { selection_digest: record.selection_digest.value, selection_path: `${ADAPTIVE_SELECTION_DIRECTORY_NAME}/${caseId}.json` },
    },
  });
  assertStateIdentity(nextIndex, context);

  const staging = mkdtempSync(resolve(paths.stateRoot, ".selection-seal-staging-"));
  let selectionPublished = false;
  try {
    const stagedSelection = writeStage(staging, `${caseId}.json`, record);
    const stagedIndex = writeStage(staging, ADAPTIVE_SELECTION_STATE_INDEX_NAME, nextIndex);
    publishNewFile(stagedSelection, target);
    selectionPublished = true;
    publishReplacement(stagedIndex, paths.indexPath);
    return record;
  } catch (error) {
    if (selectionPublished) rmSync(target, { force: true });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function verifyAdaptiveSelection({ root, config, planPath, materializedPath, stateDir, caseId, repositoryRevision }) {
  if (!stateDir) throw new Error("verify-selection requires --state-dir");
  const context = { ...selectionContext({ root, config, planPath, materializedPath, repositoryRevision, caseId }), root };
  const paths = initializeStateRoot(stateDir, context.materializedRoot, { create: false });
  const sealed = loadSealedRecord(paths, context);
  assertNoResultArtifacts(context.caseRoot, caseId);
  return sealed.record;
}
