#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  exportAssetRegistryReference,
  registerAsset,
  resolveAsset,
  verifyAssetRegistry,
} from "./asset-registry.mjs";
import {
  computePromptV2AuthorityBindingDigest,
  loadPromptV2Preregistration,
  validatePromptV2AuthorityBinding,
} from "./ask-benchmark-prompt-v2.mjs";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import {
  assertNoSymlinkPathSegments,
  canonicalDigest,
  listContentAddressedJson,
  readContentAddressedJson,
  readJsonFileStrict,
} from "./content-addressed-store.mjs";
import {
  buildEvolutionCandidate,
  buildEvolutionExperiment,
  computePromptV2ExactProjectionDigests,
  publishEvolutionCandidate,
  publishEvolutionExperiment,
  verifyEvolutionCandidate,
  verifyEvolutionExperiment,
} from "./evolution-loop.mjs";
import {
  applyPortfolioTransitions,
  buildPortfolioAuthorityContext,
  buildPortfolioSelectionContext,
  createEmptyPortfolioLock,
  publishPortfolioManifest,
  resolvePortfolioSelection,
  verifyPortfolioLock,
  verifyPortfolioSelection,
} from "./portfolio-manager.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultFixtureRoot = resolve(repositoryRoot, "docs/fixtures/prompt-v2-preregistration");
const canonicalAssetFixtureRoot = resolve(repositoryRoot, "docs/fixtures/asset-registry");
const portablePathPattern = /^(?!(?:.*\/)?\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const gitPattern = /^[a-f0-9]{40}$/u;
const REPOSITORY_ID = "github.com/ist-h-i/agent-spectrum-kernel";
const REGISTRY_ID = "ask-local-assets";
const SCOPE_ID = "agent-spectrum-kernel";
const FIXTURE_PATH = "docs/fixtures/prompt-v2-preregistration";
const PREREGISTRATION_PATH = "benchmarks/prompt-v2-preregistration.json";
const EVALUATOR_STABLE_ID = "ask.evaluator-reference.prompt-v2-public-set";
const FORBIDDEN_OBJECT_KINDS = new Set([
  "evolution_recommendation",
  "evolution_action_proposal",
  "evolution_human_decision",
  "evolution_application_receipt",
  "result",
  "asset_lifecycle_authority_context",
]);
const ALLOWED_OBJECT_KINDS = new Set([
  "asset_content_package",
  "asset_record",
  "asset_registry_snapshot",
  "portfolio_manifest",
  "portfolio_lock",
  "portfolio_authority_context",
  "portfolio_selection_context",
  "portfolio_selection",
  "evolution_candidate",
  "evolution_experiment",
]);

export const PROMPT_V2_PREREGISTRATION_RENDERED_ROOT = "docs/fixtures/prompt-v2-preregistration/rendered";
export const PROMPT_V2_SOURCE_REVISION = "c508a767f3386dac10180770edf37a67806fbb1b";
export const PROMPT_V2_SOURCE_TREE = "d7d377c1265f0fb47119bfc80a2f3eb9535cf163";

const adapterDefinitions = Object.freeze([
  Object.freeze({
    adapter: "claude_code",
    baselineSourceRoot: "docs/fixtures/claude-pre-fixed-commands",
    buildPlan: () => buildClaudeProjectionPlan({ profileName: "full" }),
  }),
  Object.freeze({
    adapter: "codex",
    baselineSourceRoot: "docs/fixtures/codex-pre-compact-prompts",
    buildPlan: () => buildCodexProjectionPlan({ profileName: "full" }),
  }),
]);

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertPortablePath(path, label) {
  if (typeof path !== "string" || isAbsolute(path) || path.includes("\\") || !portablePathPattern.test(path)) {
    throw new Error(`${label} must be a portable repository-relative path`);
  }
}

function renderedAdapterArchive(definition) {
  const plan = definition.buildPlan();
  assert.equal(plan.renderer_profile, "full", `${definition.adapter} renderer profile drifted`);
  assert.ok(plan.compactProfileArtifacts.length > 0, `${definition.adapter} renderer produced no fixed-entry artifacts`);
  const names = new Set();
  const artifacts = plan.compactProfileArtifacts.map((artifact) => {
    const name = artifact?.metadata?.prompt_name;
    assertPortablePath(name, `${definition.adapter} rendered prompt name`);
    if (name.includes("/")) throw new Error(`${definition.adapter} rendered prompt name must be a single file name`);
    if (names.has(name)) throw new Error(`${definition.adapter} renderer produced duplicate prompt ${name}`);
    names.add(name);
    const path = `${definition.adapter}/${name}`;
    const bytes = Buffer.from(artifact.content, "utf8");
    const digest = rawDigest(bytes);
    if (artifact.metadata.rendered_sha256 !== digest) throw new Error(`${definition.adapter} renderer metadata digest drifted for ${name}`);
    if (artifact.metadata.rendered_bytes !== bytes.length) throw new Error(`${definition.adapter} renderer metadata byte length drifted for ${name}`);
    return {
      path,
      bytes,
      reference: {
        path,
        media_type: "text/markdown; charset=utf-8",
        byte_length: bytes.length,
        raw_digest: digest,
      },
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  return {
    reference: {
      adapter: definition.adapter,
      renderer_id: plan.renderer_id,
      renderer_version: plan.renderer_version,
      renderer_input_digest: plan.renderer_inputs_digest,
      fingerprint: plan.fingerprint,
      canonical_source_digest: plan.canonical_source_digest,
      baseline_source_root: definition.baselineSourceRoot,
      files: artifacts.map(({ reference }) => reference),
    },
    artifacts,
  };
}

export function buildPromptV2RenderedArchive() {
  const rendered = adapterDefinitions.map(renderedAdapterArchive);
  const basis = {
    schema_version: "1.0.0",
    object_kind: "prompt_v2_rendered_source_archive",
    renderer_profile: "full",
    adapters: rendered.map(({ reference }) => reference),
    runtime_application_implied: false,
    results_accessed: false,
    measured_output_included: false,
    private_evaluator_content_included: false,
  };
  const reference = {
    ...basis,
    archive_digest: canonicalDigest(basis),
  };
  const files = new Map(rendered.flatMap(({ artifacts }) => artifacts.map(({ path, bytes }) => [path, bytes])));
  return { reference, files };
}

function expectedArchiveFiles(generated) {
  return [...generated.files.keys(), "reference.json"].sort();
}

function listArchiveFiles(renderedRoot) {
  assertNoSymlinkPathSegments(renderedRoot, "Prompt v2 rendered archive root");
  if (!lstatSync(renderedRoot).isDirectory()) throw new Error("Prompt v2 rendered archive root must be a directory");
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(renderedRoot, absolute).split(sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`Prompt v2 rendered archive contains an unsupported entry or symlink: ${path}`);
    }
  }
  visit(renderedRoot);
  return files.sort();
}

function generatedBytes(generated, path) {
  return path === "reference.json" ? jsonBytes(generated.reference) : generated.files.get(path);
}

export function checkPromptV2RenderedArchive({ fixtureRoot = defaultFixtureRoot } = {}) {
  const generated = buildPromptV2RenderedArchive();
  const renderedRoot = resolve(fixtureRoot, "rendered");
  if (!existsSync(renderedRoot)) throw new Error("Prompt v2 rendered archive is missing");
  const expected = expectedArchiveFiles(generated);
  assert.deepEqual(listArchiveFiles(renderedRoot), expected, "Prompt v2 rendered archive inventory drifted");
  for (const path of expected) {
    const expectedBytes = generatedBytes(generated, path);
    assert.ok(expectedBytes, `Prompt v2 rendered archive generator omitted ${path}`);
    assert.deepEqual(readFileSync(resolve(renderedRoot, path)), expectedBytes, `${path} drifted from the exact renderer output`);
  }
  return generated.reference;
}

export function writePromptV2RenderedArchive({ fixtureRoot = defaultFixtureRoot } = {}) {
  const generated = buildPromptV2RenderedArchive();
  const renderedRoot = resolve(fixtureRoot, "rendered");
  assertNoSymlinkPathSegments(renderedRoot, "Prompt v2 rendered archive root", { allowMissingLeaf: true });
  if (existsSync(renderedRoot)) {
    const expectedSet = new Set(expectedArchiveFiles(generated));
    for (const path of listArchiveFiles(renderedRoot)) {
      if (!expectedSet.has(path)) throw new Error(`Prompt v2 rendered archive inventory has an extra file: ${path}`);
    }
  }
  mkdirSync(renderedRoot, { recursive: true });
  assertNoSymlinkPathSegments(renderedRoot, "Prompt v2 rendered archive root");
  for (const path of [...generated.files.keys()].sort()) {
    const target = resolve(renderedRoot, path);
    assertNoSymlinkPathSegments(target, `Prompt v2 rendered archive file ${path}`, { allowMissingLeaf: true });
    mkdirSync(dirname(target), { recursive: true });
    assertNoSymlinkPathSegments(dirname(target), `Prompt v2 rendered archive directory ${dirname(path)}`);
    if (existsSync(target) && !lstatSync(target).isFile()) throw new Error(`Prompt v2 rendered archive target is not a regular file: ${path}`);
    writeFileSync(target, generated.files.get(path));
  }
  const referencePath = resolve(renderedRoot, "reference.json");
  assertNoSymlinkPathSegments(referencePath, "Prompt v2 rendered archive reference", { allowMissingLeaf: true });
  if (existsSync(referencePath) && !lstatSync(referencePath).isFile()) throw new Error("Prompt v2 rendered archive reference is not a regular file");
  writeFileSync(referencePath, jsonBytes(generated.reference));
  checkPromptV2RenderedArchive({ fixtureRoot });
  return generated.reference;
}

function assertDigest(value, label) {
  if (!digestPattern.test(value ?? "")) throw new Error(`${label} must be a sha256 digest`);
}

function assertGitIdentity(value, label) {
  if (!gitPattern.test(value ?? "")) throw new Error(`${label} must be a 40-character git identity`);
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

function exactPortfolioRef(publication, lockDigest = null) {
  const reference = {
    portfolio_id: publication.portfolio_id,
    revision: publication.revision,
    manifest_digest: publication.manifest_digest,
    asset_set_digest: publication.asset_set_digest,
  };
  return lockDigest === null ? reference : { ...reference, lock_digest: lockDigest };
}

function rawFile(path, sourceRoot, mediaType = "text/markdown; charset=utf-8") {
  assertPortablePath(path, "source file path");
  const bytes = readFileSync(resolve(sourceRoot, path));
  return { path, media_type: mediaType, raw_digest: rawDigest(bytes) };
}

function byteInventory(root) {
  assertNoSymlinkPathSegments(root, "fixture inventory root");
  if (!lstatSync(root).isDirectory()) throw new Error("fixture inventory root must be a directory");
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const bytes = readFileSync(absolute);
        files.push({ path, byte_length: bytes.length, raw_digest: rawDigest(bytes) });
      } else throw new Error(`fixture inventory contains an unsupported entry or symlink: ${path}`);
    }
  }
  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function without(value, fields) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
}

