#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalRiskDigest,
  createRiskApprovalRequest,
  readRiskAction,
  verifyRiskApproval,
} from "./codex-risk-approval.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "codex-risk-approval-")));
const target = resolve(temporaryRoot, "target");
const actionPath = resolve(temporaryRoot, "risk-action.json");
const approvalPath = resolve(temporaryRoot, "approval.json");
const actionSchemaPath = resolve(root, "schemas/codex-risk-action.schema.json");
const approvalSchemaPath = resolve(root, "schemas/codex-risk-approval.schema.json");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (character) => `sha256:${character.repeat(64)}`;
const action = {
  schema_version: "1.0.0",
  action_id: "release-fixture",
  repository_id: "github.com/example/release-fixture",
  risk_gate: "risk-gate",
  operation: "publish_release_candidate",
  target_scope: ["dist/release.json"],
  permitted_effects: ["write_release_candidate"],
  prohibited_effects: ["publish_production", "write_outside_target_scope"],
  approval_authority: {
    authority_id: "release-owner",
    authority_revision: "rev-7",
    evidence_sha256: digest("a"),
  },
};
const invocation = {
  repository: {
    repository_id: action.repository_id,
    repository_identity_sha256: digest("b"),
    head_sha: "c".repeat(40),
    tree_sha: "d".repeat(40),
  },
  target_scope: action.target_scope,
  prompt: {
    entry_id: "skill-implement.md",
    rendered_sha256: digest("e"),
    invocation_sha256: digest("f"),
  },
  profile: {
    installed_profile: "implementation",
    profile_id: "ask.codex.implementation.compact",
    profile_schema_version: "1.2.0",
    canonical_revision: "fixture-revision",
    canonical_source_digest: digest("1"),
    profile_fingerprint: digest("2"),
  },
  executor: {
    codex_bin: "/usr/bin/codex",
    canonical_path: "/usr/bin/codex",
    raw_sha256: digest("3"),
    size_bytes: 12345,
    output_path: ".agents/runs/release.md",
  },
  mode: "implementation",
  sandbox: "workspace-write",
  required_gates: ["risk-gate"],
  risk_gate: "risk-gate",
  operation: action.operation,
  permitted_effects: action.permitted_effects,
  prohibited_effects: action.prohibited_effects,
};

