#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  attestVerificationEvidence,
  putVerificationEvidence,
  producerIdentityDigestFromPublicKey,
  verificationCommandIdentity,
} from "./verification-evidence.mjs";
import {
  VERIFICATION_SCOPED_GATE_INVENTORY_PATH,
  VERIFICATION_SCOPED_REQUIREMENTS_PATH,
  buildCurrentCoverage,
  buildDeltaReviewRequest,
  currentRuntimeIdentity,
  dependencyInventory,
  gitRepositoryId,
  gitTreeDigest,
  planScopedReuse,
  sealDependencyManifest,
  sealScopedGateInventory,
  sealScopedRequirements,
} from "./verification-scoped-reuse.mjs";

const digest = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const rawDigest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function write(root, path, content) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writeJson(root, path, value) {
  write(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

function commitAll(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function gitBytes(root, revision, path) {
  const result = spawnSync("git", ["-C", root, "show", `${revision}:${path}`], { encoding: null, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString("utf8") || `git show ${path} failed`);
  return result.stdout;
}

function manifestDraft({ gateId, contractDigest, inventoryDigest, selectors, command, runner, completeness = "complete" }) {
  return {
    gate_id: gateId,
    gate_contract_digest: contractDigest,
    dependency_completeness: completeness,
    base_inventory_digest: inventoryDigest,
    selectors,
    execution: { command, runner },
    runtime_observation: completeness === "complete"
      ? { mode: "node_process_v1", toolchain_names: ["node"] }
      : { mode: "unknown", toolchain_names: ["node"] },
    invalidation: { unknown_dependencies_require_rerun: true },
  };
}

function evidenceDraft({ repositoryId, baseRevision, treeDigest, manifestPath, manifestBytes, manifest, inventory, obligations, runtime, producerKind = "developer", override = {} }) {
  const consumed = inventory.entries.map((entry) => ({
    kind: entry.evidence_kind,
    path: entry.path,
    digest: entry.content_digest,
  }));
  consumed.push({ kind: "manifest", path: manifestPath, digest: rawDigest(manifestBytes) });
  consumed.sort((left, right) => `${left.path}\0${left.kind}\0${left.digest}`.localeCompare(`${right.path}\0${right.kind}\0${right.digest}`));
  const base = {
    schema_version: "1.0.0",
    schema_path: "schemas/verification-evidence.schema.json",
    program: "ask_verification_evidence",
    gate: {
      gate_id: manifest.gate_id,
      contract_digest: manifest.gate_contract_digest,
      category: "test",
    },
    target: {
      repository_id: repositoryId,
      target_revision: baseRevision,
      tree_digest: treeDigest,
    },
    consumed_inputs: consumed,
    execution: {
      command: manifest.execution.command,
      runner: manifest.execution.runner,
      toolchain: runtime.toolchain,
      environment: runtime.environment,
      terminal: {
        status: "succeeded",
        exit_code: 0,
        duration_ms: 25,
        output_bytes: 4,
        output_digest: digest(`${manifest.gate_id}:pass`),
      },
    },
    coverage: {
      obligation_refs: obligations,
      explicit_non_coverage: [],
    },
    invalidation: {
      mode: "exact_identity_only",
      unknown_dependencies_require_rerun: true,
    },
    producer: { kind: producerKind },
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
  return { ...base, ...structuredClone(override) };
}

function acceptedAuthority(evidence) {
  return {
    independent_judgment_required: false,
    accepted_producers: [{ kind: evidence.producer.kind, identity_digest: evidence.producer.identity_digest }],
    accepted_evidence_levels: ["executed"],
  };
}

function sourceReviewRequirement() {
  return {
    surface_selectors: [{ kind: "glob", pattern: "src/**" }],
    obligation_refs: ["independent-semantic-review"],
    prior_review_ref: "review-baseline-1",
    prior_finding_refs: ["finding-baseline-1"],
  };
}

function gateRequirement({ evidence, manifestPath, obligations, deltaReview = undefined, authority = null, availability = "available" }) {
  return {
    gate_id: evidence.gate.gate_id,
    dependency_manifest_path: manifestPath,
    source_evidence_id: evidence.evidence_id,
    required_obligation_refs: obligations,
    authority: authority ?? acceptedAuthority(evidence),
    execution_availability: availability,
    delta_review: deltaReview === undefined && manifestPath.endsWith("source-gate.json") ? sourceReviewRequirement() : (deltaReview ?? null),
  };
}

const root = mkdtempSync(resolve(tmpdir(), "ask-scoped-reuse-"));
try {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "ASK scoped reuse test"]);
  git(root, ["config", "user.email", "ask-scoped-reuse@example.invalid"]);
  git(root, ["remote", "add", "origin", "https://github.com/example/scoped-reuse-fixture.git"]);

  write(root, "src/app.mjs", "export const answer = 42;\n");
  write(root, "schema/model.json", "{\"type\":\"object\"}\n");
  write(root, "tests/app.test.mjs", "assert.equal(answer, 42);\n");
  write(root, "generator/build.mjs", "export const generatorVersion = 1;\n");
  write(root, "config/gate.json", "{\"strict\":true}\n");
  write(root, "fixtures/input.json", "{\"case\":1}\n");
  write(root, "docs/readme.md", "# Fixture\n");
  const sourceRevision = commitAll(root, "fixture source");

  const command = verificationCommandIdentity({
    executable: "node",
    argument_identities: [{ kind: "public", identity_digest: digest("test command") }],
    working_directory: ".",
  });
  const runner = {
    runner_id: "ask-local-node",
    runner_version: "1.0.0",
    adapter_id: "codex",
    adapter_version: "1.0.0",
    evidence_level: "executed",
  };
  const producerKeys = generateKeyPairSync("ed25519");
  const producerIdentity = producerIdentityDigestFromPublicKey(producerKeys.publicKey);
  const sourceObligations = ["AC-source-gate"];
  const schemaObligations = ["AC-schema-gate"];
  const sourceSelectors = [
    { kind: "glob", pattern: "config/**", evidence_kind: "dependency" },
    { kind: "glob", pattern: "fixtures/**", evidence_kind: "fixture" },
    { kind: "glob", pattern: "generator/**", evidence_kind: "dependency" },
    { kind: "glob", pattern: "src/**", evidence_kind: "file" },
    { kind: "glob", pattern: "tests/**", evidence_kind: "file" },
  ];
  const schemaSelectors = [{ kind: "glob", pattern: "schema/**", evidence_kind: "schema" }];
  const sourceInventoryBeforeManifest = dependencyInventory({ repositoryRoot: root, revision: sourceRevision, selectors: sourceSelectors });
  const schemaInventoryBeforeManifest = dependencyInventory({ repositoryRoot: root, revision: sourceRevision, selectors: schemaSelectors });

  // Root directory selectors cover the whole tree, including when mixed with files.
  const rootSelector = { kind: "directory", pattern: ".", evidence_kind: "file" };
  const rootInventory = dependencyInventory({ repositoryRoot: root, revision: sourceRevision, selectors: [rootSelector] });
  const allFilesInventory = dependencyInventory({ repositoryRoot: root, revision: sourceRevision, selectors: [
    { kind: "glob", pattern: "**", evidence_kind: "file" },
  ] });
  assert.equal(rootInventory.inventory_digest, allFilesInventory.inventory_digest);
  assert.equal(rootInventory.entries.length, 7);
  assert.equal(dependencyInventory({ repositoryRoot: root, revision: sourceRevision, selectors: [
    rootSelector,
    { kind: "file", pattern: "tests/app.test.mjs", evidence_kind: "file" },
  ] }).inventory_digest, rootInventory.inventory_digest);
  assert.deepEqual(dependencyInventory({ repositoryRoot: root, revision: sourceRevision, selectors: [
    { kind: "directory", pattern: "src", evidence_kind: "file" },
  ] }).entries.map((entry) => entry.path), ["src/app.mjs"]);

  const sourceManifestPath = ".ask/manifests/source-gate.json";
  const schemaManifestPath = ".ask/manifests/schema-gate.json";
  const unknownManifestPath = ".ask/manifests/unknown-gate.json";
  const sourceManifest = sealDependencyManifest(manifestDraft({
    gateId: "source-test",
    contractDigest: digest("source-contract-v1"),
    inventoryDigest: sourceInventoryBeforeManifest.inventory_digest,
    selectors: sourceSelectors,
    command,
    runner,
  }));
  const schemaManifest = sealDependencyManifest(manifestDraft({
    gateId: "schema-test",
    contractDigest: digest("schema-contract-v1"),
    inventoryDigest: schemaInventoryBeforeManifest.inventory_digest,
    selectors: schemaSelectors,
    command,
    runner,
  }));
  const unknownManifest = sealDependencyManifest(manifestDraft({
    gateId: "unknown-test",
    contractDigest: digest("unknown-contract-v1"),
    inventoryDigest: sourceInventoryBeforeManifest.inventory_digest,
    selectors: sourceSelectors,
    command,
    runner,
    completeness: "incomplete",
  }));
  const baselineAuthority = {
    independent_judgment_required: false,
    accepted_producers: [{ kind: "developer", identity_digest: producerIdentity }],
    accepted_evidence_levels: ["executed"],
  };
  const baseGateInventory = sealScopedGateInventory({
    required_gates: [
      {
        gate_id: "source-test",
        dependency_manifest_path: sourceManifestPath,
        required_obligation_refs: sourceObligations,
        authority: baselineAuthority,
        execution_availability: "available",
        delta_review: sourceReviewRequirement(),
      },
      {
        gate_id: "schema-test",
        dependency_manifest_path: schemaManifestPath,
        required_obligation_refs: schemaObligations,
        authority: baselineAuthority,
        execution_availability: "available",
        delta_review: null,
      },
    ],
    current_obligations: [],
  });
  writeJson(root, sourceManifestPath, sourceManifest);
  writeJson(root, schemaManifestPath, schemaManifest);
  writeJson(root, unknownManifestPath, unknownManifest);
  writeJson(root, VERIFICATION_SCOPED_GATE_INVENTORY_PATH, baseGateInventory);
  const baseRevision = commitAll(root, "declare dependency manifests and gate inventory");

  const sourceInventory = dependencyInventory({ repositoryRoot: root, revision: baseRevision, selectors: sourceSelectors });
  const schemaInventory = dependencyInventory({ repositoryRoot: root, revision: baseRevision, selectors: schemaSelectors });
  assert.equal(sourceInventory.inventory_digest, sourceManifest.base_inventory_digest);
  assert.equal(schemaInventory.inventory_digest, schemaManifest.base_inventory_digest);

  const repositoryId = gitRepositoryId({ repositoryRoot: root });
  assert.equal(repositoryId, "github.com/example/scoped-reuse-fixture");
  const treeDigest = gitTreeDigest({ repositoryRoot: root, revision: baseRevision });
  const runtime = currentRuntimeIdentity();
  const sourceEvidence = attestVerificationEvidence(evidenceDraft({
    repositoryId,
    baseRevision,
    treeDigest,
    manifestPath: sourceManifestPath,
    manifestBytes: gitBytes(root, baseRevision, sourceManifestPath),
    manifest: sourceManifest,
    inventory: sourceInventory,
    obligations: sourceObligations,
    runtime,
  }), { privateKey: producerKeys.privateKey });
  const schemaEvidence = attestVerificationEvidence(evidenceDraft({
    repositoryId,
    baseRevision,
    treeDigest,
    manifestPath: schemaManifestPath,
    manifestBytes: gitBytes(root, baseRevision, schemaManifestPath),
    manifest: schemaManifest,
    inventory: schemaInventory,
    obligations: schemaObligations,
    runtime,
  }), { privateKey: producerKeys.privateKey });
  const store = resolve(root, ".evidence-store");
  putVerificationEvidence({ storeRoot: store, evidence: sourceEvidence });
  putVerificationEvidence({ storeRoot: store, evidence: schemaEvidence });

  const defaultRequirements = sealScopedRequirements({
    base_revision: baseRevision,
    gate_inventory_id: baseGateInventory.inventory_id,
    gate_inventory_digest: baseGateInventory.inventory_digest,
    required_gates: [
      gateRequirement({
        evidence: sourceEvidence,
        manifestPath: sourceManifestPath,
        obligations: sourceObligations,
        deltaReview: {
          surface_selectors: [{ kind: "glob", pattern: "src/**" }],
          obligation_refs: ["independent-semantic-review"],
          prior_review_ref: "review-baseline-1",
          prior_finding_refs: ["finding-baseline-1"],
        },
      }),
      gateRequirement({ evidence: schemaEvidence, manifestPath: schemaManifestPath, obligations: schemaObligations }),
    ],
    current_obligations: [],
  });
  writeJson(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, defaultRequirements);
  const requirementsTarget = commitAll(root, "bind current scoped requirements");

  const initialPlan = planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: requirementsTarget });
  assert.deepEqual(initialPlan.dispositions.map((entry) => entry.disposition), ["reuse_scoped", "reuse_scoped"]);
  assert.equal(initialPlan.coverage.status, "covered");
  assert.deepEqual(initialPlan.execution_summary, {
    required_gate_count: 2,
    full_rerun_gate_count: 2,
    reused_execution_gate_count: 2,
    rerun_gate_count: 0,
    saved_execution_gate_count: 2,
  });
  const initialDelta = buildDeltaReviewRequest({ repositoryRoot: root, targetRevision: requirementsTarget, plan: initialPlan });
  assert.equal(initialDelta.status, "not_required");
  assert.deepEqual(initialDelta.affected_paths, []);
  const initialCoverage = buildCurrentCoverage({ repositoryRoot: root, storeRoot: store, targetRevision: requirementsTarget });
  assert.equal(initialCoverage.coverage.status, "covered");

  git(root, ["checkout", "-B", "case-requirement-shrink", requirementsTarget]);
  writeJson(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, sealScopedRequirements({
    base_revision: baseRevision,
    gate_inventory_id: baseGateInventory.inventory_id,
    gate_inventory_digest: baseGateInventory.inventory_digest,
    required_gates: [gateRequirement({ evidence: sourceEvidence, manifestPath: sourceManifestPath, obligations: sourceObligations, deltaReview: {
      surface_selectors: [{ kind: "glob", pattern: "src/**" }],
      obligation_refs: ["independent-semantic-review"],
      prior_review_ref: "review-baseline-1",
      prior_finding_refs: ["finding-baseline-1"],
    } })],
    current_obligations: [],
  }));
  const shrinkTarget = commitAll(root, "attempt to shrink required gate inventory");
  assert.throws(() => planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: shrinkTarget }), /cannot add or remove gate inventory entries/u);

  git(root, ["checkout", "-B", "case-gate-inventory-tamper", requirementsTarget]);
  write(root, VERIFICATION_SCOPED_GATE_INVENTORY_PATH, `${readFileSync(resolve(root, VERIFICATION_SCOPED_GATE_INVENTORY_PATH), "utf8").trimEnd()}\n \n`);
  const gateInventoryTamperTarget = commitAll(root, "tamper gate inventory bytes");
  assert.throws(() => planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: gateInventoryTamperTarget }), /gate inventory changed between base and target/u);

  git(root, ["checkout", "-B", "case-docs", requirementsTarget]);
  write(root, "docs/readme.md", "# Fixture\n\nDocs-only change.\n");
  const docsTarget = commitAll(root, "docs only");
  const docsPlan = planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: docsTarget });
  assert.deepEqual(docsPlan.dispositions.map((entry) => entry.disposition), ["reuse_scoped", "reuse_scoped"]);
  assert.equal(docsPlan.execution_summary.rerun_gate_count, 0);
  assert.equal(docsPlan.execution_summary.saved_execution_gate_count, 2);
  assert.equal(buildCurrentCoverage({ repositoryRoot: root, storeRoot: store, targetRevision: docsTarget }).coverage.status, "covered");

  for (const [label, path, content] of [
    ["test", "tests/app.test.mjs", "assert.equal(answer, 43);\n"],
    ["generator", "generator/build.mjs", "export const generatorVersion = 2;\n"],
    ["dependency-config", "config/gate.json", "{\"strict\":false}\n"],
    ["fixture", "fixtures/input.json", "{\"case\":2}\n"],
  ]) {
    git(root, ["checkout", "-B", `case-${label}`, requirementsTarget]);
    write(root, path, content);
    const target = commitAll(root, `change ${label} dependency`);
    const disposition = planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: target }).dispositions.find((entry) => entry.gate_id === "source-test");
    assert.equal(disposition.reason_code, "declared_dependency_changed", `${label} changes must invalidate the source gate`);
  }

  git(root, ["checkout", "-B", "case-source", requirementsTarget]);
  write(root, "src/app.mjs", "export const answer = 43;\n");
  const sourceTarget = commitAll(root, "change source");
  const sourcePlan = planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: sourceTarget });
  const sourceByGate = new Map(sourcePlan.dispositions.map((entry) => [entry.gate_id, entry]));
  assert.equal(sourceByGate.get("source-test").disposition, "rerun_required");
  assert.equal(sourceByGate.get("source-test").reason_code, "declared_dependency_changed");
  assert.equal(sourceByGate.get("schema-test").disposition, "reuse_scoped");
  assert.equal(sourcePlan.execution_summary.rerun_gate_count, 1);
  const sourceDelta = buildDeltaReviewRequest({ repositoryRoot: root, targetRevision: sourceTarget, plan: sourcePlan });
  assert.equal(sourceDelta.status, "current_judgment_required");
  assert.deepEqual(sourceDelta.affected_paths, ["src/app.mjs"]);
  assert.deepEqual(sourceDelta.prior_review_refs, ["review-baseline-1"]);
  assert.deepEqual(sourceDelta.prior_finding_refs, ["finding-baseline-1"]);
  assert.equal(sourceDelta.privacy.raw_diff_stored, false);
  const sourceCoverage = buildCurrentCoverage({ repositoryRoot: root, storeRoot: store, targetRevision: sourceTarget }).coverage;
  assert.equal(sourceCoverage.status, "blocked");
  assert.ok(sourceCoverage.blockers.some((entry) => entry.reason_code === "current_delta_judgment_unperformed"));

  git(root, ["checkout", "-B", "case-add", requirementsTarget]);
  write(root, "src/new.mjs", "export const added = true;\n");
  const addTarget = commitAll(root, "add selected input");
  assert.equal(planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: addTarget }).dispositions.find((entry) => entry.gate_id === "source-test").reason_code, "declared_dependency_changed");

  git(root, ["checkout", "-B", "case-delete", requirementsTarget]);
  git(root, ["rm", "src/app.mjs"]);
  const deleteTarget = commitAll(root, "delete selected input");
  assert.equal(planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: deleteTarget }).dispositions.find((entry) => entry.gate_id === "source-test").reason_code, "declared_dependency_changed");

  git(root, ["checkout", "-B", "case-copy", requirementsTarget]);
  write(root, "src/copy.mjs", readFileSync(resolve(root, "src/app.mjs"), "utf8"));
  const copyTarget = commitAll(root, "copy selected input");
  const copyPlan = planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: copyTarget });
  assert.equal(copyPlan.dispositions.find((entry) => entry.gate_id === "source-test").reason_code, "declared_dependency_changed");
  assert.ok(copyPlan.actual_diff.change_records.some((entry) => entry.status === "copied" && entry.old_path === "src/app.mjs" && entry.new_path === "src/copy.mjs"));

  git(root, ["checkout", "-B", "case-rename", requirementsTarget]);
  git(root, ["mv", "src/app.mjs", "src/main.mjs"]);
  const renameTarget = commitAll(root, "rename selected input");
  const renamePlan = planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: renameTarget });
  assert.equal(renamePlan.dispositions.find((entry) => entry.gate_id === "source-test").reason_code, "declared_dependency_changed");
  assert.ok(renamePlan.actual_diff.changed_paths.includes("src/app.mjs"));
  assert.ok(renamePlan.actual_diff.changed_paths.includes("src/main.mjs"));
  assert.ok(renamePlan.actual_diff.change_records.some((entry) => entry.status === "renamed" && entry.old_path === "src/app.mjs" && entry.new_path === "src/main.mjs"));

  git(root, ["checkout", "-B", "case-mode", requirementsTarget]);
  const chmodResult = spawnSync("chmod", ["+x", resolve(root, "src/app.mjs")], { encoding: "utf8" });
  assert.equal(chmodResult.status, 0, chmodResult.stderr || "chmod failed");
  const modeTarget = commitAll(root, "change selected input mode");
  const modeDetail = planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: modeTarget }).dispositions.find((entry) => entry.gate_id === "source-test").detail;
  assert.ok(modeDetail.some((entry) => entry.kind === "mode_changed"));

  git(root, ["checkout", "-B", "case-manifest", requirementsTarget]);
  write(root, sourceManifestPath, `${readFileSync(resolve(root, sourceManifestPath), "utf8").trimEnd()}\n \n`);
  const manifestTarget = commitAll(root, "tamper manifest bytes");
  assert.equal(planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: manifestTarget }).dispositions.find((entry) => entry.gate_id === "source-test").reason_code, "dependency_manifest_changed");

  const unboundEvidenceDraft = evidenceDraft({
    repositoryId,
    baseRevision,
    treeDigest,
    manifestPath: sourceManifestPath,
    manifestBytes: gitBytes(root, baseRevision, sourceManifestPath),
    manifest: sourceManifest,
    inventory: sourceInventory,
    obligations: sourceObligations,
    runtime,
  });
  unboundEvidenceDraft.consumed_inputs = unboundEvidenceDraft.consumed_inputs.filter((entry) => entry.path !== sourceManifestPath);
  const unboundEvidence = attestVerificationEvidence(unboundEvidenceDraft, { privateKey: producerKeys.privateKey });
  putVerificationEvidence({ storeRoot: store, evidence: unboundEvidence });
  git(root, ["checkout", "-B", "case-unbound-evidence", requirementsTarget]);
  const unboundRequirements = sealScopedRequirements({
    base_revision: baseRevision,
    gate_inventory_id: baseGateInventory.inventory_id,
    gate_inventory_digest: baseGateInventory.inventory_digest,
    required_gates: [
      gateRequirement({ evidence: unboundEvidence, manifestPath: sourceManifestPath, obligations: sourceObligations }),
      gateRequirement({ evidence: schemaEvidence, manifestPath: schemaManifestPath, obligations: schemaObligations }),
    ],
    current_obligations: [],
  });
  writeJson(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, unboundRequirements);
  const unboundTarget = commitAll(root, "bind unbound source evidence");
  assert.equal(planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: unboundTarget }).dispositions.find((entry) => entry.gate_id === "source-test").reason_code, "source_evidence_input_mismatch");

  const changedRuntime = structuredClone(runtime);
  changedRuntime.toolchain[0].version = "v0.0.0";
  changedRuntime.toolchain[0].identity_digest = digest("non-current-node");
  const staleRuntimeEvidence = attestVerificationEvidence(evidenceDraft({
    repositoryId,
    baseRevision,
    treeDigest,
    manifestPath: sourceManifestPath,
    manifestBytes: gitBytes(root, baseRevision, sourceManifestPath),
    manifest: sourceManifest,
    inventory: sourceInventory,
    obligations: sourceObligations,
    runtime: changedRuntime,
  }), { privateKey: producerKeys.privateKey });
  putVerificationEvidence({ storeRoot: store, evidence: staleRuntimeEvidence });
  git(root, ["checkout", "-B", "case-runtime", requirementsTarget]);
  writeJson(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, sealScopedRequirements({
    base_revision: baseRevision,
    gate_inventory_id: baseGateInventory.inventory_id,
    gate_inventory_digest: baseGateInventory.inventory_digest,
    required_gates: [
      gateRequirement({ evidence: staleRuntimeEvidence, manifestPath: sourceManifestPath, obligations: sourceObligations }),
      gateRequirement({ evidence: schemaEvidence, manifestPath: schemaManifestPath, obligations: schemaObligations }),
    ],
    current_obligations: [],
  }));
  const runtimeTarget = commitAll(root, "bind stale runtime evidence");
  assert.equal(planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: runtimeTarget }).dispositions.find((entry) => entry.gate_id === "source-test").reason_code, "toolchain_changed");

  git(root, ["checkout", "-B", "case-unknown-base", requirementsTarget]);
  const unknownGateInventory = sealScopedGateInventory({
    required_gates: [{
      gate_id: "unknown-test",
      dependency_manifest_path: unknownManifestPath,
      required_obligation_refs: ["AC-unknown"],
      authority: baselineAuthority,
      execution_availability: "available",
      delta_review: null,
    }],
    current_obligations: [],
  });
  writeJson(root, VERIFICATION_SCOPED_GATE_INVENTORY_PATH, unknownGateInventory);
  const unknownBase = commitAll(root, "establish incomplete dependency baseline");
  writeJson(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, sealScopedRequirements({
    base_revision: unknownBase,
    gate_inventory_id: unknownGateInventory.inventory_id,
    gate_inventory_digest: unknownGateInventory.inventory_digest,
    required_gates: [{
      gate_id: "unknown-test",
      dependency_manifest_path: unknownManifestPath,
      source_evidence_id: `verification-evidence-${"0".repeat(64)}`,
      required_obligation_refs: ["AC-unknown"],
      authority: baselineAuthority,
      execution_availability: "available",
      delta_review: null,
    }],
    current_obligations: [],
  }));
  const unknownTarget = commitAll(root, "require incomplete dependency gate");
  assert.equal(planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: unknownTarget }).dispositions[0].reason_code, "dependency_information_incomplete");

  git(root, ["checkout", "-B", "case-independent", requirementsTarget]);
  const independentAuthority = acceptedAuthority(sourceEvidence);
  independentAuthority.independent_judgment_required = true;
  writeJson(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, sealScopedRequirements({
    base_revision: baseRevision,
    gate_inventory_id: baseGateInventory.inventory_id,
    gate_inventory_digest: baseGateInventory.inventory_digest,
    required_gates: [
      gateRequirement({ evidence: sourceEvidence, manifestPath: sourceManifestPath, obligations: sourceObligations, authority: independentAuthority }),
      gateRequirement({ evidence: schemaEvidence, manifestPath: schemaManifestPath, obligations: schemaObligations }),
    ],
    current_obligations: [],
  }));
  const independentTarget = commitAll(root, "require independent judgment");
  const independentPlan = planScopedReuse({ repositoryRoot: root, storeRoot: store, targetRevision: independentTarget });
  const independentSource = independentPlan.dispositions.find((entry) => entry.gate_id === "source-test");
  assert.equal(independentSource.disposition, "independent_judgment_required");
  assert.equal(independentSource.execution_evidence_reusable, true);
  assert.equal(buildCurrentCoverage({ repositoryRoot: root, storeRoot: store, targetRevision: independentTarget }).coverage.status, "blocked");

  git(root, ["checkout", "-B", "case-external", requirementsTarget]);
  writeJson(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, sealScopedRequirements({
    base_revision: baseRevision,
    gate_inventory_id: baseGateInventory.inventory_id,
    gate_inventory_digest: baseGateInventory.inventory_digest,
    required_gates: [
      gateRequirement({ evidence: sourceEvidence, manifestPath: sourceManifestPath, obligations: sourceObligations }),
      gateRequirement({ evidence: schemaEvidence, manifestPath: schemaManifestPath, obligations: schemaObligations }),
    ],
    current_obligations: [{ obligation_id: "pr-head-current", kind: "pr_head" }],
  }));
  const externalTarget = commitAll(root, "require current PR observation");
  const externalCoverage = buildCurrentCoverage({ repositoryRoot: root, storeRoot: store, targetRevision: externalTarget }).coverage;
  assert.equal(externalCoverage.status, "blocked");
  assert.deepEqual(externalCoverage.blockers, [{ kind: "current_observation", ref: "pr-head-current", reason_code: "current_observation_required" }]);
  assert.throws(() => sealScopedRequirements({
    base_revision: baseRevision,
    gate_inventory_id: baseGateInventory.inventory_id,
    gate_inventory_digest: baseGateInventory.inventory_digest,
    required_gates: [
      gateRequirement({ evidence: sourceEvidence, manifestPath: sourceManifestPath, obligations: sourceObligations }),
      gateRequirement({ evidence: schemaEvidence, manifestPath: schemaManifestPath, obligations: schemaObligations }),
    ],
    current_obligations: [{ obligation_id: "pr-head-current", kind: "pr_head", fresh: true }],
  }), /schema|additional|propert/iu, "self-reported freshness must not satisfy current-state coverage");

  const cli = spawnSync(process.execPath, [
    resolve("scripts/verification-scoped-reuse.mjs"),
    "coverage",
    "--repository", root,
    "--store", store,
    "--target", externalTarget,
  ], { cwd: resolve("."), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(JSON.parse(cli.stdout).coverage.status, "blocked");

  // Establish fresh authority and signed evidence when changing a review surface.
  // Stage only named files so an intentionally unpopulated gitlink stays in the tree.
  function reviewBaseline(label, surfaceSelectors, withGitlink = false) {
    git(root, ["checkout", "-B", `case-review-${label}`, requirementsTarget]);
    const review = { ...sourceReviewRequirement(), surface_selectors: surfaceSelectors };
    const inventory = sealScopedGateInventory({
      required_gates: [{
        ...baseGateInventory.required_gates.find((gate) => gate.gate_id === "schema-test"),
        delta_review: review,
      }],
      current_obligations: [],
    });
    writeJson(root, VERIFICATION_SCOPED_GATE_INVENTORY_PATH, inventory);
    git(root, ["add", "--", VERIFICATION_SCOPED_GATE_INVENTORY_PATH]);
    if (withGitlink) {
      write(root, ".gitmodules", '[submodule "vendor/lib"]\n\tpath = vendor/lib\n\turl = https://example.invalid/lib.git\n\tignore = all\n');
      git(root, ["add", "--", ".gitmodules"]);
      git(root, ["update-index", "--add", "--cacheinfo", `160000,${sourceRevision},vendor/lib`]);
    }
    git(root, ["commit", "-m", `declare ${label} review baseline`]);
    const reviewBase = git(root, ["rev-parse", "HEAD"]);
    const evidence = attestVerificationEvidence(evidenceDraft({
      repositoryId,
      baseRevision: reviewBase,
      treeDigest: gitTreeDigest({ repositoryRoot: root, revision: reviewBase }),
      manifestPath: schemaManifestPath,
      manifestBytes: gitBytes(root, reviewBase, schemaManifestPath),
      manifest: schemaManifest,
      inventory: schemaInventory,
      obligations: schemaObligations,
      runtime,
    }), { privateKey: producerKeys.privateKey });
    putVerificationEvidence({ storeRoot: store, evidence });
    writeJson(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, sealScopedRequirements({
      base_revision: reviewBase,
      gate_inventory_id: inventory.inventory_id,
      gate_inventory_digest: inventory.inventory_digest,
      required_gates: [gateRequirement({ evidence, manifestPath: schemaManifestPath, obligations: schemaObligations, deltaReview: review })],
      current_obligations: [],
    }));
    git(root, ["add", "--", VERIFICATION_SCOPED_REQUIREMENTS_PATH]);
    git(root, ["commit", "-m", `bind ${label} review evidence`]);
    return git(root, ["rev-parse", "HEAD"]);
  }

  for (const [label, selectors] of [
    ["root", [{ kind: "directory", pattern: "." }]],
    ["nested", [{ kind: "directory", pattern: "docs" }]],
  ]) {
    reviewBaseline(label, selectors);
    write(root, "docs/readme.md", "# Changed review-only surface\n");
    write(root, "docs-extra/readme.md", "# Not under docs/\n");
    git(root, ["add", "--", "docs/readme.md", "docs-extra/readme.md"]);
    git(root, ["commit", "-m", `change ${label} review surface`]);
    const target = git(root, ["rev-parse", "HEAD"]);
    const result = buildCurrentCoverage({ repositoryRoot: root, storeRoot: store, targetRevision: target });
    assert.deepEqual(result.plan.dispositions.map((entry) => entry.disposition), ["reuse_scoped"]);
    assert.equal(result.delta_review_request.status, "current_judgment_required");
    assert.deepEqual(result.delta_review_request.affected_paths, label === "root" ? result.plan.actual_diff.changed_paths : ["docs/readme.md"]);
    assert.ok(result.delta_review_request.affected_paths.includes("docs/readme.md"));
    assert.equal(result.coverage.status, "blocked");
    assert.deepEqual(result.coverage.blockers.map((entry) => entry.reason_code), ["current_delta_judgment_unperformed"]);
  }

  // A root dependency selector must still reject inclusion of its own manifest.
  for (const [label, selectors] of [
    ["root", [rootSelector]],
    ["root-and-file", [rootSelector, { kind: "file", pattern: "tests/app.test.mjs", evidence_kind: "file" }]],
  ]) {
    git(root, ["checkout", "-B", `case-self-manifest-${label}`, requirementsTarget]);
    const manifestPath = ".ask/manifests/root-gate.json";
    writeJson(root, manifestPath, sealDependencyManifest(manifestDraft({
      gateId: "root-test",
      contractDigest: digest("root-contract-v1"),
      inventoryDigest: rootInventory.inventory_digest,
      selectors,
      command,
      runner,
    })));
    const inventory = sealScopedGateInventory({
      required_gates: [{
        gate_id: "root-test",
        dependency_manifest_path: manifestPath,
        required_obligation_refs: ["AC-root"],
        authority: baselineAuthority,
        execution_availability: "available",
        delta_review: null,
      }],
      current_obligations: [],
    });
    writeJson(root, VERIFICATION_SCOPED_GATE_INVENTORY_PATH, inventory);
    const selfBase = commitAll(root, `declare ${label} self-selecting manifest`);
    writeJson(root, VERIFICATION_SCOPED_REQUIREMENTS_PATH, sealScopedRequirements({
      base_revision: selfBase,
      gate_inventory_id: inventory.inventory_id,
      gate_inventory_digest: inventory.inventory_digest,
      required_gates: [{ ...inventory.required_gates[0], source_evidence_id: sourceEvidence.evidence_id }],
      current_obligations: [],
    }));
    const target = commitAll(root, `require ${label} self-selecting gate`);
    const result = buildCurrentCoverage({ repositoryRoot: root, storeRoot: store, targetRevision: target });
    assert.equal(result.plan.dispositions[0].disposition, "rerun_required");
    assert.equal(result.plan.dispositions[0].reason_code, "dependency_manifest_invalid");
    assert.match(result.plan.dispositions[0].detail, /must not include its own path/u);
    assert.equal(result.coverage.status, "blocked");
  }

  const gitlinkBefore = reviewBaseline("gitlink", [{ kind: "file", pattern: "vendor/lib" }], true);
  assert.equal(buildCurrentCoverage({ repositoryRoot: root, storeRoot: store, targetRevision: gitlinkBefore }).coverage.status, "covered");
  git(root, ["update-index", "--cacheinfo", `160000,${baseRevision},vendor/lib`]);
  git(root, ["commit", "-m", "change review-only gitlink"]);
  const gitlinkTarget = git(root, ["rev-parse", "HEAD"]);
  let gitlinkReference = null;
  try {
    for (const diffIgnore of ["none", "all"]) {
      for (const submoduleIgnore of ["none", "all"]) {
        git(root, ["config", "diff.ignoreSubmodules", diffIgnore]);
        git(root, ["config", "submodule.vendor/lib.ignore", submoduleIgnore]);
        const result = buildCurrentCoverage({ repositoryRoot: root, storeRoot: store, targetRevision: gitlinkTarget });
        assert.equal(result.plan.actual_diff.truncated, false);
        assert.ok(result.plan.actual_diff.change_records.some((entry) => entry.status === "modified" && entry.new_path === "vendor/lib"));
        assert.deepEqual(result.plan.dispositions.map((entry) => entry.disposition), ["reuse_scoped"]);
        assert.equal(result.delta_review_request.status, "current_judgment_required");
        assert.deepEqual(result.delta_review_request.affected_paths, ["vendor/lib"]);
        assert.equal(result.coverage.status, "blocked");
        assert.deepEqual(result.coverage.blockers.map((entry) => entry.reason_code), ["current_delta_judgment_unperformed"]);
        if (gitlinkReference) assert.deepEqual(result, gitlinkReference, "Git ignore settings must not change the same-target plan, request, or coverage");
        else gitlinkReference = result;
      }
    }
  } finally {
    git(root, ["config", "--unset-all", "diff.ignoreSubmodules"]);
    git(root, ["config", "--unset-all", "submodule.vendor/lib.ignore"]);
  }

  console.log("verification scoped reuse tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
