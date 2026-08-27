#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";
import {
  canonicalDigest,
  listContentAddressedJson,
  putContentAddressedJson,
  readContentAddressedJson,
} from "./content-addressed-store.mjs";
import {
  PROMPT_V2_PREREGISTRATION_RENDERED_ROOT,
  PROMPT_V2_SOURCE_REVISION,
  PROMPT_V2_SOURCE_TREE,
  buildPromptV2RenderedArchive,
  checkPromptV2RenderedArchive,
  verifyPromptV2PreregistrationFixture,
} from "./prompt-v2-preregistration-samples.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(repositoryRoot, "scripts/prompt-v2-preregistration-samples.mjs");
const canonicalFixtureRoot = resolve(repositoryRoot, "docs/fixtures/prompt-v2-preregistration");
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function fileInventory(root) {
  const inventory = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) inventory.push({ path, bytes: readFileSync(absolute) });
      else inventory.push({ path, unsupported: true });
    }
  }
  visit(root);
  return inventory;
}

function inventoryBytes(inventory) {
  return inventory.map(({ path, bytes, unsupported }) => ({
    path,
    unsupported: unsupported ?? false,
    digest: bytes ? digest(bytes) : null,
  }));
}

function freshRendererArtifacts(adapter) {
  const plan = adapter === "codex"
    ? buildCodexProjectionPlan({ profileName: "full" })
    : buildClaudeProjectionPlan({ profileName: "full" });
  return {
    plan,
    byPath: new Map(plan.compactProfileArtifacts.map((artifact) => [
      `${adapter}/${artifact.metadata.prompt_name}`,
      Buffer.from(artifact.content, "utf8"),
    ])),
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function copyFixture(destination) {
  cpSync(canonicalFixtureRoot, destination, { recursive: true, errorOnExist: true });
}

function refreshReferenceStoreInventory(fixtureRoot, reference) {
  const objectDigests = listContentAddressedJson({ storeRoot: resolve(fixtureRoot, "store") })
    .map(({ digest: objectDigest }) => objectDigest)
    .sort();
  reference.store.object_count = objectDigests.length;
  reference.store.object_digests = objectDigests;
  reference.store.object_inventory_digest = canonicalDigest(objectDigests);
  reference.reference_digest = canonicalDigest(Object.fromEntries(
    Object.entries(reference).filter(([key]) => key !== "reference_digest"),
  ));
  writeJson(resolve(fixtureRoot, "reference.json"), reference);
}

function runFixtureCli(mode, fixtureRoot, { sourceTree = PROMPT_V2_SOURCE_TREE } = {}) {
  return execFileSync(process.execPath, [
    scriptPath,
    `--${mode}`,
    "--output-root",
    fixtureRoot,
    "--source-revision",
    PROMPT_V2_SOURCE_REVISION,
    "--source-tree",
    sourceTree,
  ], { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  const generated = buildPromptV2RenderedArchive();
  assert.equal(generated.reference.schema_version, "1.0.0");
  assert.equal(generated.reference.object_kind, "prompt_v2_rendered_source_archive");
  assert.equal(generated.reference.renderer_profile, "full");
  assert.equal(generated.reference.runtime_application_implied, false);
  assert.equal(generated.reference.results_accessed, false);
  assert.equal(generated.reference.measured_output_included, false);
  assert.equal(generated.reference.private_evaluator_content_included, false);
  assert.deepEqual(generated.reference.adapters.map(({ adapter }) => adapter), ["claude_code", "codex"]);

  for (const adapterReference of generated.reference.adapters) {
    const { plan, byPath } = freshRendererArtifacts(adapterReference.adapter);
    assert.equal(adapterReference.renderer_id, plan.renderer_id);
    assert.equal(adapterReference.renderer_version, plan.renderer_version);
    assert.equal(adapterReference.renderer_input_digest, plan.renderer_inputs_digest);
    assert.equal(adapterReference.fingerprint, plan.fingerprint);
    assert.equal(adapterReference.canonical_source_digest, plan.canonical_source_digest);
    assert.equal(adapterReference.baseline_source_root, adapterReference.adapter === "codex"
      ? "docs/fixtures/codex-pre-compact-prompts"
      : "docs/fixtures/claude-pre-fixed-commands");
    assert.deepEqual(adapterReference.files.map(({ path }) => path), [...byPath.keys()].sort());
    for (const file of adapterReference.files) {
      assert.equal(isAbsolute(file.path), false);
      assert.equal(file.path.includes(".."), false);
      const fresh = byPath.get(file.path);
      assert.ok(fresh, `fresh ${adapterReference.adapter} renderer output is missing ${file.path}`);
      assert.deepEqual(generated.files.get(file.path), fresh);
      assert.equal(file.byte_length, fresh.length);
      assert.equal(file.raw_digest, digest(fresh));
    }
  }

  const temporaryRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-prompt-v2-rendered-test-")));
  try {
    const fixtureRoot = resolve(temporaryRoot, "fixture");
    execFileSync(process.execPath, [scriptPath, "--write-rendered", "--output-root", fixtureRoot], {
      cwd: repositoryRoot,
      stdio: "pipe",
    });
    checkPromptV2RenderedArchive({ fixtureRoot });
    const first = inventoryBytes(fileInventory(resolve(fixtureRoot, "rendered")));
    execFileSync(process.execPath, [scriptPath, "--write-rendered", "--output-root", fixtureRoot], {
      cwd: repositoryRoot,
      stdio: "pipe",
    });
    assert.deepEqual(inventoryBytes(fileInventory(resolve(fixtureRoot, "rendered"))), first, "second archive write changed bytes or inventory");

    const tamperedRoot = resolve(temporaryRoot, "tampered");
    execFileSync(process.execPath, [scriptPath, "--write-rendered", "--output-root", tamperedRoot], { cwd: repositoryRoot, stdio: "pipe" });
    writeFileSync(resolve(tamperedRoot, "rendered/codex/skill-verify.md"), "tampered\n");
    assert.throws(() => checkPromptV2RenderedArchive({ fixtureRoot: tamperedRoot }), /drifted/u);

    const extraRoot = resolve(temporaryRoot, "extra");
    execFileSync(process.execPath, [scriptPath, "--write-rendered", "--output-root", extraRoot], { cwd: repositoryRoot, stdio: "pipe" });
    writeFileSync(resolve(extraRoot, "rendered/unexpected.md"), "unexpected\n");
    assert.throws(() => checkPromptV2RenderedArchive({ fixtureRoot: extraRoot }), /inventory/u);

    const symlinkRoot = resolve(temporaryRoot, "symlink");
    execFileSync(process.execPath, [scriptPath, "--write-rendered", "--output-root", symlinkRoot], { cwd: repositoryRoot, stdio: "pipe" });
    rmSync(resolve(symlinkRoot, "rendered/claude_code/skill-verify.md"));
    symlinkSync(resolve(symlinkRoot, "rendered/claude_code/skill-review.md"), resolve(symlinkRoot, "rendered/claude_code/skill-verify.md"));
    assert.throws(() => checkPromptV2RenderedArchive({ fixtureRoot: symlinkRoot }), /unsupported entry|symlink/u);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  assert.equal(PROMPT_V2_PREREGISTRATION_RENDERED_ROOT, "docs/fixtures/prompt-v2-preregistration/rendered");
  assert.equal(PROMPT_V2_SOURCE_REVISION, "1710b3007d60e249d553ca7a43b5a83937066b61");
  assert.equal(PROMPT_V2_SOURCE_TREE, "caff00c8f1d97386fe28d62d819028e644036a27");
  const fixtureSummary = verifyPromptV2PreregistrationFixture({
    root: canonicalFixtureRoot,
  });
  assert.equal(fixtureSummary.source_revision, PROMPT_V2_SOURCE_REVISION);
  assert.equal(fixtureSummary.source_tree, PROMPT_V2_SOURCE_TREE);
  assert.equal(fixtureSummary.results_accessed, false);
  assert.equal(fixtureSummary.runtime_activation_implied, false);
  assert.equal(fixtureSummary.object_count, 57);

  const binding = readJson(resolve(canonicalFixtureRoot, "binding.json"));
  const reference = readJson(resolve(canonicalFixtureRoot, "reference.json"));
  assert.equal(binding.binding_digest, fixtureSummary.binding_digest);
  assert.equal(reference.reference_digest, fixtureSummary.reference_digest);
  assert.ok(Object.values(binding.boundaries).every((value) => value === false));
  assert.ok(Object.values(reference.boundaries).every((value) => value === false));
  assert.equal(reference.portable_paths_only, true);
  assert.equal(reference.mutable_latest_pointer_used, false);
  assert.deepEqual(reference.adapters.map(({ adapter_track: adapterTrack, selector_adapter: selectorAdapter }) => [adapterTrack, selectorAdapter]), [
    ["codex", "codex"],
    ["claude", "claude_code"],
  ]);
  for (const adapter of reference.adapters) {
    assert.equal(adapter.baseline_asset.stable_id, adapter.candidate_asset.stable_id);
    assert.equal(adapter.baseline_portfolio.portfolio_id, adapter.challenger_portfolio.portfolio_id);
    assert.notEqual(adapter.baseline_portfolio.manifest_digest, adapter.challenger_portfolio.manifest_digest);
    assert.notEqual(adapter.portfolio_authority_contexts[0].context_digest, adapter.portfolio_authority_contexts[1].context_digest);
    const experiment = readContentAddressedJson({
      storeRoot: resolve(canonicalFixtureRoot, "store"),
      digest: adapter.evolution.experiment_object_digest,
    }).value;
    assert.equal(experiment.object_kind, "evolution_experiment");
    assert.equal(experiment.phase, "pre_result");
    assert.equal(experiment.results_accessed, false);
    assert.equal(experiment.projection.mode, "prompt_v2_exact");
    assert.equal(experiment.projection.baseline_condition, "full_ask");
    assert.equal(experiment.projection.challenger_condition, "full_ask");
    if (adapter.adapter_track === "claude") assert.equal(experiment.protocol.model, "unavailable");
  }
  const objectKinds = listContentAddressedJson({ storeRoot: resolve(canonicalFixtureRoot, "store") })
    .map(({ value }) => value.object_kind);
  for (const forbiddenKind of [
    "evolution_recommendation",
    "evolution_action_proposal",
    "evolution_human_decision",
    "evolution_application_receipt",
    "result",
    "asset_lifecycle_authority_context",
  ]) assert.equal(objectKinds.includes(forbiddenKind), false, `${forbiddenKind} must not be published`);
  const serializedReference = JSON.stringify(reference);
  assert.equal(serializedReference.includes("benchmarks/results"), false);
  assert.equal(serializedReference.includes("private/"), false);

  const fullFixtureTemporaryRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-prompt-v2-full-fixture-test-")));
  try {
    const generatedFixtureRoot = resolve(fullFixtureTemporaryRoot, "generated");
    mkdirSync(generatedFixtureRoot, { recursive: true });
    cpSync(resolve(canonicalFixtureRoot, "rendered"), resolve(generatedFixtureRoot, "rendered"), { recursive: true, errorOnExist: true });
    runFixtureCli("write", generatedFixtureRoot);
    const firstWrite = inventoryBytes(fileInventory(generatedFixtureRoot));
    runFixtureCli("write", generatedFixtureRoot);
    assert.deepEqual(inventoryBytes(fileInventory(generatedFixtureRoot)), firstWrite, "second full fixture write changed bytes or inventory");
    runFixtureCli("check", generatedFixtureRoot);
    assert.deepEqual(verifyPromptV2PreregistrationFixture({ root: generatedFixtureRoot }), fixtureSummary);
    assert.throws(() => runFixtureCli("check", generatedFixtureRoot, { sourceTree: "0".repeat(40) }), /exact source commit A revision\/tree/u);

    const bindingTamperRoot = resolve(fullFixtureTemporaryRoot, "binding-tamper");
    copyFixture(bindingTamperRoot);
    const tamperedBinding = readJson(resolve(bindingTamperRoot, "binding.json"));
    tamperedBinding.boundaries.runtime_activation_implied = true;
    writeJson(resolve(bindingTamperRoot, "binding.json"), tamperedBinding);
    assert.throws(() => verifyPromptV2PreregistrationFixture({ root: bindingTamperRoot }), /digest|runtime_activation|forbidden post-result/u);

    const objectTamperRoot = resolve(fullFixtureTemporaryRoot, "object-tamper");
    copyFixture(objectTamperRoot);
    const objectPath = fileInventory(resolve(objectTamperRoot, "store")).find(({ path }) => path.endsWith(".json")).path;
    const objectAbsolute = resolve(objectTamperRoot, "store", objectPath);
    writeFileSync(objectAbsolute, Buffer.concat([readFileSync(objectAbsolute), Buffer.from("\n")]));
    assert.throws(() => verifyPromptV2PreregistrationFixture({ root: objectTamperRoot }), /canonical byte form|tampered|digest/u);

    const orphanRoot = resolve(fullFixtureTemporaryRoot, "orphan");
    copyFixture(orphanRoot);
    putContentAddressedJson({
      storeRoot: resolve(orphanRoot, "store"),
      artifact: { schema_version: "1.0.0", object_kind: "asset_content_package", negative_fixture_orphan: true },
    });
    const orphanReference = readJson(resolve(orphanRoot, "reference.json"));
    refreshReferenceStoreInventory(orphanRoot, orphanReference);
    assert.throws(() => verifyPromptV2PreregistrationFixture({ root: orphanRoot }), /orphan|unreachable/u);

    const postResultRoot = resolve(fullFixtureTemporaryRoot, "post-result");
    copyFixture(postResultRoot);
    const forbiddenPublication = putContentAddressedJson({
      storeRoot: resolve(postResultRoot, "store"),
      artifact: { schema_version: "1.0.0", object_kind: "evolution_recommendation", negative_fixture_only: true },
    });
    const postResultReference = readJson(resolve(postResultRoot, "reference.json"));
    postResultReference.adapters[0].evolution.candidate_object_digest = forbiddenPublication.digest;
    refreshReferenceStoreInventory(postResultRoot, postResultReference);
    assert.throws(() => verifyPromptV2PreregistrationFixture({ root: postResultRoot }), /forbidden post-result object evolution_recommendation/u);

    const resultBoundaryRoot = resolve(fullFixtureTemporaryRoot, "result-boundary");
    copyFixture(resultBoundaryRoot);
    const resultBoundaryReference = readJson(resolve(resultBoundaryRoot, "reference.json"));
    resultBoundaryReference.boundaries.results_accessed = true;
    resultBoundaryReference.reference_digest = canonicalDigest(Object.fromEntries(
      Object.entries(resultBoundaryReference).filter(([key]) => key !== "reference_digest"),
    ));
    writeJson(resolve(resultBoundaryRoot, "reference.json"), resultBoundaryReference);
    assert.throws(() => verifyPromptV2PreregistrationFixture({ root: resultBoundaryRoot }), /forbidden result, lifecycle, or activation boundary/u);

    const privateBoundaryRoot = resolve(fullFixtureTemporaryRoot, "private-boundary");
    copyFixture(privateBoundaryRoot);
    const privateBoundaryReference = readJson(resolve(privateBoundaryRoot, "reference.json"));
    privateBoundaryReference.preregistration.path = "private/evaluator.json";
    privateBoundaryReference.reference_digest = canonicalDigest(Object.fromEntries(
      Object.entries(privateBoundaryReference).filter(([key]) => key !== "reference_digest"),
    ));
    writeJson(resolve(privateBoundaryRoot, "reference.json"), privateBoundaryReference);
    assert.throws(() => verifyPromptV2PreregistrationFixture({ root: privateBoundaryRoot }), /private\/result boundary/u);

    const nonPortableRoot = resolve(fullFixtureTemporaryRoot, "non-portable");
    copyFixture(nonPortableRoot);
    const nonPortableReference = readJson(resolve(nonPortableRoot, "reference.json"));
    nonPortableReference.fixture_root = "/absolute/not-portable";
    nonPortableReference.reference_digest = canonicalDigest(Object.fromEntries(
      Object.entries(nonPortableReference).filter(([key]) => key !== "reference_digest"),
    ));
    writeJson(resolve(nonPortableRoot, "reference.json"), nonPortableReference);
    assert.throws(() => verifyPromptV2PreregistrationFixture({ root: nonPortableRoot }), /portable repository-relative path/u);
  } finally {
    rmSync(fullFixtureTemporaryRoot, { recursive: true, force: true });
  }

  console.log("prompt-v2 preregistration fixture tests passed");
}

main();