function validateRenderedArchiveReference(reference) {
  if (reference?.schema_version !== "1.0.0" || reference.object_kind !== "prompt_v2_rendered_source_archive" || reference.renderer_profile !== "full") {
    throw new Error("Prompt v2 rendered archive reference kind/version/profile drifted");
  }
  if (reference.archive_digest !== canonicalDigest(without(reference, ["archive_digest"]))) throw new Error("Prompt v2 rendered archive digest mismatch");
  if (reference.runtime_application_implied !== false || reference.results_accessed !== false || reference.measured_output_included !== false || reference.private_evaluator_content_included !== false) {
    throw new Error("Prompt v2 rendered archive crosses a result/private/runtime boundary");
  }
  assert.deepEqual(reference.adapters.map(({ adapter }) => adapter), ["claude_code", "codex"]);
  for (const adapter of reference.adapters) {
    if (!adapter.renderer_id || !adapter.renderer_version) throw new Error(`${adapter.adapter} rendered archive renderer identity is incomplete`);
    for (const field of ["renderer_input_digest", "fingerprint", "canonical_source_digest"]) assertDigest(adapter[field], `${adapter.adapter} rendered archive ${field}`);
    assertPortablePath(adapter.baseline_source_root, `${adapter.adapter} baseline source root`);
    const sorted = [...adapter.files].sort((left, right) => left.path.localeCompare(right.path));
    assert.deepEqual(adapter.files, sorted, `${adapter.adapter} rendered archive files are not ordered`);
    for (const file of adapter.files) {
      assertPortablePath(file.path, `${adapter.adapter} rendered archive file`);
      assertDigest(file.raw_digest, `${adapter.adapter} rendered archive file digest`);
      if (!Number.isInteger(file.byte_length) || file.byte_length <= 0) throw new Error(`${file.path} rendered archive byte length is invalid`);
    }
  }
  return reference;
}

function verifyRenderedArchiveFiles({ fixtureRoot }) {
  const renderedRoot = resolve(fixtureRoot, "rendered");
  const reference = validateRenderedArchiveReference(readJsonFileStrict(resolve(renderedRoot, "reference.json"), "Prompt v2 rendered archive reference"));
  const expected = reference.adapters.flatMap(({ files }) => files).sort((left, right) => left.path.localeCompare(right.path));
  const actual = byteInventory(renderedRoot);
  assert.deepEqual(actual.map(({ path }) => path), [...expected.map(({ path }) => path), "reference.json"].sort(), "Prompt v2 rendered archive file inventory drifted");
  for (const file of expected) {
    const actualFile = actual.find(({ path }) => path === file.path);
    assert.deepEqual(actualFile, { path: file.path, byte_length: file.byte_length, raw_digest: file.raw_digest }, `${file.path} rendered source drifted`);
  }
  return {
    reference,
    inventory: actual,
    inventory_digest: canonicalDigest(actual),
  };
}

