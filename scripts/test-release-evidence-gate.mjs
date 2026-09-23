#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function snapshotFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => {
    const path = resolve(directory, entry.name);
    return [entry.name, entry.isDirectory() ? snapshotFiles(path) : digest(readFileSync(path))];
  });
}

function claimOnlyEvidence(root, state) {
  const gateId = "release.activation_bypass_decisions";
  const gatePrimary = findPrimary(state.catalog, gateId);
  const gateReview = findReview(state.catalog, gateId);
  const primary = clone(gatePrimary);
  primary.evidence_id = "release-evidence-claim-only";
  primary.gate_ids = [];
  primary.artifact = writeArtifact(root, primary.evidence_id);
  const review = clone(gateReview);
  review.evidence_id = "release-evidence-review-claim-only";
  review.gate_ids = [];
  review.related_evidence_refs = [primary.evidence_id];
  review.artifact = writeArtifact(root, review.evidence_id);
  gatePrimary.claim_ids = [];
  gateReview.claim_ids = [];
  state.catalog.evidence.push(primary, review);
  state.matrix.claims[0].evidence_refs = [primary.evidence_id];
  return { primary, review };
}

function addRiskAcceptance(root, state) {
  const subject = findPrimary(state.catalog, "release.repository_validation");
  const acceptance = clone(findReview(state.catalog, "release.guided_setup"));
  acceptance.evidence_id = "release-evidence-risk-acceptance";
  acceptance.gate_ids = [];
  acceptance.claim_ids = [];
  acceptance.related_evidence_refs = [subject.evidence_id];
  acceptance.artifact = writeArtifact(root, acceptance.evidence_id);
  const risk = { risk_id: "release-risk-test", description: "Explicitly accepted bounded risk", acceptance_evidence_ref: acceptance.evidence_id };
  state.catalog.evidence.push(acceptance);
  state.catalog.accepted_risks.push(risk);
  return { acceptance, risk, subject };
}

