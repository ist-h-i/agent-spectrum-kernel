#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { validateMnBuildOptionUpdatePublicFixture } from "./ask-benchmark-mn-build-option-update.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE_ID = "mn-build-option-update";
const FIXTURE_ROOT = `benchmarks/fixtures/checkpoint-b2/${FIXTURE_ID}`;

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readJson(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} is missing or invalid`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`${label} is invalid JSON`); }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function semanticDigest(name, value) {
  if (name === "input-manifest.json") return canonicalDigest(value.fixtures[FIXTURE_ID]);
  if (name === "evidence-map.json") return canonicalDigest(value);
  return value[{
    "admission-review.json": "review_package_digest",
    "evaluator-authority-manifest.json": "manifest_digest",
    "evaluator-reference.json": "public_metadata_digest",
    "final-admission-record.json": "admission_digest",
    "metadata.json": "metadata_digest",
    "output-contract.json": "output_contract_digest",
    "requirement-record.json": "requirement_record_digest",
    "scoring-input-freeze-manifest.json": "manifest_digest",
    "verification-command-contract.json": "contract_digest",
  }[name]];
}

function binding(root, name) {
  const path = `${FIXTURE_ROOT}/${name}`;
  const bytes = readFileSync(resolve(root, path));
  return { path, raw_sha256: sha256(bytes), semantic_digest: semanticDigest(name, JSON.parse(bytes.toString("utf8"))) };
}

export function finalizeMnBuildOptionUpdateSuccessorAuthority({ root = ROOT, privateRoot } = {}) {
  if (!privateRoot || !existsSync(privateRoot) || !lstatSync(privateRoot).isDirectory() || lstatSync(privateRoot).isSymbolicLink()) throw new Error("mn-build successor finalizer requires an existing non-symlink private root");
  const repository = realpathSync(root);
  const privateDirectory = realpathSync(privateRoot);
  if (privateDirectory === repository || privateDirectory.startsWith(`${repository}/`)) throw new Error("mn-build successor private root must stay outside the repository");
  const fixtureRoot = resolve(repository, FIXTURE_ROOT);
  const bundle = readJson(resolve(privateDirectory, "private-evaluator-bundle.json"), "mn-build private bundle");
  const reference = readJson(resolve(fixtureRoot, "evaluator-reference.json"), "mn-build evaluator reference");
  const admission = readJson(resolve(fixtureRoot, "final-admission-record.json"), "mn-build final admission record");
  if (bundle.evaluator_bundle_id !== reference.evaluator_bundle_id || bundle.evaluator_bundle_digest !== reference.evaluator_bundle_digest || bundle.evaluator_revision !== reference.evaluator_revision) throw new Error("mn-build successor private/public evaluator identity differs");
  if (admission.admission_status !== "admission_pending") throw new Error("mn-build successor final admission must remain pending");

  const reviewPath = resolve(fixtureRoot, "admission-review.json");
  const previousReview = readJson(reviewPath, "mn-build admission review");
  const reviewBase = {
    ...withoutField(previousReview, "review_package_digest"),
    candidate_evaluator_digest: bundle.evaluator_bundle_digest,
    reviewer_status: "pending_independent_review",
    author_self_approval: false,
    admission_status: "admission_pending",
  };
  const review = { ...reviewBase, review_package_digest: canonicalDigest(reviewBase) };
  writeJson(reviewPath, review);

  const publicBindings = Object.fromEntries([
    ["admission_review", "admission-review.json"],
    ["evaluator_authority_manifest", "evaluator-authority-manifest.json"],
    ["evaluator_public_reference", "evaluator-reference.json"],
    ["evidence_map", "evidence-map.json"],
    ["final_admission_record", "final-admission-record.json"],
    ["input_manifest", "input-manifest.json"],
    ["metadata", "metadata.json"],
    ["output_contract", "output-contract.json"],
    ["requirement_record", "requirement-record.json"],
    ["scoring_input_freeze_manifest", "scoring-input-freeze-manifest.json"],
    ["verification_command_contract", "verification-command-contract.json"],
  ].map(([key, name]) => [key, binding(repository, name)]));
  const candidateBase = {
    schema_version: "1.1.0",
    fixture_id: FIXTURE_ID,
    candidate_state: "source_freeze_candidate",
    reviewer_state: "pending",
    admission_state: "admission_pending",
    measured_execution: false,
    scoring_published: false,
    public_bindings: publicBindings,
    evaluator_private_binding: {
      evaluator_revision: bundle.evaluator_revision,
      evaluator_bundle_id: bundle.evaluator_bundle_id,
      evaluator_bundle_digest: bundle.evaluator_bundle_digest,
      evaluator_byte_count: admission.evaluator_byte_count,
      source_tree_digest: bundle.evaluator_source_identity.source_tree_digest,
      dependency_graph_digest: bundle.dependency_graph.graph_digest,
    },
  };
  const candidate = { ...candidateBase, candidate_digest: canonicalDigest(candidateBase) };
  writeJson(resolve(fixtureRoot, "source-freeze-candidate.json"), candidate);
  const summary = validateMnBuildOptionUpdatePublicFixture({ root: repository });
  return Object.freeze({
    fixtureId: FIXTURE_ID,
    evaluatorRevision: bundle.evaluator_revision,
    evaluatorBundleId: bundle.evaluator_bundle_id,
    evaluatorBundleDigest: bundle.evaluator_bundle_digest,
    sourceFreezeDigest: candidate.candidate_digest,
    reviewStatus: summary.reviewStatus,
    admissionStatus: admission.admission_status,
    scoringReady: false,
  });
}

function parseArgs(argv) {
  const args = { root: ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--root" && value) args.root = resolve(value);
    else if (flag === "--private-root" && value) args.privateRoot = resolve(value);
    else throw new Error(`unknown or incomplete argument: ${flag}`);
    index += 1;
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(finalizeMnBuildOptionUpdateSuccessorAuthority(parseArgs(process.argv.slice(2))))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