function withDetachedSource({ sourceRevision, sourceTree }, callback) {
  assertGitIdentity(sourceRevision, "Prompt v2 source revision");
  assertGitIdentity(sourceTree, "Prompt v2 source tree");
  const temporaryRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-prompt-v2-source-")));
  const sourceRoot = resolve(temporaryRoot, "source");
  let added = false;
  try {
    execFileSync("git", ["worktree", "add", "--detach", sourceRoot, sourceRevision], { cwd: repositoryRoot, stdio: "pipe" });
    added = true;
    const actualRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
    const actualTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: sourceRoot, encoding: "utf8" }).trim();
    if (actualRevision !== sourceRevision || actualTree !== sourceTree) throw new Error("Prompt v2 detached source revision/tree mismatch");
    if (execFileSync("git", ["status", "--porcelain"], { cwd: sourceRoot, encoding: "utf8" }) !== "") throw new Error("Prompt v2 detached source worktree is not clean");
    return callback({ sourceRoot, temporaryRoot });
  } finally {
    if (added) execFileSync("git", ["worktree", "remove", "--force", sourceRoot], { cwd: repositoryRoot, stdio: "pipe" });
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function verifySourceArchiveReproduction({ sourceRoot, scratchRoot }) {
  const outputRoot = resolve(scratchRoot, "renderer-reproduction");
  execFileSync(process.execPath, [
    resolve(sourceRoot, "scripts/prompt-v2-preregistration-samples.mjs"),
    "--write-rendered",
    "--output-root",
    outputRoot,
  ], { cwd: sourceRoot, stdio: "pipe" });
  const archived = byteInventory(resolve(sourceRoot, PROMPT_V2_PREREGISTRATION_RENDERED_ROOT));
  const reproduced = byteInventory(resolve(outputRoot, "rendered"));
  assert.deepEqual(reproduced, archived, "source A renderer reproduction differs from the archived exact bytes");
  return verifyRenderedArchiveFiles({ fixtureRoot: outputRoot });
}

function bounded(included) {
  return { status: "bounded", included, excluded: [] };
}

function assetDescriptorBase({ assetType, stableId, version, versionScheme, typeExtension, files, dependencies, derivation, rollbackTarget, adapters, models, runtimeProfiles, sourceRevision, note }) {
  return {
    schema_version: "1.0.0",
    asset_type: assetType,
    stable_id: stableId,
    version,
    version_scheme: versionScheme,
    type_extension: typeExtension,
    content: { package_format: "canonical_json_base64_files", files },
    source: { kind: "git_repository", repository_id: REPOSITORY_ID, revision: sourceRevision },
    provenance: {
      origin: "repository_file",
      license: { status: "unknown", spdx_id: null, evidence_ref: null },
      owner: { status: "unknown", owner_id: null, evidence_ref: null },
    },
    derivation,
    dependencies,
    compatibility: { asset_contract_versions: ["1.0.0"], runtime_profiles: runtimeProfiles },
    applicability: {
      models: bounded(models),
      adapters: bounded(adapters),
      stacks: bounded(["prompt_v2_preregistration"]),
      domains: bounded(["ai_engineering"]),
      projects: bounded([REPOSITORY_ID]),
      task_classes: bounded(["implementation", "review", "verification"]),
      included_scopes: ["prompt_v2_preregistration"],
      excluded_scopes: ["automatic_portfolio_activation", "measured_prompt_v2_execution"],
      required_capabilities: [],
      notes: [note],
    },
    permissions_and_effects: {
      status: "supported",
      requested_permissions: [],
      possible_effects: [],
      permission_refs: [canonicalDigest({ source_revision: sourceRevision, constraint: "result_blind_preregistration_no_permissions" })],
      effect_refs: [],
    },
    safety: {
      status: "supported",
      classifications: ["pre_result_authority_only"],
      constraint_refs: [canonicalDigest({ source_revision: sourceRevision, constraint: "result_blind_preregistration_no_activation" })],
    },
    mechanism_and_evidence: { status: "not_evaluated", mechanism_refs: [], evidence_refs: [] },
    evaluation_history: { status: "not_evaluated", evidence_refs: [], cost: null },
    maintenance: {
      stale_status: "fresh",
      refresh_conditions: ["Source revision, exact rendered inventory, or preregistration authority changes."],
      regression_refs: [],
      retirement: null,
      rollback: { status: "requires_explicit_authority", target: rollbackTarget, authority_ref: null },
    },
  };
}

function projectionIdentity({ adapter, rendererId, rendererVersion, rendererInputDigest, files }) {
  const inventory = files.map(({ path, raw_digest }) => ({ path, raw_digest })).sort((left, right) => left.path.localeCompare(right.path));
  const inventoryDigest = canonicalDigest(inventory);
  return {
    type_extension: {
      kind: "rendered_prompt_bundle",
      adapter,
      entrypoints: inventory.map(({ path }) => path),
      renderer: { id: rendererId, version: rendererVersion, input_digest: rendererInputDigest, projection_digest: inventoryDigest },
      runtime_application_implied: false,
    },
    projection: {
      renderer_id: rendererId,
      renderer_version: rendererVersion,
      renderer_input_digest: rendererInputDigest,
      rendered_bundle_digest: canonicalDigest({ schema_version: "1.0.0", adapter, renderer_input_digest: rendererInputDigest, inventory }),
      inventory_digest: inventoryDigest,
    },
  };
}

function registerPromptV2Assets({ storeRoot, sourceRoot, preregistration, renderedArchive }) {
  const foundationReference = readJsonFileStrict(resolve(sourceRoot, "docs/fixtures/asset-registry/reference.json"), "Prompt v2 Asset foundation reference");
  const foundationAssets = [preregistration.canonical_prompt_v2.policy_asset, preregistration.canonical_prompt_v2.prompt_asset]
    .map((asset) => structuredClone(asset))
    .sort((left, right) => left.stable_id.localeCompare(right.stable_id));
  const foundationBinding = {
    asset_binding_digest: canonicalDigest({ schema_version: "1.0.0", assets: foundationAssets }),
  };
  if (foundationReference.snapshot_digest !== preregistration.canonical_prompt_v2.registry_snapshot_digest || foundationBinding.asset_binding_digest !== preregistration.canonical_prompt_v2.asset_binding_digest) {
    throw new Error("Prompt v2 canonical Prompt/policy foundation identity drifted");
  }
  const foundationRegistry = verifyAssetRegistry({ storeRoot, snapshotDigest: foundationReference.snapshot_digest });
  for (const expected of [preregistration.canonical_prompt_v2.prompt_asset, preregistration.canonical_prompt_v2.policy_asset]) {
    const actual = foundationRegistry.assets.find(({ stable_id: stableId, version }) => stableId === expected.stable_id && version === expected.version);
    assert.deepEqual(exactAssetRef(actual), expected, `canonical ${expected.stable_id} exact reference drifted`);
  }
  let snapshotDigest = foundationReference.snapshot_digest;
  const register = (descriptor) => {
    const publication = registerAsset({ storeRoot, sourceRoot, predecessorSnapshotDigest: snapshotDigest, descriptor });
    snapshotDigest = publication.snapshot_digest;
    return resolveAsset({ storeRoot, snapshotDigest, stableId: descriptor.stable_id, version: descriptor.version, state: "candidate" });
  };
  const preregistrationFile = rawFile(PREREGISTRATION_PATH, sourceRoot, "application/json");
  const evaluator = register(assetDescriptorBase({
    assetType: "evaluator_reference",
    stableId: EVALUATOR_STABLE_ID,
    version: `git:${PROMPT_V2_SOURCE_REVISION}`,
    versionScheme: "git_revision",
    typeExtension: { kind: "public_evaluator_reference", fixture_id: "prompt-v2-public-evaluator-set", entrypoint: PREREGISTRATION_PATH, private_evaluator_content_included: false },
    files: [preregistrationFile],
    dependencies: [],
    derivation: { kind: "root", parent: null, delta: null },
    rollbackTarget: null,
    adapters: ["claude_code", "codex"],
    models: ["gpt-5.6-sol", "unavailable"],
    runtimeProfiles: [],
    sourceRevision: PROMPT_V2_SOURCE_REVISION,
    note: "Answer-free public evaluator-set identity only; no evaluator content is included.",
  }));
  const tracks = [];
  for (const track of preregistration.prompt_tracks) {
    const selectorAdapter = track.adapter_track === "claude" ? "claude_code" : track.adapter_track;
    const model = track.adapter_track === "claude" ? "unavailable" : "gpt-5.6-sol";
    const archive = renderedArchive.reference.adapters.find(({ adapter }) => adapter === selectorAdapter);
    if (!archive) throw new Error(`${track.adapter_track} rendered source archive is missing`);
    if (archive.renderer_id !== track.renderer.renderer_id || archive.renderer_version !== track.renderer.renderer_version) throw new Error(`${track.adapter_track} renderer archive identity differs from preregistration`);
    const baselineFiles = track.current_source_files.map(({ path, raw_byte_digest }) => {
      const file = rawFile(path, sourceRoot);
      if (file.raw_digest !== raw_byte_digest) throw new Error(`${track.adapter_track} baseline source digest drifted: ${path}`);
      return file;
    });
    const candidateFiles = archive.files.map(({ path, raw_digest }) => {
      const sourcePath = `${PROMPT_V2_PREREGISTRATION_RENDERED_ROOT}/${path}`;
      const file = rawFile(sourcePath, sourceRoot);
      if (file.raw_digest !== raw_digest) throw new Error(`${track.adapter_track} candidate rendered source digest drifted: ${sourcePath}`);
      return file;
    });
    const baselineInputDigest = canonicalDigest({ source_revision: track.current_source_revision, files: baselineFiles.map(({ path, raw_digest }) => ({ path, raw_digest })) });
    const baselineProjection = projectionIdentity({ adapter: selectorAdapter, rendererId: track.renderer.renderer_id, rendererVersion: track.renderer.renderer_version, rendererInputDigest: baselineInputDigest, files: baselineFiles });
    const baseline = register(assetDescriptorBase({
      assetType: "prompt",
      stableId: track.stable_asset_id,
      version: "234.0.0-current",
      versionScheme: "semantic",
      typeExtension: baselineProjection.type_extension,
      files: baselineFiles,
      dependencies: [],
      derivation: { kind: "root", parent: null, delta: null },
      rollbackTarget: null,
      adapters: [selectorAdapter],
      models: [model],
      runtimeProfiles: [selectorAdapter === "codex" ? "codex-compact-v1" : "claude-fixed-v1"],
      sourceRevision: PROMPT_V2_SOURCE_REVISION,
      note: `Exact ${track.adapter_track} current Prompt bundle retained as the result-blind baseline.`,
    }));
    const baselineRef = exactAssetRef(baseline);
    const candidateProjection = projectionIdentity({ adapter: selectorAdapter, rendererId: archive.renderer_id, rendererVersion: archive.renderer_version, rendererInputDigest: archive.renderer_input_digest, files: candidateFiles });
    const candidate = register(assetDescriptorBase({
      assetType: "prompt",
      stableId: track.stable_asset_id,
      version: "234.0.0-prompt-v2",
      versionScheme: "semantic",
      typeExtension: candidateProjection.type_extension,
      files: candidateFiles,
      dependencies: [preregistration.canonical_prompt_v2.prompt_asset, preregistration.canonical_prompt_v2.policy_asset],
      derivation: { kind: "full_content_revision", parent: baselineRef, delta: { kind: "replacement", summary: "Replace the exact current adapter Prompt bundle with the exact archived Prompt v2 full-content bundle." } },
      rollbackTarget: baselineRef,
      adapters: [selectorAdapter],
      models: [model],
      runtimeProfiles: [selectorAdapter === "codex" ? "codex-compact-v1" : "claude-fixed-v1"],
      sourceRevision: PROMPT_V2_SOURCE_REVISION,
      note: `Exact ${track.adapter_track} Prompt v2 candidate bundle; registration does not imply activation or quality.`,
    }));
    tracks.push({
      adapterTrack: track.adapter_track,
      selectorAdapter,
      model,
      track,
      baseline: exactAssetRef(baseline),
      candidate: exactAssetRef(candidate),
      baselineProjection: baselineProjection.projection,
      candidateProjection: candidateProjection.projection,
    });
  }
  const registryReference = exportAssetRegistryReference({ storeRoot, snapshotDigest });
  return { foundationReference, foundationBinding, evaluator: exactAssetRef(evaluator), tracks, registryReference };
}

function selectorVocabulary({ selectorAdapter, model }) {
  return {
    task_classes: bounded(["verification"]),
    projects: bounded([REPOSITORY_ID]),
    models: bounded([model]),
    adapters: bounded([selectorAdapter]),
    stacks: bounded(["prompt_v2_preregistration"]),
    domains: bounded(["ai_engineering"]),
    capabilities: bounded(["prompt_v2_exact_projection"]),
    risk_classes: bounded(["ordinary"]),
  };
}

function selectionAllowlist({ selectorAdapter, model }) {
  return {
    task_classes: ["implementation", "review", "verification"],
    projects: [REPOSITORY_ID],
    models: [model],
    adapters: [selectorAdapter],
    stacks: ["prompt_v2_preregistration"],
    domains: ["ai_engineering"],
    risk_classes: ["ordinary"],
    capabilities: ["prompt_v2_exact_projection"],
    operation_scopes: ["automatic_portfolio_activation", "measured_prompt_v2_execution", "prompt_v2_preregistration"],
  };
}

function known(value) {
  return { status: "known", value };
}

function unbounded() {
  return { status: "unbounded", maximum: null };
}

function portfolioEntry({ adapterTrack, selectorAdapter, model, asset, roleName }) {
  return {
    entry_id: `${adapterTrack}-${roleName}-prompt-bundle`,
    role: "experimental",
    assurance_lane: "exploratory",
    asset,
    expected_registry_state: "candidate",
    expected_scope_id: SCOPE_ID,
    selectors: selectorVocabulary({ selectorAdapter, model }),
    exposure: { mode: "shadow", canary_percent: null },
    prohibited_task_classes: [],
    activation_requirement: "portfolio_activation",
    evidence_requirement_ids: [],
    cost_estimate: { token_count: known(1), duration_ms: known(1), cost_microunits: known(0) },
    failure_actions: {
      inapplicable: "stop",
      capability_missing: "stop",
      prohibited_task: "stop",
      evidence_missing: "stop",
      evidence_stale: "stop",
      evidence_conflict: "stop",
      safety_unknown: "stop",
    },
  };
}

function portfolioManifestDraft({ sourceRoot, preregistration, registryReference, track, asset, revision, roleName, rollbackTarget }) {
  return {
    schema_version: "1.0.0",
    object_kind: "portfolio_manifest",
    portfolio_id: `ask.portfolio.prompt-v2.${track.adapterTrack}`,
    revision,
    source_revision: PROMPT_V2_SOURCE_REVISION,
    repository_id: REPOSITORY_ID,
    scope_id: SCOPE_ID,
    kernel_foundation: {
      kind: "canonical_kernel",
      source_revision: PROMPT_V2_SOURCE_REVISION,
      source_path: "AGENTS.md",
      content_digest: rawDigest(readFileSync(resolve(sourceRoot, "AGENTS.md"))),
    },
    registry: {
      registry_id: registryReference.registry_id,
      repository_id: registryReference.repository_id,
      scope_id: registryReference.scope_id,
      snapshot_revision: registryReference.snapshot_revision,
      snapshot_digest: registryReference.snapshot_digest,
    },
    selectors: selectorVocabulary(track),
    selection_context_allowlist: selectionAllowlist(track),
    entries: [portfolioEntry({ ...track, asset, roleName })],
    evidence_requirements: [],
    selection_policy: { portfolio_inapplicable_action: "stop", selector_conflict_action: "stop", empty_selection_action: "stop" },
    budgets: {
      policy_limits: { token_count: unbounded(), duration_ms: unbounded(), cost_microunits: unbounded() },
      unknown_value_action: "stop",
      exceeded_action: "stop",
    },
    safety_guardrails: { unknown_safety_action: "stop", high_impact_without_approval_action: "stop", prohibited_effects: [] },
    unresolved_conflicts: [],
    rollback: rollbackTarget === null
      ? { mode: "none", target: null, required_authority_kind: "external_portfolio_rollback_authority" }
      : { mode: "exact", target: rollbackTarget, required_authority_kind: "external_portfolio_rollback_authority" },
    benchmark_compatibility: [{
      condition_id: preregistration.raw_scoring.condition,
      config_path: PREREGISTRATION_PATH,
      config_digest: rawDigest(readFileSync(resolve(sourceRoot, PREREGISTRATION_PATH))),
      frozen_results_mutated: false,
    }],
  };
}

function portfolioAuthority(adapterTrack, phase) {
  const identity = {
    adapter_track: adapterTrack,
    phase,
    source_revision: PROMPT_V2_SOURCE_REVISION,
    scope: "result_blind_shadow_preregistration",
  };
  return {
    kind: "external_portfolio_activation_authority",
    authority_id: `ask.prompt-v2.${adapterTrack}.${phase}-portfolio-authority`,
    authority_revision: PROMPT_V2_SOURCE_REVISION,
    authority_evidence_digest: canonicalDigest(identity),
  };
}

function portfolioSelectionContext({ track, lockDigest }) {
  const treeDigest = canonicalDigest({ source_revision: PROMPT_V2_SOURCE_REVISION, git_tree: PROMPT_V2_SOURCE_TREE });
  return buildPortfolioSelectionContext({
    schema_version: "1.0.0",
    object_kind: "portfolio_selection_context",
    selection_phase: "pre_result",
    portfolio_lock_digest: lockDigest,
    repository_id: REPOSITORY_ID,
    project_id: REPOSITORY_ID,
    source_revision: PROMPT_V2_SOURCE_REVISION,
    tree_digest: treeDigest,
    task_class: "verification",
    model: track.model,
    adapter: track.selectorAdapter,
    stack: "prompt_v2_preregistration",
    domain: "ai_engineering",
    risk_class: "ordinary",
    capabilities: ["prompt_v2_exact_projection"],
    operation_scopes: ["prompt_v2_preregistration"],
    available_budget: { token_count: known(100000), duration_ms: known(900000), cost_microunits: known(1000000) },
    current_state_refs: [{ state_id: "repository-tree", state_digest: treeDigest }],
  });
}

function buildTrackPortfolios({ storeRoot, sourceRoot, preregistration, registryReference, track }) {
  const portfolioId = `ask.portfolio.prompt-v2.${track.adapterTrack}`;
  const empty = createEmptyPortfolioLock({ storeRoot, portfolioId, repositoryId: REPOSITORY_ID, scopeId: SCOPE_ID });
  const baselinePublication = publishPortfolioManifest({
    storeRoot,
    draft: portfolioManifestDraft({
      sourceRoot,
      preregistration,
      registryReference,
      track,
      asset: track.baseline,
      revision: "prompt-v2-baseline-v1",
      roleName: "baseline",
      rollbackTarget: null,
    }),
  });
  const baselineRef = exactPortfolioRef(baselinePublication);
  const baselineContext = buildPortfolioAuthorityContext({
    portfolioId,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: empty.lock_digest,
    transitions: [{ manifest: baselineRef, from_state: null, to_state: "current" }],
    authority: portfolioAuthority(track.adapterTrack, "baseline"),
  });
  const baselineLock = applyPortfolioTransitions({ storeRoot, predecessorLockDigest: empty.lock_digest, authorityContext: baselineContext });
  const baselineSelector = portfolioSelectionContext({ track, lockDigest: baselineLock.lock_digest });
  const baselineSelection = resolvePortfolioSelection({
    storeRoot,
    lockDigest: baselineLock.lock_digest,
    selectorContext: baselineSelector,
    trustedPortfolioAuthorityContexts: [baselineContext],
  });
  if (baselineSelection.selection.decision !== "selected") throw new Error(`${track.adapterTrack} baseline shadow selection is not exact and selected: ${JSON.stringify({ decision: baselineSelection.selection.decision, reasons: baselineSelection.selection.reasons, omitted_assets: baselineSelection.selection.omitted_assets })}`);

  const challengerPublication = publishPortfolioManifest({
    storeRoot,
    draft: portfolioManifestDraft({
      sourceRoot,
      preregistration,
      registryReference,
      track,
      asset: track.candidate,
      revision: "prompt-v2-challenger-v1",
      roleName: "challenger",
      rollbackTarget: baselineRef,
    }),
  });
  const challengerRef = exactPortfolioRef(challengerPublication);
  const challengerContext = buildPortfolioAuthorityContext({
    portfolioId,
    repositoryId: REPOSITORY_ID,
    scopeId: SCOPE_ID,
    predecessorLockDigest: baselineLock.lock_digest,
    transitions: [
      { manifest: baselineRef, from_state: "current", to_state: "historical" },
      { manifest: challengerRef, from_state: null, to_state: "current" },
    ],
    authority: portfolioAuthority(track.adapterTrack, "challenger"),
  });
  const challengerLock = applyPortfolioTransitions({
    storeRoot,
    predecessorLockDigest: baselineLock.lock_digest,
    authorityContext: challengerContext,
    trustedPortfolioAuthorityContexts: [baselineContext],
  });
  const allContexts = [baselineContext, challengerContext];
  const challengerSelector = portfolioSelectionContext({ track, lockDigest: challengerLock.lock_digest });
  const challengerSelection = resolvePortfolioSelection({
    storeRoot,
    lockDigest: challengerLock.lock_digest,
    selectorContext: challengerSelector,
    trustedPortfolioAuthorityContexts: allContexts,
  });
  if (challengerSelection.selection.decision !== "selected") throw new Error(`${track.adapterTrack} challenger shadow selection is not exact and selected: ${JSON.stringify({ decision: challengerSelection.selection.decision, reasons: challengerSelection.selection.reasons, omitted_assets: challengerSelection.selection.omitted_assets })}`);
  return {
    baseline: {
      portfolio: exactPortfolioRef(baselinePublication, baselineLock.lock_digest),
      selection: { selection_object_digest: baselineSelection.selection_object_digest, selection_digest: baselineSelection.selection.selection_digest },
    },
    challenger: {
      portfolio: exactPortfolioRef(challengerPublication, challengerLock.lock_digest),
      selection: { selection_object_digest: challengerSelection.selection_object_digest, selection_digest: challengerSelection.selection.selection_digest },
    },
    contexts: allContexts,
  };
}

function evolutionAuthorities(adapterTrack) {
  const evidence = (role) => canonicalDigest({ source_revision: PROMPT_V2_SOURCE_REVISION, adapter_track: adapterTrack, authority_role: role, scope: "result_blind_preregistration" });
  return {
    generation: {
      source: "repository_preregistered_revision",
      actor: { kind: "repository_author", actor_id: `ask.prompt-v2.${adapterTrack}.candidate-author`, authority_evidence_digest: evidence("candidate_generation") },
    },
    experiment: { kind: "external_evolution_experiment_authority", authority_id: `ask.prompt-v2.${adapterTrack}.experiment-authority`, authority_revision: 1, authority_evidence_digest: evidence("experiment") },
    decision: { kind: "external_evolution_human_decision_authority", authority_id: `ask.prompt-v2.${adapterTrack}.reserved-decision-authority`, authority_revision: 1, authority_evidence_digest: evidence("reserved_human_decision") },
  };
}

function evolutionRole(role, portfolio, selection, asset, registrySnapshotDigest) {
  return {
    role,
    portfolio,
    registry_snapshot_digest: registrySnapshotDigest,
    selection_object_digest: selection.selection_object_digest,
    selection_digest: selection.selection_digest,
    selected_asset: asset,
  };
}

function buildTrackEvolution({ storeRoot, preregistration, registryReference, evaluator, track, portfolios }) {
  const authorities = evolutionAuthorities(track.adapterTrack);
  const parentPortfolio = portfolios.baseline.portfolio;
  const evaluationScope = {
    fixture_ids: preregistration.fixtures.map(({ catalog_fixture_id: id }) => id),
    task_classes: [...new Set(preregistration.fixtures.map(({ task_class: taskClass }) => taskClass))],
    exclusions: ["measured_execution", "private_evaluator_semantic_read", "runtime_activation"],
  };
  const changedIdentity = canonicalDigest({ baseline: track.baseline, candidate: track.candidate });
  const candidate = buildEvolutionCandidate({
    schema_version: "1.0.0",
    object_kind: "evolution_candidate",
    candidate_id: `prompt-v2-${track.adapterTrack}-candidate`,
    parent_asset: track.baseline,
    parent_portfolio: parentPortfolio,
    candidate_asset: track.candidate,
    registry: {
      registry_id: registryReference.registry_id,
      repository_id: registryReference.repository_id,
      scope_id: registryReference.scope_id,
      snapshot_revision: registryReference.snapshot_revision,
      snapshot_digest: registryReference.snapshot_digest,
    },
    delta: { kind: "full_content_revision", summary: "Exact adapter Prompt bundle full-content revision frozen before results.", delta_digest: changedIdentity },
    generation: authorities.generation,
    hypothesis: { intended_mechanism: "evaluate the exact Prompt v2 instruction projection", applicability: "bounded result-blind Prompt v2 preregistration only" },
    factors: {
      design: "one_factor",
      changed: [{ factor_id: "prompt_instruction_content", identity_digest: changedIdentity }],
      frozen: [
        { factor_id: "fixture_set", identity_digest: canonicalDigest(preregistration.fixtures) },
        { factor_id: "raw_scoring_authority", identity_digest: preregistration.raw_scoring.authority_digest },
        { factor_id: "thresholds", identity_digest: canonicalDigest(preregistration.thresholds) },
      ],
    },
    evaluation_scope: evaluationScope,
    assurance_lane: "challenger",
    expected_upside: ["bounded exact comparison authority becomes reconstructable"],
    risks: ["candidate Prompt bundle may not improve measured behavior"],
    retirement_condition: "explicit post-result authority rejects or revises the candidate",
    rollback: { condition: "explicit authority selects the exact current Prompt bundle", parent_asset: track.baseline, parent_portfolio: parentPortfolio },
    prohibited_effects: ["measured_execution", "recommendation_creation", "runtime_activation"],
    authorities: { experiment: authorities.experiment, decision: authorities.decision },
  });
  const candidatePublication = publishEvolutionCandidate({ storeRoot, candidate });
  const roles = {
    baseline: evolutionRole("baseline", portfolios.baseline.portfolio, portfolios.baseline.selection, track.baseline, registryReference.snapshot_digest),
    challenger: evolutionRole("challenger", portfolios.challenger.portfolio, portfolios.challenger.selection, track.candidate, registryReference.snapshot_digest),
  };
  const runtime = preregistration.runtime.adapters.find(({ adapter_track: adapterTrack }) => adapterTrack === track.adapterTrack);
  const cliVersion = runtime.runtime_version ?? "unavailable";
  const repetitions = preregistration.fixtures.reduce((sum, fixture) => sum + fixture.repetitions, 0);
  const experimentDraft = {
    schema_version: "1.0.0",
    object_kind: "evolution_experiment",
    experiment_id: `prompt-v2-${track.adapterTrack}-result-blind-canary`,
    phase: "pre_result",
    results_accessed: false,
    candidate_digest: candidate.candidate_digest,
    candidate_object_digest: candidatePublication.object_digest,
    roles,
    projection: {
      mode: "prompt_v2_exact",
      baseline_condition: "full_ask",
      challenger_condition: "full_ask",
      ...computePromptV2ExactProjectionDigests(roles),
    },
    protocol: {
      source_revision: PROMPT_V2_SOURCE_REVISION,
      tree_digest: canonicalDigest({ source_revision: PROMPT_V2_SOURCE_REVISION, git_tree: PROMPT_V2_SOURCE_TREE }),
      model: track.model,
      cli: { name: runtime.runtime, version: cliVersion, identity_digest: canonicalDigest(runtime) },
      adapter: { name: track.selectorAdapter, version: track.track.renderer.renderer_version, identity_digest: track.candidateProjection.renderer_input_digest },
      fixture_ids: candidate.evaluation_scope.fixture_ids,
      task_classes: candidate.evaluation_scope.task_classes,
      exclusions: candidate.evaluation_scope.exclusions,
      candidate_evaluation_scope_digest: canonicalDigest(candidate.evaluation_scope),
      repetitions,
      evaluator: {
        stable_id: evaluator.stable_id,
        version: evaluator.version,
        record_digest: evaluator.record_digest,
        content_digest: evaluator.content_digest,
      },
      evaluator_contract_digest: canonicalDigest(preregistration.fixtures.map(({ catalog_fixture_id, public_evaluator_set }) => ({ catalog_fixture_id, public_evaluator_set }))),
      scoring_policy_digest: preregistration.raw_scoring.authority_digest,
      thresholds_digest: canonicalDigest(preregistration.thresholds),
      weights_digest: canonicalDigest({ raw_scoring_condition: "full_ask", raw_scoring_authority: preregistration.raw_scoring.authority_digest }),
      stop_conditions_digest: canonicalDigest(preregistration.stop_conditions),
      privacy_boundary_digest: canonicalDigest(preregistration.privacy),
    },
    causal_design: { mode: "one_factor", candidate_factors_digest: canonicalDigest(candidate.factors), changed_factor_ids: ["prompt_instruction_content"], ablation_evidence_digests: [] },
    recommendation_policy: { rules: [], no_match: "insufficient_evidence" },
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
    authority: authorities.experiment,
  };
  const experiment = buildEvolutionExperiment(experimentDraft);
  const experimentPublication = publishEvolutionExperiment({ storeRoot, experiment });
  return {
    candidate: { object_digest: candidatePublication.object_digest, semantic_digest: candidate.candidate_digest },
    experiment: { object_digest: experimentPublication.object_digest, semantic_digest: experiment.experiment_digest },
    experimentAuthority: authorities.experiment,
  };
}

function buildAuthorityBinding({ preregistration, renderedArchive, tracks }) {
  const adapter_bindings = tracks.map((track) => ({
    adapter_track: track.adapterTrack,
    roles: [
      {
        prompt_role: "current_prompt",
        asset: track.baseline,
        portfolio: track.portfolios.baseline.portfolio,
        selection: track.portfolios.baseline.selection,
        projection: track.baselineProjection,
      },
      {
        prompt_role: "prompt_v2",
        asset: track.candidate,
        portfolio: track.portfolios.challenger.portfolio,
        selection: track.portfolios.challenger.selection,
        projection: track.candidateProjection,
      },
    ],
    evolution: {
      candidate_object_digest: track.evolution.candidate.object_digest,
      candidate_digest: track.evolution.candidate.semantic_digest,
      experiment_object_digest: track.evolution.experiment.object_digest,
      experiment_digest: track.evolution.experiment.semantic_digest,
      baseline_asset_record_digest: track.baseline.record_digest,
      candidate_asset_record_digest: track.candidate.record_digest,
      rollback_target_manifest_digest: track.portfolios.baseline.portfolio.manifest_digest,
      phase: "pre_result",
      results_accessed: false,
      projection_mode: "prompt_v2_exact",
      raw_scoring_condition: "full_ask",
    },
  }));
  const basis = {
    schema_version: "1.0.0",
    binding_kind: preregistration.generated_authority_binding_contract.binding_kind,
    preregistration_id: preregistration.preregistration_id,
    preregistration_digest: preregistration.preregistration_digest,
    source: {
      repository_revision: PROMPT_V2_SOURCE_REVISION,
      repository_tree: PROMPT_V2_SOURCE_TREE,
      rendered_source_root: PROMPT_V2_PREREGISTRATION_RENDERED_ROOT,
      rendered_source_inventory_digest: renderedArchive.inventory_digest,
    },
    adapter_bindings,
    boundaries: {
      runtime_activation_implied: false,
      measured_execution_authorized: false,
      result_accessed: false,
      recommendation_created: false,
      lifecycle_mutation_authorized: false,
    },
  };
  const binding = { ...basis, binding_digest: computePromptV2AuthorityBindingDigest(basis) };
  validatePromptV2AuthorityBinding(binding, { preregistration });
  return binding;
}

function objectInventory(storeRoot) {
  return listContentAddressedJson({ storeRoot }).map(({ digest }) => digest).sort();
}

function buildFixtureReference({ sourceRoot, preregistration, renderedArchive, assets, tracks, binding, storeRoot }) {
  const foundationObjects = objectInventory(resolve(sourceRoot, "docs/fixtures/asset-registry/store"));
  const objects = objectInventory(storeRoot);
  const basis = {
    schema_version: "1.0.0",
    object_kind: "prompt_v2_preregistration_fixture_reference",
    fixture_root: FIXTURE_PATH,
    source: {
      repository_revision: PROMPT_V2_SOURCE_REVISION,
      repository_tree: PROMPT_V2_SOURCE_TREE,
      tree_digest: canonicalDigest({ source_revision: PROMPT_V2_SOURCE_REVISION, git_tree: PROMPT_V2_SOURCE_TREE }),
    },
    preregistration: {
      path: PREREGISTRATION_PATH,
      raw_digest: rawDigest(readFileSync(resolve(sourceRoot, PREREGISTRATION_PATH))),
      preregistration_id: preregistration.preregistration_id,
      preregistration_digest: preregistration.preregistration_digest,
    },
    rendered_archive: {
      root: PROMPT_V2_PREREGISTRATION_RENDERED_ROOT,
      reference_path: `${PROMPT_V2_PREREGISTRATION_RENDERED_ROOT}/reference.json`,
      reference_raw_digest: rawDigest(readFileSync(resolve(sourceRoot, PROMPT_V2_PREREGISTRATION_RENDERED_ROOT, "reference.json"))),
      archive_digest: renderedArchive.reference.archive_digest,
      inventory_digest: renderedArchive.inventory_digest,
    },
    binding: {
      path: `${FIXTURE_PATH}/binding.json`,
      binding_digest: binding.binding_digest,
      raw_digest: rawDigest(jsonBytes(binding)),
    },
    foundation: {
      fixture_root: "docs/fixtures/asset-registry",
      registry_snapshot_digest: assets.foundationReference.snapshot_digest,
      object_count: foundationObjects.length,
      object_inventory_digest: canonicalDigest(foundationObjects),
      object_digests: foundationObjects,
    },
    registry: {
      registry_id: assets.registryReference.registry_id,
      repository_id: assets.registryReference.repository_id,
      scope_id: assets.registryReference.scope_id,
      snapshot_revision: assets.registryReference.snapshot_revision,
      snapshot_digest: assets.registryReference.snapshot_digest,
    },
    evaluator_asset: assets.evaluator,
    adapters: tracks.map((track) => ({
      adapter_track: track.adapterTrack,
      selector_adapter: track.selectorAdapter,
      baseline_asset: track.baseline,
      candidate_asset: track.candidate,
      baseline_portfolio: track.portfolios.baseline.portfolio,
      challenger_portfolio: track.portfolios.challenger.portfolio,
      baseline_selection: track.portfolios.baseline.selection,
      challenger_selection: track.portfolios.challenger.selection,
      portfolio_authority_contexts: track.portfolios.contexts,
      evolution: {
        candidate_object_digest: track.evolution.candidate.object_digest,
        candidate_digest: track.evolution.candidate.semantic_digest,
        experiment_object_digest: track.evolution.experiment.object_digest,
        experiment_digest: track.evolution.experiment.semantic_digest,
        experiment_authority: track.evolution.experimentAuthority,
      },
    })),
    store: {
      object_count: objects.length,
      object_inventory_digest: canonicalDigest(objects),
      object_digests: objects,
    },
    portable_paths_only: true,
    mutable_latest_pointer_used: false,
    boundaries: {
      runtime_activation_implied: false,
      measured_execution_authorized: false,
      results_accessed: false,
      recommendation_created: false,
      action_proposal_created: false,
      human_decision_created: false,
      application_receipt_created: false,
      lifecycle_mutation_authorized: false,
      private_evaluator_content_included: false,
    },
  };
  return { ...basis, reference_digest: canonicalDigest(basis) };
}

function generatePromptV2PreregistrationFixture({ sourceRevision = PROMPT_V2_SOURCE_REVISION, sourceTree = PROMPT_V2_SOURCE_TREE } = {}) {
  if (sourceRevision !== PROMPT_V2_SOURCE_REVISION || sourceTree !== PROMPT_V2_SOURCE_TREE) throw new Error("Prompt v2 fixture generation is bound to the exact source commit A revision/tree");
  const temporaryRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-prompt-v2-preregistration-")));
  const storeRoot = resolve(temporaryRoot, "store");
  try {
    const generated = withDetachedSource({ sourceRevision, sourceTree }, ({ sourceRoot, temporaryRoot: sourceScratchRoot }) => {
      const reproducedArchive = verifySourceArchiveReproduction({ sourceRoot, scratchRoot: sourceScratchRoot });
      const archived = verifyRenderedArchiveFiles({ fixtureRoot: resolve(sourceRoot, FIXTURE_PATH) });
      assert.deepEqual(reproducedArchive.inventory, archived.inventory, "source A archive reproduction inventory drifted");
      cpSync(resolve(sourceRoot, "docs/fixtures/asset-registry/store"), storeRoot, { recursive: true, errorOnExist: true });
      const preregistration = loadPromptV2Preregistration({ root: sourceRoot });
      const assets = registerPromptV2Assets({ storeRoot, sourceRoot, preregistration, renderedArchive: archived });
      const tracks = assets.tracks.map((track) => {
        const portfolios = buildTrackPortfolios({ storeRoot, sourceRoot, preregistration, registryReference: assets.registryReference, track });
        const evolution = buildTrackEvolution({ storeRoot, preregistration, registryReference: assets.registryReference, evaluator: assets.evaluator, track, portfolios });
        return { ...track, portfolios, evolution };
      });
      const binding = buildAuthorityBinding({ preregistration, renderedArchive: archived, tracks });
      const reference = buildFixtureReference({ sourceRoot, preregistration, renderedArchive: archived, assets, tracks, binding, storeRoot });
      return { preregistration, assets, tracks, binding, reference, archived };
    });
    return { temporaryRoot, storeRoot, ...generated };
  } catch (error) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

function objectEdges(value) {
  const edges = [];
  const add = (digest) => { if (digest !== null && digest !== undefined) edges.push(digest); };
  const addAsset = (asset) => { if (asset) add(asset.record_digest); };
  switch (value.object_kind) {
    case "asset_registry_snapshot":
      add(value.predecessor?.snapshot_digest);
      add(value.lifecycle_authority_context_digest);
      value.entries.forEach(({ record_digest: digest }) => add(digest));
      break;
    case "asset_record":
      add(value.content.content_digest);
      value.dependencies.forEach(addAsset);
      addAsset(value.derivation.parent);
      addAsset(value.maintenance.rollback.target);
      break;
    case "portfolio_manifest":
      add(value.registry.snapshot_digest);
      value.entries.forEach(({ asset }) => addAsset(asset));
      break;
    case "portfolio_lock":
      add(value.predecessor?.lock_digest);
      add(value.authority_context_digest);
      value.entries.forEach(({ manifest_digest: digest }) => add(digest));
      break;
    case "portfolio_authority_context":
      add(value.predecessor_lock_digest);
      value.transitions.forEach(({ manifest }) => add(manifest.manifest_digest));
      add(value.rollback_target?.manifest_digest);
      break;
    case "portfolio_selection_context":
      add(value.portfolio_lock_digest);
      break;
    case "portfolio_selection":
      add(value.portfolio_lock.lock_digest);
      add(value.manifest.manifest_digest);
      add(value.registry.snapshot_digest);
      add(value.context_object_digest);
      value.selected_assets.forEach(({ asset }) => addAsset(asset));
      break;
    case "evolution_candidate":
      add(value.registry.snapshot_digest);
      add(value.parent_portfolio.lock_digest);
      add(value.parent_portfolio.manifest_digest);
      addAsset(value.parent_asset);
      addAsset(value.candidate_asset);
      break;
    case "evolution_experiment":
      add(value.candidate_object_digest);
      addAsset(value.protocol.evaluator);
      Object.values(value.roles).forEach((role) => {
        add(role.portfolio.lock_digest);
        add(role.portfolio.manifest_digest);
        add(role.registry_snapshot_digest);
        add(role.selection_object_digest);
        addAsset(role.selected_asset);
      });
      break;
    default:
      break;
  }
  return [...new Set(edges)];
}

function verifyReachableClosure({ storeRoot, reference }) {
  const objects = new Map(listContentAddressedJson({ storeRoot }).map(({ digest, value }) => [digest, value]));
  const pending = [
    reference.registry.snapshot_digest,
    ...reference.adapters.flatMap((adapter) => [
      adapter.baseline_portfolio.lock_digest,
      adapter.challenger_portfolio.lock_digest,
      adapter.baseline_selection.selection_object_digest,
      adapter.challenger_selection.selection_object_digest,
      adapter.evolution.candidate_object_digest,
      adapter.evolution.experiment_object_digest,
    ]),
  ];
  const reachable = new Set();
  while (pending.length > 0) {
    const digest = pending.pop();
    if (reachable.has(digest)) continue;
    const value = objects.get(digest);
    if (!value) throw new Error(`Prompt v2 referenced CAS object is missing: ${digest}`);
    reachable.add(digest);
    for (const edge of objectEdges(value)) if (!reachable.has(edge)) pending.push(edge);
  }
  assert.deepEqual([...reachable].sort(), [...objects.keys()].sort(), "Prompt v2 CAS contains an orphan or unreachable object");
  return objects;
}

function assertPortableDurableValue(value, trail = "$", key = null) {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertPortableDurableValue(entry, `${trail}[${index}]`));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && key && (key.endsWith("path") || key.endsWith("root"))) {
      assertPortablePath(value, trail);
      if (value === "private" || value.startsWith("private/") || value === "benchmarks/results" || value.startsWith("benchmarks/results/")) throw new Error(`${trail} crosses a private/result boundary`);
    }
    return;
  }
  for (const [childKey, child] of Object.entries(value)) assertPortableDurableValue(child, `${trail}.${childKey}`, childKey);
}