let reviewRegressionCount = 0;
function regression(name, check) {
  try { check(); } catch (error) { throw new Error(`Review regression failed: ${name}`, { cause: error }); }
  reviewRegressionCount += 1;
}

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

  // F1: required claims cannot use optional exclusion to bypass readiness.
  for (const disposition of ["excluded", "unknown", "experimental", "falsified"]) {
    regression(`required ${disposition}`, () => {
      const state = buildReady(root);
      Object.assign(state.matrix.claims[0], { release_required: true, disposition, evidence_refs: [] });
      const result = assess(root, state.matrix, state.catalog);
      expectNotReady(result, `release_required_claim_${disposition}`);
      assert.equal(result.claim_results[0].status, "not_ready");
    });
  }
  regression("supported required claim", () => {
    const state = buildReady(root);
    state.matrix.claims[0].release_required = true;
    assert.equal(assess(root, state.matrix, state.catalog).decision, "ready");
  });

  // F2: evaluate every bound review in both gate and claim-only paths.
  for (const claimOnly of [false, true]) {
    for (const status of ["failed", "not_checked", "not_applicable"]) {
      regression(`mixed reviews ${status}, claimOnly=${claimOnly}`, () => {
        const state = buildReady(root);
        const originalReview = claimOnly ? claimOnlyEvidence(root, state).review : findReview(state.catalog, "release.activation_bypass_decisions");
        const adverse = clone(originalReview);
        adverse.evidence_id = `release-evidence-review-adverse-${status}`;
        adverse.status = status;
        adverse.artifact = status === "failed" ? writeArtifact(root, adverse.evidence_id) : null;
        state.catalog.evidence.push(adverse);
        const result = assess(root, state.matrix, state.catalog);
        expectNotReady(result, `independent_review_${status}`);
        assert.equal(result.claim_results[0].status, "not_ready");
        assert(result.claim_results[0].evidence_refs.includes(adverse.evidence_id));
        if (claimOnly) assert(result.gate_results.every((entry) => entry.status === "pass"));
        else {
          const gate = result.gate_results.find((entry) => entry.gate_id === "release.activation_bypass_decisions");
          assert.equal(gate.status, "not_ready");
          assert(gate.evidence_refs.includes(adverse.evidence_id));
        }
        const reordered = clone(state.catalog);
        reordered.evidence.reverse();
        assert.deepEqual(assess(root, state.matrix, reordered).claim_results, result.claim_results);
        assert.deepEqual(assess(root, state.matrix, reordered).gate_results, result.gate_results);
      });
    }
  }
  for (const [name, mutate, reason] of [
    ["stale", (review) => { review.source_revision = OLD_SOURCE; }, "stale_source_revision"],
    ["wrong-scope", (review) => { review.scope.adapter_id = "claude_code"; }, "independent_review_scope_mismatch"],
    ["tampered", (review) => { writeFileSync(resolve(root, review.artifact.path), "tampered\n"); }, "artifact_integrity_mismatch"],
  ]) {
    regression(`invalid review cannot hide behind passed review: ${name}`, () => {
      const state = buildReady(root);
      const review = clone(findReview(state.catalog, "release.activation_bypass_decisions"));
      review.evidence_id = `release-evidence-review-invalid-${name}`;
      review.artifact = writeArtifact(root, review.evidence_id);
      mutate(review);
      state.catalog.evidence.push(review);
      expectNotReady(assess(root, state.matrix, state.catalog), reason);
    });
  }
  regression("multiple valid reviews", () => {
    const state = buildReady(root);
    const review = clone(findReview(state.catalog, "release.activation_bypass_decisions"));
    review.evidence_id = "release-evidence-review-second-passed";
    review.authority.identity_digest = authorityDigest("second-reviewer");
    review.artifact = writeArtifact(root, review.evidence_id);
    state.catalog.evidence.push(review);
    assert.equal(assess(root, state.matrix, state.catalog).decision, "ready");
  });
  regression("unrelated review does not veto a supported claim", () => {
    const state = buildReady(root);
    const review = clone(findReview(state.catalog, "release.guided_setup"));
    review.evidence_id = "release-evidence-review-unrelated";
    review.gate_ids = [];
    review.status = "failed";
    review.artifact = writeArtifact(root, review.evidence_id);
    state.catalog.evidence.push(review);
    assert.equal(assess(root, state.matrix, state.catalog).decision, "ready");
  });

  // F3: unknown or non-producer identities do not establish independence.
  for (const claimOnly of [false, true]) {
    for (const authority of [{ kind: "none", identity_digest: null }, { kind: "release_owner", identity_digest: authorityDigest("not-a-producer") }]) {
      regression(`primary authority ${authority.kind}, claimOnly=${claimOnly}`, () => {
        const state = buildReady(root);
        const primary = claimOnly ? claimOnlyEvidence(root, state).primary : findPrimary(state.catalog, "release.activation_bypass_decisions");
        primary.authority = clone(authority);
        const result = assess(root, state.matrix, state.catalog);
        expectNotReady(result, "evidence_producer_identity_missing");
        assert.equal(result.claim_results[0].status, "not_ready");
        if (claimOnly) assert(result.gate_results.every((entry) => entry.status === "pass"));
      });
    }
  }
  regression("one reviewed primary cannot cover a second unreviewed primary", () => {
    const state = buildReady(root);
    const { primary } = claimOnlyEvidence(root, state);
    const second = clone(primary);
    second.evidence_id = "release-evidence-claim-second-unreviewed";
    second.artifact = writeArtifact(root, second.evidence_id);
    state.catalog.evidence.push(second);
    state.matrix.claims[0].evidence_refs.push(second.evidence_id);
    expectNotReady(assess(root, state.matrix, state.catalog), "supported_claim_independent_review_missing");
  });

  // F4: catalog-side binding cannot hide unlisted primary evidence.
  for (const status of ["failed", "not_checked", "not_applicable"]) {
    regression(`inverse-only claim evidence: ${status}`, () => {
      const state = buildReady(root);
      const extra = clone(findPrimary(state.catalog, "release.activation_bypass_decisions"));
      extra.evidence_id = `release-evidence-inverse-only-${status}`;
      extra.gate_ids = [];
      extra.status = status;
      extra.artifact = status === "failed" ? writeArtifact(root, extra.evidence_id) : null;
      state.catalog.evidence.push(extra);
      const result = assess(root, state.matrix, state.catalog);
      expectNotReady(result, "claim_evidence_reference_missing");
      expectNotReady(result, `claim_evidence_${status}`);
      assert.equal(result.claim_results[0].status, "not_ready");
      assert(result.claim_results[0].evidence_refs.includes(extra.evidence_id));
      assert(result.gate_results.every((entry) => entry.status === "pass"));
    });
  }
  regression("reciprocal claim refs and review may support a second primary", () => {
    const state = buildReady(root);
    const { primary, review } = claimOnlyEvidence(root, state);
    const second = clone(primary);
    second.evidence_id = "release-evidence-claim-second-reviewed";
    second.artifact = writeArtifact(root, second.evidence_id);
    const secondReview = clone(review);
    secondReview.evidence_id = "release-evidence-review-second-primary";
    secondReview.related_evidence_refs = [second.evidence_id];
    secondReview.artifact = writeArtifact(root, secondReview.evidence_id);
    state.catalog.evidence.push(second, secondReview);
    expectNotReady(assess(root, state.matrix, state.catalog), "claim_evidence_reference_missing");
    state.matrix.claims[0].evidence_refs.push(second.evidence_id);
    assert.equal(assess(root, state.matrix, state.catalog).decision, "ready");
  });
  regression("excluded optional claim does not acquire inverse-only dependencies", () => {
    const state = buildReady(root);
    const { primary } = claimOnlyEvidence(root, state);
    primary.status = "failed";
    Object.assign(state.matrix.claims[0], { disposition: "excluded", release_required: false, evidence_refs: [] });
    const result = assess(root, state.matrix, state.catalog);
    assert.equal(result.decision, "ready");
    assert.equal(result.claim_results[0].status, "excluded");
  });

  // F5: risk acceptance is independently checked even without gate/claim bindings.
  for (const [name, mutate, reason] of [
    ["stale", ({ acceptance }) => { acceptance.source_revision = OLD_SOURCE; }, "stale_source_revision"],
    ["missing", ({ acceptance }) => { rmSync(resolve(root, acceptance.artifact.path)); }, "artifact_missing"],
    ["tampered", ({ acceptance }) => { writeFileSync(resolve(root, acceptance.artifact.path), "tampered\n"); }, "artifact_integrity_mismatch"],
    ["escape", ({ acceptance }) => { acceptance.artifact.path = "../outside.json"; }, "artifact_unreadable"],
    ["directory", ({ acceptance }) => { acceptance.artifact.path = "evidence"; }, "artifact_unreadable"],
    ["same-identity", ({ acceptance, subject }) => { acceptance.authority.identity_digest = subject.authority.identity_digest; }, "independent_review_identity_conflict"],
    ["unknown-producer", ({ subject }) => { subject.authority = { kind: "none", identity_digest: null }; }, "evidence_producer_identity_missing"],
    ["wrong-scope", ({ acceptance }) => { acceptance.scope.adapter_id = "wrong-adapter"; }, "independent_review_scope_mismatch"],
  ]) {
    regression(`risk acceptance ${name}`, () => {
      const state = buildReady(root);
      const inputs = addRiskAcceptance(root, state);
      mutate(inputs);
      const result = assess(root, state.matrix, state.catalog);
      expectNotReady(result, `risk_acceptance_${reason}`);
      assert.deepEqual(result.accepted_risks, []);
      assert(result.gate_results.every((entry) => entry.status === "pass"));
    });
  }
  regression("risk acceptance symlink", () => {
    const state = buildReady(root);
    const { acceptance } = addRiskAcceptance(root, state);
    const target = acceptance.artifact.path;
    const link = resolve(root, "evidence/risk-link.json");
    symlinkSync(resolve(root, target), link);
    try {
      acceptance.artifact.path = "evidence/risk-link.json";
      const result = assess(root, state.matrix, state.catalog);
      expectNotReady(result, "risk_acceptance_artifact_unreadable");
      assert.deepEqual(result.accepted_risks, []);
    } finally { rmSync(link); }
  });
  regression("valid independent risk acceptance", () => {
    const state = buildReady(root);
    const { risk } = addRiskAcceptance(root, state);
    const result = assess(root, state.matrix, state.catalog);
    assert.equal(result.decision, "ready");
    assert.deepEqual(result.accepted_risks, [risk.risk_id]);
  });
  regression("valid release-owner acceptance; invalid risk is not listed", () => {
    const state = buildReady(root);
    const { acceptance } = addRiskAcceptance(root, state);
    state.catalog.accepted_risks.push({
      risk_id: "release-risk-owner-accepted", description: "Owner accepted risk",
      acceptance_evidence_ref: findPrimary(state.catalog, "release.human_approval").evidence_id,
    });
    assert.equal(assess(root, state.matrix, state.catalog).decision, "ready");
    acceptance.source_revision = OLD_SOURCE;
    const result = assess(root, state.matrix, state.catalog);
    expectNotReady(result, "risk_acceptance_stale_source_revision");
    assert.deepEqual(result.accepted_risks, ["release-risk-owner-accepted"]);
  });
  regression("risk acceptance cannot carry the wrong authority role", () => {
    const state = buildReady(root);
    const { acceptance } = addRiskAcceptance(root, state);
    acceptance.authority.kind = "producer";
    assert.throws(() => assess(root, state.matrix, state.catalog), /independent review requires independent_reviewer authority/u);
  });

  const cliCase = buildReady(root);
  findPrimary(cliCase.catalog, "release.clean_install_upgrade").status = "not_checked";
  findPrimary(cliCase.catalog, "release.clean_install_upgrade").artifact = null;
  const matrixPath = resolve(root, "matrix.json");
  const catalogPath = resolve(root, "catalog.json");
  writeFileSync(matrixPath, `${JSON.stringify(cliCase.matrix, null, 2)}\n`);
  writeFileSync(catalogPath, `${JSON.stringify(cliCase.catalog, null, 2)}\n`);
  const filesBeforeCli = snapshotFiles(root);
  const cli = spawnSync(process.execPath, [
    resolve(SCRIPT_ROOT, "scripts/release-evidence-gate.mjs"), "assess",
    "--matrix", matrixPath,
    "--evidence", catalogPath,
    "--source-revision", SOURCE,
    "--root", root,
  ], { encoding: "utf8" });
  assert.deepEqual(snapshotFiles(root), filesBeforeCli, "assessment must not mutate its inputs");
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
  assert.equal(existsSync(forbiddenOutput), false);
  assert.deepEqual(snapshotFiles(root), filesBeforeCli, "rejected CLI must not mutate inputs");

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
  assert.deepEqual(current.claim_results.find((entry) => entry.claim_id === "ASK-PLATFORM-CLAIM-EVIDENCE-STATUS").reason_codes, []);

  process.stdout.write(`Release evidence gate tests passed: 18 original scenarios + ${reviewRegressionCount} review regressions.\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
