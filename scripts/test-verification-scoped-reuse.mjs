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
  verificationCommandIdentity,
} from "./verification-evidence.mjs";
import {
  VERIFICATION_SCOPED_REQUIREMENTS_PATH,
  buildCurrentCoverage,
  buildDeltaReviewRequest,
  currentRuntimeIdentity,
  dependencyInventory,
  gitRepositoryId,
  gitTreeDigest,
  planScopedReuse,
  sealDependencyManifest,
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

function gateRequirement({ evidence, manifestPath, obligations, deltaReview = null, authority = null, availability = "available" }) {
  return {
    gate_id: evidence.gate.gate_id,
    dependency_manifest_path: manifestPath,
    source_evidence_id: evidence.evidence_id,
    required_obligation_refs: obligations,
    authority: authority ?? acceptedAuthority(evidence),
    execution_availability: availability,
    delta_review: deltaReview,
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
  const sourceSelectors = [{ kind: "glob", pattern: "src/**", evidence_kind: "file" }];
  const schemaSelectors = [{ kind: "glob", pattern: "schema/**", evidence_kind: "schema" }];
  const sourceInventoryBeforeManifest = dependencyInventory({ repositoryRoot: root, revision: sourceRevision, selectors: sourceSelectors });
  const schemaInventoryBeforeManifest = dependencyInventory({ repositoryRoot: root, revision: sourceRevision, selectors: schemaSelectors });

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
  writeJson(root, sourceManifestPath, sourceManifest);
  writeJson(root, schemaManifestPath, schemaManifest);
  writeJson(root, unknownManifestPath, unknownManifest);
  const baseRevision = commitAll(root, "declare dependency manifests");

  const sourceInventory = dependencyInventory({ repositoryRoot: root, revision: baseRevision, selectors: sourceSelectors });
  const schemaInventory = dependencyInventory({ repositoryRoot: root, revision: baseRevision, selectors: schemaSelectors });
  assert.equal(sourceInventory.inventory_digest, sourceManifest.base_inventory_digest);
  assert.equal(schemaInventory.inventory_digest, schemaManifest.base_inventory_digest);

  const repositoryId = gitRepositoryId({ repositoryRoot: root });
  assert.equal(repositoryId, "github.com/example/scoped-reuse-fixture");
  const treeDigest = gitTreeDigest({ repositoryRoot: root, revision: baseRevision });
  const runtime = currentRuntimeIdentity();
  const producerKeys = generateKeyPairSync("ed25519");
  const sourceObligations = ["AC-source-gate"];
  const schemaObligations = ["AC-schema-gate"];
  const sourceEvidence = attestVerificationEvidence(evidenceDraft({
    repositoryId,
    baseRevision,
    treeDigest,