export function verifyPromptV2PreregistrationFixture({ root }) {
  if (!root) throw new Error("Prompt v2 preregistration fixture root is required");
  const fixtureRoot = resolve(root);
  assertNoSymlinkPathSegments(fixtureRoot, "Prompt v2 preregistration fixture root");
  const preregistration = loadPromptV2Preregistration({ root: repositoryRoot });
  const binding = readJsonFileStrict(resolve(fixtureRoot, "binding.json"), "Prompt v2 preregistration binding");
  const reference = readJsonFileStrict(resolve(fixtureRoot, "reference.json"), "Prompt v2 preregistration reference");
  if (reference.reference_digest !== canonicalDigest(without(reference, ["reference_digest"]))) throw new Error("Prompt v2 preregistration reference digest mismatch");
  assertPortableDurableValue(reference);
  validatePromptV2AuthorityBinding(binding, { preregistration });
  if (reference.source.repository_revision !== binding.source.repository_revision || reference.source.repository_tree !== binding.source.repository_tree) throw new Error("Prompt v2 reference/binding source identity mismatch");
  if (reference.source.repository_revision !== PROMPT_V2_SOURCE_REVISION || reference.source.repository_tree !== PROMPT_V2_SOURCE_TREE) throw new Error("Prompt v2 fixture source A identity drifted");
  if (reference.binding.binding_digest !== binding.binding_digest || reference.binding.raw_digest !== rawDigest(readFileSync(resolve(fixtureRoot, "binding.json")))) throw new Error("Prompt v2 reference binding identity mismatch");
  if (reference.preregistration.preregistration_digest !== preregistration.preregistration_digest || reference.preregistration.raw_digest !== rawDigest(readFileSync(resolve(repositoryRoot, PREREGISTRATION_PATH)))) throw new Error("Prompt v2 preregistration config binding drifted");
  const rendered = verifyRenderedArchiveFiles({ fixtureRoot });
  if (rendered.reference.archive_digest !== reference.rendered_archive.archive_digest || rendered.inventory_digest !== reference.rendered_archive.inventory_digest || rendered.inventory_digest !== binding.source.rendered_source_inventory_digest) throw new Error("Prompt v2 rendered archive binding drifted");
  const storeRoot = resolve(fixtureRoot, "store");
  const objects = objectInventory(storeRoot);
  if (reference.store.object_count !== objects.length || reference.store.object_inventory_digest !== canonicalDigest(objects)) throw new Error("Prompt v2 CAS inventory digest/count mismatch");
  assert.deepEqual(reference.store.object_digests, objects, "Prompt v2 CAS exact inventory drifted");
  const expectedFiles = [
    "binding.json",
    "reference.json",
    ...rendered.inventory.map(({ path }) => `rendered/${path}`),
    ...objects.map((digest) => {
      const hex = digest.slice("sha256:".length);
      return `store/objects/sha256/${hex.slice(0, 2)}/${hex.slice(2)}.json`;
    }),
  ].sort();
  assert.deepEqual(byteInventory(fixtureRoot).map(({ path }) => path), expectedFiles, "Prompt v2 fixture contains an extra or missing file");
  const objectMap = verifyReachableClosure({ storeRoot, reference });
  for (const [digest, value] of objectMap) {
    if (FORBIDDEN_OBJECT_KINDS.has(value.object_kind) || !ALLOWED_OBJECT_KINDS.has(value.object_kind)) throw new Error(`Prompt v2 CAS contains forbidden post-result object ${value.object_kind} at ${digest}`);
  }
  const registry = verifyAssetRegistry({ storeRoot, snapshotDigest: reference.registry.snapshot_digest });
  if (registry.registry_id !== REGISTRY_ID || registry.repository_id !== REPOSITORY_ID || registry.scope_id !== SCOPE_ID) throw new Error("Prompt v2 registry identity drifted");
  const byRef = (asset) => registry.assets.find((entry) => entry.stable_id === asset.stable_id && entry.version === asset.version);
  for (const canonical of [preregistration.canonical_prompt_v2.prompt_asset, preregistration.canonical_prompt_v2.policy_asset, reference.evaluator_asset]) assert.deepEqual(exactAssetRef(byRef(canonical)), canonical);
  const evaluator = byRef(reference.evaluator_asset);
  if (evaluator.record.type_extension.kind !== "public_evaluator_reference" || evaluator.record.type_extension.private_evaluator_content_included !== false || evaluator.record.content.files.some(({ path }) => path !== PREREGISTRATION_PATH)) throw new Error("Prompt v2 evaluator Asset is not answer-free public identity only");
  for (const adapter of reference.adapters) {
    const bindingAdapter = binding.adapter_bindings.find(({ adapter_track: adapterTrack }) => adapterTrack === adapter.adapter_track);
    const selectorAdapter = adapter.adapter_track === "claude" ? "claude_code" : adapter.adapter_track;
    if (adapter.selector_adapter !== selectorAdapter) throw new Error(`${adapter.adapter_track} track-to-selector adapter mapping drifted`);
    const baseline = byRef(adapter.baseline_asset);
    const candidate = byRef(adapter.candidate_asset);
    if (!baseline || !candidate || baseline.record.type_extension.kind !== "rendered_prompt_bundle" || candidate.record.type_extension.kind !== "rendered_prompt_bundle") throw new Error(`${adapter.adapter_track} rendered Prompt Asset pair is incomplete`);
    if (baseline.record.type_extension.adapter !== selectorAdapter || candidate.record.type_extension.adapter !== selectorAdapter) throw new Error(`${adapter.adapter_track} rendered Prompt adapter selector drifted`);
    assert.deepEqual(candidate.record.derivation.parent, adapter.baseline_asset, `${adapter.adapter_track} candidate direct lineage drifted`);
    assert.deepEqual(candidate.record.maintenance.rollback.target, adapter.baseline_asset, `${adapter.adapter_track} candidate rollback drifted`);
    assert.deepEqual([...candidate.record.dependencies].sort((left, right) => left.stable_id.localeCompare(right.stable_id)), [preregistration.canonical_prompt_v2.policy_asset, preregistration.canonical_prompt_v2.prompt_asset].sort((left, right) => left.stable_id.localeCompare(right.stable_id)), `${adapter.adapter_track} canonical Prompt/policy dependencies drifted`);
    const contexts = adapter.portfolio_authority_contexts;
    if (contexts.length !== 2 || contexts[0].context_digest === contexts[1].context_digest) throw new Error(`${adapter.adapter_track} baseline/challenger Portfolio authorities are not distinct`);
    verifyPortfolioLock({ storeRoot, lockDigest: adapter.baseline_portfolio.lock_digest, trustedPortfolioAuthorityContexts: contexts });
    const challengerLock = verifyPortfolioLock({ storeRoot, lockDigest: adapter.challenger_portfolio.lock_digest, trustedPortfolioAuthorityContexts: contexts });
    for (const manifestDigest of [adapter.baseline_portfolio.manifest_digest, adapter.challenger_portfolio.manifest_digest]) {
      const manifest = objectMap.get(manifestDigest);
      if (!manifest || manifest.benchmark_compatibility?.length !== 1 || manifest.benchmark_compatibility[0].condition_id !== preregistration.raw_scoring.condition) throw new Error(`${adapter.adapter_track} Portfolio benchmark condition drifted from the frozen raw-scoring condition`);
    }
    if (adapter.baseline_portfolio.portfolio_id !== adapter.challenger_portfolio.portfolio_id || challengerLock.lock.current_manifest_digest !== adapter.challenger_portfolio.manifest_digest) throw new Error(`${adapter.adapter_track} same-ID Portfolio transition drifted`);
    const rollbackEntry = challengerLock.lock.entries.find(({ manifest_digest }) => manifest_digest === adapter.baseline_portfolio.manifest_digest);
    if (!rollbackEntry || !["historical", "superseded"].includes(rollbackEntry.state)) throw new Error(`${adapter.adapter_track} exact Portfolio rollback anchor is missing`);
    const baselineSelection = verifyPortfolioSelection({ storeRoot, selectionObjectDigest: adapter.baseline_selection.selection_object_digest, trustedPortfolioAuthorityContexts: contexts });
    const challengerSelection = verifyPortfolioSelection({ storeRoot, selectionObjectDigest: adapter.challenger_selection.selection_object_digest, trustedPortfolioAuthorityContexts: contexts });
    if (baselineSelection.selection.selection_digest !== adapter.baseline_selection.selection_digest || challengerSelection.selection.selection_digest !== adapter.challenger_selection.selection_digest) throw new Error(`${adapter.adapter_track} pre-result selection identity drifted`);
    verifyEvolutionCandidate({ storeRoot, candidateObjectDigest: adapter.evolution.candidate_object_digest, trustedPortfolioAuthorityContexts: contexts });
    const experiment = verifyEvolutionExperiment({ storeRoot, experimentObjectDigest: adapter.evolution.experiment_object_digest, trustedExperimentAuthorities: [adapter.evolution.experiment_authority], trustedPortfolioAuthorityContexts: contexts });
    if (experiment.experiment.phase !== "pre_result" || experiment.experiment.results_accessed !== false || experiment.experiment.projection.mode !== "prompt_v2_exact") throw new Error(`${adapter.adapter_track} Evolution result-blind phase drifted`);
    if (bindingAdapter.evolution.candidate_object_digest !== adapter.evolution.candidate_object_digest || bindingAdapter.evolution.experiment_object_digest !== adapter.evolution.experiment_object_digest) throw new Error(`${adapter.adapter_track} binding/reference Evolution identity drifted`);
  }
  if (Object.values(reference.boundaries).some((value) => value !== false) || Object.values(binding.boundaries).some((value) => value !== false)) throw new Error("Prompt v2 fixture implies a forbidden result, lifecycle, or activation boundary");
  return Object.freeze({
    source_revision: reference.source.repository_revision,
    source_tree: reference.source.repository_tree,
    binding_digest: binding.binding_digest,
    reference_digest: reference.reference_digest,
    registry_snapshot_digest: reference.registry.snapshot_digest,
    object_count: objects.length,
    object_inventory_digest: reference.store.object_inventory_digest,
    results_accessed: false,
    runtime_activation_implied: false,
  });
}

