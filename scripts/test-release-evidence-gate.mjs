#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessRelease, REQUIRED_RELEASE_GATES } from "./release-evidence-gate.mjs";

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "a".repeat(40);
const OLD_SOURCE = "b".repeat(40);
const CLAIM_ID = "ASK-CONTROLLED-EFFECT-CODEX";
const CLAIM_SCOPE = {
  capability: "activation-bypass decision quality",
  task_class: "bounded-engineering-task",
  adapter_id: "codex",
  profile_id: "adaptive",
};
const RELEASE_SCOPE = { capability: "release", task_class: null, adapter_id: null, profile_id: null };
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const authorityDigest = (label) => digest(Buffer.from(label));
const passGuardrails = () => ({
  quality: "passed",
  safety: "passed",
  lower_tail: "passed",
  variance: "passed",
  human_effort: "measured",
  publication_permission: "granted",
});
const neutralGuardrails = () => ({
  quality: "not_required",
  safety: "not_required",
  lower_tail: "not_required",
  variance: "not_required",
  human_effort: "not_applicable",
  publication_permission: "not_required",
});

function clone(value) { return structuredClone(value); }
function writeArtifact(root, id, body = id) {
  const path = `evidence/${id}.json`;
  const absolute = resolve(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify({ id, body })}\n`);
  writeFileSync(absolute, bytes);
  return { path, digest: digest(bytes) };
}

function primaryEvidence(root, spec) {
  const id = `release-evidence-${spec.gate_id.replaceAll(".", "-")}`;
  const kind = spec.accepted_kinds[0];
  const isClaimEvidence = spec.gate_id === "release.activation_bypass_decisions";
  return {
    evidence_id: id,
    kind,
    status: "passed",
    source_revision: SOURCE,
    artifact: writeArtifact(root, id),
    scope: isClaimEvidence ? clone(CLAIM_SCOPE) : clone(RELEASE_SCOPE),
    gate_ids: [spec.gate_id],
    claim_ids: isClaimEvidence ? [CLAIM_ID] : [],
    related_evidence_refs: [],
    authority: kind === "formal_approval"
      ? { kind: "release_owner", identity_digest: authorityDigest("release-owner") }
      : { kind: "producer", identity_digest: authorityDigest(`producer:${spec.gate_id}`) },
    guardrails: spec.outcome_guardrails_required ? passGuardrails() : neutralGuardrails(),
    limitations: [],
  };
}

function reviewEvidence(root, spec, primary) {
  const id = `release-evidence-review-${spec.gate_id.replaceAll(".", "-")}`;
  return {
    evidence_id: id,
    kind: "independent_review",
    status: "passed",
    source_revision: SOURCE,
    artifact: writeArtifact(root, id),
    scope: clone(primary.scope),
    gate_ids: [spec.gate_id],
    claim_ids: primary.claim_ids,
    related_evidence_refs: [primary.evidence_id],
    authority: { kind: "independent_reviewer", identity_digest: authorityDigest(`reviewer:${spec.gate_id}`) },
    guardrails: neutralGuardrails(),
    limitations: [],
  };
}

function buildReady(root) {
  const evidence = [];
  for (const spec of REQUIRED_RELEASE_GATES) {
    const primary = primaryEvidence(root, spec);
    evidence.push(primary);
    if (spec.independent_review_required) evidence.push(reviewEvidence(root, spec, primary));
  }
  const claimEvidence = evidence.find((entry) => entry.gate_ids.includes("release.activation_bypass_decisions") && entry.kind !== "independent_review");
  claimEvidence.kind = "controlled_benchmark";
  claimEvidence.guardrails = passGuardrails();
  const matrix = {
    schema_version: "1.0.0",
    schema_path: "schemas/release-claim-matrix.schema.json",
    matrix_id: "release-claim-matrix-test-ready",
    repository_id: "github.com/ist-h-i/agent-spectrum-kernel",
    source_revision: SOURCE,
    claims: [{
      claim_id: CLAIM_ID,
      wording: "For the bounded Codex task class, the measured configuration supports an evidence-bounded activation/bypass decision.",
      claim_class: "controlled_effect",
      scope: clone(CLAIM_SCOPE),
      source_revision: SOURCE,
      evidence_refs: [claimEvidence.evidence_id],
      limitations: ["This synthetic test only exercises the release gate contract."],
      invalid_inference_boundaries: ["It does not establish production value or ROI."],
      residual_items: [],
      disposition: "supported",
      release_required: false,
    }],
  };
  const catalog = {
    schema_version: "1.0.0",
    schema_path: "schemas/release-evidence-catalog.schema.json",
    catalog_id: "release-evidence-catalog-test-ready",
    repository_id: matrix.repository_id,
    source_revision: SOURCE,
    evidence,
    blockers: [],
    accepted_risks: [],
  };
  return { matrix, catalog };
}

function findPrimary(catalog, gateId) {
  return catalog.evidence.find((entry) => entry.gate_ids.includes(gateId) && entry.kind !== "independent_review");
}
function findReview(catalog, gateId) {
  return catalog.evidence.find((entry) => entry.gate_ids.includes(gateId) && entry.kind === "independent_review");
}
function assess(root, matrix, catalog) { return assessRelease({ matrix, catalog, repositoryRoot: root, sourceRevision: SOURCE }); }
function reasonSet(result) { return new Set(result.reason_codes); }
function expectNotReady(result, code) { assert.equal(result.decision, "not_ready"); assert(reasonSet(result).has(code), `missing reason ${code}: ${result.reason_codes.join(", ")}`); }

const root = mkdtempSync(resolve(tmpdir(), "ask-release-evidence-gate-"));
try {
  const ready = buildReady(root);
  const first = assess(root, ready.matrix, ready.catalog);
  const second = assess(root, clone(ready.matrix), clone(ready.catalog));
  assert.equal(first.decision, "ready");
  assert.deepEqual(first, second, "assessment must be deterministic for identical source and policy inputs");
  assert.equal(first.gate_results.length, REQUIRED_RELEASE_GATES.length);
  assert(first.gate_results.every((entry) => entry.status === "pass"));
  assert.equal(first.claim_results[0].status, "supported");

  const missingGate = buildReady(root);
  const removeIds = new Set([
    findPrimary(missingGate.catalog, "release.guided_setup").evidence_id,
    findReview(missingGate.catalog, "release.guided_setup").evidence_id,
  ]);
  missingGate.catalog.evidence = missingGate.catalog.evidence.filter((entry) => !removeIds.has(entry.evidence_id));
  expectNotReady(assess(root, missingGate.matrix, missingGate.catalog), "required_gate_evidence_missing");

  const tampered = buildReady(root);
  const tamperedEvidence = findPrimary(tampered.catalog, "release.asset_registry");
  writeFileSync(resolve(root, tamperedEvidence.artifact.path), "tampered\n");
  expectNotReady(assess(root, tampered.matrix, tampered.catalog), "artifact_integrity_mismatch");

  const stale = buildReady(root);
  findPrimary(stale.catalog, "release.portfolio_manager").source_revision = OLD_SOURCE;
  expectNotReady(assess(root, stale.matrix, stale.catalog), "stale_source_revision");

  const transplanted = buildReady(root);
  const transplantedEvidence = findPrimary(transplanted.catalog, "release.activation_bypass_decisions");
  transplantedEvidence.scope.adapter_id = "claude_code";
  expectNotReady(assess(root, transplanted.matrix, transplanted.catalog), "claim_evidence_scope_mismatch");

  const duplicateClaim = buildReady(root);
  duplicateClaim.matrix.claims.push(clone(duplicateClaim.matrix.claims[0]));
  assert.throws(() => assess(root, duplicateClaim.matrix, duplicateClaim.catalog), /duplicate identity/u);

  const contradictory = buildReady(root);
  const original = findPrimary(contradictory.catalog, "release.repository_validation");
  const failed = clone(original);
  failed.evidence_id = "release-evidence-release-repository-validation-failed";
  failed.status = "failed";
  failed.artifact = writeArtifact(root, failed.evidence_id);
  contradictory.catalog.evidence.push(failed);
  expectNotReady(assess(root, contradictory.matrix, contradictory.catalog), "contradictory_gate_evidence");

  const missingReview = buildReady(root);
  const missingReviewId = findReview(missingReview.catalog, "release.guided_setup").evidence_id;
  missingReview.catalog.evidence = missingReview.catalog.evidence.filter((entry) => entry.evidence_id !== missingReviewId);
  expectNotReady(assess(root, missingReview.matrix, missingReview.catalog), "independent_review_missing");

  const sameIdentityReview = buildReady(root);
  const sameIdentityPrimary = findPrimary(sameIdentityReview.catalog, "release.guided_setup");
  const sameIdentityReviewer = findReview(sameIdentityReview.catalog, "release.guided_setup");
  sameIdentityReviewer.authority.identity_digest = sameIdentityPrimary.authority.identity_digest;
  expectNotReady(assess(root, sameIdentityReview.matrix, sameIdentityReview.catalog), "independent_review_missing");

  const partiallyUncheckedGate = buildReady(root);
  const uncheckedGateEvidence = clone(findPrimary(partiallyUncheckedGate.catalog, "release.asset_registry"));
  uncheckedGateEvidence.evidence_id = "release-evidence-release-asset-registry-unchecked";
  uncheckedGateEvidence.status = "not_checked";
  uncheckedGateEvidence.artifact = null;
  partiallyUncheckedGate.catalog.evidence.push(uncheckedGateEvidence);
  expectNotReady(assess(root, partiallyUncheckedGate.matrix, partiallyUncheckedGate.catalog), "evidence_not_checked");

  const arbitrarySupported = buildReady(root);
  arbitrarySupported.matrix.claims[0].evidence_refs = [];
  expectNotReady(assess(root, arbitrarySupported.matrix, arbitrarySupported.catalog), "supported_claim_has_no_evidence");

  const syntheticOverclaim = buildReady(root);
  const synthetic = findPrimary(syntheticOverclaim.catalog, "release.activation_bypass_decisions");
  synthetic.kind = "synthetic_fixture";
  expectNotReady(assess(root, syntheticOverclaim.matrix, syntheticOverclaim.catalog), "supported_claim_evidence_kind_or_status_insufficient");

  const partiallyUncheckedClaim = buildReady(root);
  const uncheckedClaimEvidence = clone(findPrimary(partiallyUncheckedClaim.catalog, "release.activation_bypass_decisions"));
  uncheckedClaimEvidence.evidence_id = "release-evidence-release-activation-bypass-decisions-unchecked";
  uncheckedClaimEvidence.status = "not_checked";
  uncheckedClaimEvidence.artifact = null;
  uncheckedClaimEvidence.gate_ids = [];
  uncheckedClaimEvidence.claim_ids = [CLAIM_ID];
  partiallyUncheckedClaim.catalog.evidence.push(uncheckedClaimEvidence);
  partiallyUncheckedClaim.matrix.claims[0].evidence_refs.push(uncheckedClaimEvidence.evidence_id);
  expectNotReady(assess(root, partiallyUncheckedClaim.matrix, partiallyUncheckedClaim.catalog), "claim_evidence_not_checked");

  const excludedOptional = buildReady(root);
  excludedOptional.matrix.claims.push({
    claim_id: "ASK-OPTIONAL-OPERATOR-DEPENDENCE",
    wording: "Optional operator-dependence claim omitted from this release.",
    claim_class: "controlled_effect",
    scope: { capability: "operator dependence", task_class: "optional", adapter_id: "codex", profile_id: "adaptive" },
    source_revision: SOURCE,
    evidence_refs: [],
    limitations: [],
    invalid_inference_boundaries: [],
    residual_items: ["Requires compatible #285/#286 evidence before support."],
    disposition: "excluded",
    release_required: false,
  });
  assert.equal(assess(root, excludedOptional.matrix, excludedOptional.catalog).decision, "ready");

  const lowerTail = buildReady(root);
  findPrimary(lowerTail.catalog, "release.activation_bypass_decisions").guardrails.lower_tail = "failed";
  expectNotReady(assess(root, lowerTail.matrix, lowerTail.catalog), "guardrail_lower_tail_failed");

  const openBlocker = buildReady(root);
  openBlocker.catalog.blockers.push({ blocker_id: "release-blocker-test", status: "open", description: "Known unresolved release blocker", evidence_refs: [] });
  expectNotReady(assess(root, openBlocker.matrix, openBlocker.catalog), "unresolved_release_blocker");

  const cliCase = buildReady(root);
  findPrimary(cliCase.catalog, "release.clean_install_upgrade").status = "not_checked";
  findPrimary(cliCase.catalog, "release.clean_install_upgrade").artifact = null;
  const matrixPath = resolve(root, "matrix.json");
  const catalogPath = resolve(root, "catalog.json");
  writeFileSync(matrixPath, `${JSON.stringify(cliCase.matrix, null, 2)}\n`);
  writeFileSync(catalogPath, `${JSON.stringify(cliCase.catalog, null, 2)}\n`);
  const cli = spawnSync(process.execPath, [
    resolve(SCRIPT_ROOT, "scripts/release-evidence-gate.mjs"), "assess",
    "--matrix", matrixPath,
    "--evidence", catalogPath,
    "--source-revision", SOURCE,
    "--root", root,
  ], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).decision, "not_ready", "not_ready is a valid assessment, not a CLI failure");

  const forbiddenOutput = resolve(root, "assessment.json");
  const outputCli = spawnSync(process.execPath, [
    resolve(SCRIPT_ROOT, "scripts/release-evidence-gate.mjs"), "assess",
    "--matrix", matrixPath,
    "--evidence", catalogPath,
    "--source-revision", SOURCE,
    "--root", root,
    "--output", forbiddenOutput,
  ], { encoding: "utf8" });
  assert.equal(outputCli.status, 1, "release assessment CLI must stay read-only and reject --output");
  assert.match(outputCli.stderr, /unknown release evidence gate option: --output/u);

  const currentMatrix = JSON.parse(readFileSync(resolve(SCRIPT_ROOT, "docs/fixtures/release-evidence-gate/current-main-756c72-claim-matrix.json"), "utf8"));
  const currentCatalog = JSON.parse(readFileSync(resolve(SCRIPT_ROOT, "docs/fixtures/release-evidence-gate/current-main-756c72-evidence.json"), "utf8"));
  const current = assessRelease({
    matrix: currentMatrix,
    catalog: currentCatalog,
    repositoryRoot: SCRIPT_ROOT,
    sourceRevision: "756c72b3fba158fbbc33642128bf5ab87097914b",
  });
  assert.equal(current.decision, "not_ready", "the checked current-repository fixture must remain explicitly not_ready");
  assert(current.blockers.includes("release-blocker-173-guided-setup"));
  assert(current.reason_codes.includes("required_gate_evidence_missing"));

  process.stdout.write("Release evidence gate tests passed: 18 scenarios.\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