try {
  mkdirSync(target);
  writeFileSync(actionPath, `${JSON.stringify(action, null, 2)}\n`);
  const actionEvidence = readRiskAction(actionPath, { schemaPath: actionSchemaPath });
  const request = createRiskApprovalRequest({ actionEvidence, invocation });
  assert.match(request.action_sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.match(request.invocation_sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.match(request.request_sha256, /^sha256:[a-f0-9]{64}$/u);
  const requestWithoutDigest = { ...request };
  delete requestWithoutDigest.request_sha256;
  assert.equal(request.request_sha256, canonicalRiskDigest(requestWithoutDigest));
  assert.deepEqual(createRiskApprovalRequest({ actionEvidence, invocation }), request, "request identity must be deterministic");
  assert.throws(
    () => createRiskApprovalRequest({ actionEvidence, invocation: { ...invocation, repository: { ...invocation.repository, repository_id: "github.com/example/transplant" } } }),
    /repository identity/u,
    "action and invocation must bind the same logical repository",
  );

  const approval = {
    schema_version: "1.0.0",
    kind: "codex_risk_approval",
    decision: "approved",
    request,
    request_sha256: request.request_sha256,
  };
  const writeApproval = (value) => {
    const bytes = `${JSON.stringify(value, null, 2)}\n`;
    writeFileSync(approvalPath, bytes);
    return sha256(bytes);
  };
  const verify = (value, overrides = {}) => verifyRiskApproval({
    approvalPath,
    approvalSha256: writeApproval(value),
    expectedRequest: request,
    target,
    schemaPath: approvalSchemaPath,
    ...overrides,
  });

  assert.equal(verify(approval).status, "approved");
  assert.equal(verify({ ...approval, decision: "rejected" }).status, "rejected");
  assert.equal(verify(true).status, "rejected", "plain boolean must not authorize");
  assert.equal(verify("approved").status, "rejected", "approval prose must not authorize");
  assert.equal(verify({ ...approval, extra: true }).status, "rejected", "superset approval must not authorize");
  const partialApproval = structuredClone(approval);
  delete partialApproval.request.invocation.sandbox;
  assert.equal(verify(partialApproval).status, "rejected", "partial approval must not authorize");
  assert.equal(verify({ ...approval, request: { ...request, mode: "review" } }).status, "rejected", "partial/resealed request must not authorize");
  assert.equal(verify(approval, { approvalSha256: "0".repeat(64) }).status, "rejected", "wrong raw file digest must not authorize");

  for (const [label, mutate] of [
    ["head", (value) => { value.request.invocation.repository.head_sha = "3".repeat(40); }],
    ["tree", (value) => { value.request.invocation.repository.tree_sha = "4".repeat(40); }],
    ["repository", (value) => { value.request.invocation.repository.repository_identity_sha256 = digest("5"); }],
    ["logical repository", (value) => { value.request.invocation.repository.repository_id = "github.com/example/transplant"; }],
    ["target scope", (value) => { value.request.invocation.target_scope = ["dist/other.json"]; }],
    ["prompt", (value) => { value.request.invocation.prompt.invocation_sha256 = digest("6"); }],
    ["profile", (value) => { value.request.invocation.profile.profile_fingerprint = digest("7"); }],
    ["selected profile", (value) => { value.request.invocation.profile.installed_profile = "different-profile"; }],
    ["Codex binary", (value) => { value.request.invocation.executor.codex_bin = "/other/codex"; }],
    ["Codex canonical path", (value) => { value.request.invocation.executor.canonical_path = "/other/codex"; }],
    ["Codex binary digest", (value) => { value.request.invocation.executor.raw_sha256 = digest("4"); }],
    ["Codex binary size", (value) => { value.request.invocation.executor.size_bytes += 1; }],
    ["output path", (value) => { value.request.invocation.executor.output_path = ".agents/runs/other.md"; }],
    ["mode", (value) => { value.request.invocation.mode = "verification"; }],
    ["sandbox", (value) => { value.request.invocation.sandbox = "read-only"; }],
    ["operation", (value) => { value.request.invocation.operation = "other_operation"; }],
    ["permitted effect", (value) => { value.request.invocation.permitted_effects = ["other_effect"]; }],
    ["prohibited effect", (value) => { value.request.invocation.prohibited_effects = ["other_effect"]; }],
    ["authority id", (value) => { value.request.approval_authority.authority_id = "other-owner"; }],
    ["authority revision", (value) => { value.request.approval_authority.authority_revision = "rev-8"; }],
    ["authority evidence", (value) => { value.request.approval_authority.evidence_sha256 = digest("8"); }],
    ["action digest", (value) => { value.request.action_sha256 = digest("9"); }],
    ["invocation digest", (value) => { value.request.invocation_sha256 = digest("0"); }],
  ]) {
    const changed = structuredClone(approval);
    mutate(changed);
    changed.request.request_sha256 = canonicalRiskDigest({ ...changed.request, request_sha256: undefined });
    changed.request_sha256 = changed.request.request_sha256;
    assert.equal(verify(changed).status, "rejected", `${label} mismatch must not authorize even when resealed`);
  }

  const targetApprovalPath = resolve(target, "approval.json");
  writeFileSync(targetApprovalPath, `${JSON.stringify(approval)}\n`, { recursive: false });
  assert.equal(verifyRiskApproval({
    approvalPath: targetApprovalPath,
    approvalSha256: sha256(`${JSON.stringify(approval)}\n`),
    expectedRequest: request,
    target,
    schemaPath: approvalSchemaPath,
  }).status, "rejected", "target-contained approval must not authorize");

  const symlinkPath = resolve(temporaryRoot, "approval-link.json");
  symlinkSync(approvalPath, symlinkPath);
  assert.equal(verifyRiskApproval({
    approvalPath: symlinkPath,
    approvalSha256: writeApproval(approval),
    expectedRequest: request,
    target,
    schemaPath: approvalSchemaPath,
  }).status, "rejected", "symlink approval must not authorize");

  const actionSymlinkPath = resolve(temporaryRoot, "risk-action-link.json");
  symlinkSync(actionPath, actionSymlinkPath);
  assert.throws(() => readRiskAction(actionSymlinkPath, { schemaPath: actionSchemaPath }), /non-symlink|symbolic link/u, "symlink action descriptor must be rejected");

  console.log("Codex risk approval tests passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