function generatedFixtureFiles(generated) {
  const objectFiles = objectInventory(generated.storeRoot).map((digest) => {
    const hex = digest.slice("sha256:".length);
    return `store/objects/sha256/${hex.slice(0, 2)}/${hex.slice(2)}.json`;
  });
  return [...objectFiles, "binding.json", "reference.json"].sort();
}

function generatedFixtureBytes(generated, path) {
  if (path === "binding.json") return jsonBytes(generated.binding);
  if (path === "reference.json") return jsonBytes(generated.reference);
  return readFileSync(resolve(generated.storeRoot, path.slice("store/".length)));
}

function writeGeneratedFixture({ fixtureRoot, generated }) {
  assertNoSymlinkPathSegments(fixtureRoot, "Prompt v2 fixture root", { allowMissingLeaf: true });
  mkdirSync(fixtureRoot, { recursive: true });
  const targetStoreRoot = resolve(fixtureRoot, "store");
  assertNoSymlinkPathSegments(targetStoreRoot, "Prompt v2 generated fixture store", { allowMissingLeaf: true });
  if (existsSync(targetStoreRoot)) {
    if (!lstatSync(targetStoreRoot).isDirectory()) throw new Error("Prompt v2 generated fixture store is not a directory");
    rmSync(targetStoreRoot, { recursive: true, force: true });
  }
  cpSync(generated.storeRoot, targetStoreRoot, { recursive: true, errorOnExist: true });
  for (const path of ["binding.json", "reference.json"]) {
    const target = resolve(fixtureRoot, path);
    assertNoSymlinkPathSegments(target, `Prompt v2 generated fixture ${path}`, { allowMissingLeaf: true });
    writeFileSync(target, generatedFixtureBytes(generated, path));
  }
  return verifyPromptV2PreregistrationFixture({ root: fixtureRoot });
}

function checkGeneratedFixture({ fixtureRoot, generated }) {
  const expected = generatedFixtureFiles(generated);
  const actual = byteInventory(fixtureRoot).map(({ path }) => path).filter((path) => !path.startsWith("rendered/")).sort();
  assert.deepEqual(actual, expected, "Prompt v2 generated fixture inventory drifted");
  for (const path of expected) assert.deepEqual(readFileSync(resolve(fixtureRoot, path)), generatedFixtureBytes(generated, path), `${path} drifted from source A generation`);
  return verifyPromptV2PreregistrationFixture({ root: fixtureRoot });
}

export function writePromptV2PreregistrationFixture({ root = defaultFixtureRoot, sourceRevision = PROMPT_V2_SOURCE_REVISION, sourceTree = PROMPT_V2_SOURCE_TREE } = {}) {
  const generated = generatePromptV2PreregistrationFixture({ sourceRevision, sourceTree });
  try {
    return writeGeneratedFixture({ fixtureRoot: resolve(root), generated });
  } finally {
    rmSync(generated.temporaryRoot, { recursive: true, force: true });
  }
}

export function checkPromptV2PreregistrationFixture({ root = defaultFixtureRoot, sourceRevision = PROMPT_V2_SOURCE_REVISION, sourceTree = PROMPT_V2_SOURCE_TREE } = {}) {
  const generated = generatePromptV2PreregistrationFixture({ sourceRevision, sourceTree });
  try {
    return checkGeneratedFixture({ fixtureRoot: resolve(root), generated });
  } finally {
    rmSync(generated.temporaryRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  let mode = null;
  let outputRoot = defaultFixtureRoot;
  let sourceRevision = PROMPT_V2_SOURCE_REVISION;
  let sourceTree = PROMPT_V2_SOURCE_TREE;
  const usage = "Usage: node scripts/prompt-v2-preregistration-samples.mjs (--write-rendered | --write | --check) [--output-root FIXTURE_ROOT] [--source-revision REVISION --source-tree TREE]";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--write-rendered", "--write", "--check"].includes(argument) && mode === null) mode = argument.slice(2);
    else if (argument === "--output-root" && index + 1 < argv.length) outputRoot = resolve(argv[++index]);
    else if (argument === "--source-revision" && index + 1 < argv.length) sourceRevision = argv[++index];
    else if (argument === "--source-tree" && index + 1 < argv.length) sourceTree = argv[++index];
    else if (argument === "--help" && argv.length === 1) return { mode: "help", usage };
    else throw new Error(usage);
  }
  if (mode === null) throw new Error(usage);
  assertGitIdentity(sourceRevision, "Prompt v2 source revision");
  assertGitIdentity(sourceTree, "Prompt v2 source tree");
  return { mode, outputRoot, sourceRevision, sourceTree, usage };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "help") {
    console.log(args.usage);
    return;
  }
  if (args.mode === "write-rendered") {
    writePromptV2RenderedArchive({ fixtureRoot: args.outputRoot });
    console.log(`wrote exact Prompt v2 rendered source archive under ${resolve(args.outputRoot, "rendered")}`);
    return;
  }
  const options = { root: args.outputRoot, sourceRevision: args.sourceRevision, sourceTree: args.sourceTree };
  const summary = args.mode === "write"
    ? writePromptV2PreregistrationFixture(options)
    : checkPromptV2PreregistrationFixture(options);
  console.log(`${args.mode === "write" ? "wrote and verified" : "verified"} Prompt v2 preregistration fixture ${summary.reference_digest}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(`prompt-v2 preregistration samples failed: ${error.message}`);
    process.exitCode = 1;
  }
}
