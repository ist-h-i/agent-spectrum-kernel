#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  buildEvidenceTransfer,
  buildVerificationRequirements,
  evidenceObjectPath,
  importEvidenceTransfer,
  planExactReuse,
  putVerificationEvidence,
  readVerificationEvidence,
  reuseIdentityFromEvidence,
  sealVerificationEvidence,
  stableCanonicalJson,
  validateEvidenceTransfer,
  validateVerificationEvidence,
  validateVerificationReusePlan,
} from "./verification-evidence.mjs";

const digest = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;

function expectFailure(label, action, pattern) {
  assert.throws(action, pattern, label);
}

function evidenceDraft(overrides = {}) {
  const draft = {
    schema_version: "1.0.0",
    schema_path: "schemas/verification-evidence.schema.json",
    program: "ask_verification_evidence",
    gate: {
      gate_id: "focused-verification-evidence-test",
      contract_digest: digest("focused-contract-v1"),
      category: "test",
    },
    target: {
      repository_id: "github.com/ist-h-i/agent-spectrum-kernel",
      target_revision: "71282ea971ec5ceda016e10c9c9259f1ff471aa7",
      tree_digest: digest("tree-71282ea"),
    },
    consumed_inputs: [
      {
        kind: "file",
        path: "scripts/test-verification-evidence.mjs",
        digest: digest("focused-test-input"),
      },
      {
        kind: "contract",
        path: "schemas/verification-evidence.schema.json",
        digest: digest("verification-evidence-schema-v1"),
      },
    ],
    execution: {
      command: {
        executable: "node",
        arguments: ["scripts/test-verification-evidence.mjs"],
        working_directory: ".",
      },
      runner: {
        runner_id: "ask-local-node",
        runner_version: "1.0.0",
        adapter_id: "codex",
        adapter_version: "1.0.0",
        evidence_level: "executed",
      },
      toolchain: [
        {
          name: "node",
          version: "v24.19.0",
          identity_digest: digest("node-v24.19.0-darwin-arm64"),
        },
      ],
      environment: {
        os: "darwin",
        architecture: "arm64",
        identity_digest: digest("darwin-arm64-bounded-environment"),
      },
      terminal: {
        status: "succeeded",
        exit_code: 0,
        duration_ms: 123,
        output_bytes: 17,
        output_digest: digest("focused test pass"),
      },
    },
    coverage: {
      obligation_refs: ["VER-274-S1@1#O-CAS", "VER-274-S1@1#O-EXACT"],
      explicit_non_coverage: ["independent-semantic-review"],
    },
    invalidation: {
      mode: "exact_identity_only",
      unknown_dependencies_require_rerun: true,
    },
    producer: {
      kind: "developer",
      identity_digest: digest("developer-producer"),
    },
    authority: {
      independent_review_status: "not_independent",
    },
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
  return { ...draft, ...structuredClone(overrides) };
}

function acceptedGate(evidence, overrides = {}) {
  return {
    gate_id: evidence.gate.gate_id,
    reuse_identity: reuseIdentityFromEvidence(evidence),
    authority: {
      independent_judgment_required: false,
      accepted_producer_kinds: ["automation", "ci", "developer", "reviewer"],
      accepted_evidence_levels: ["behavior_verified", "executed"],
    },
    execution_availability: "available",
    ...structuredClone(overrides),
  };
}

const root = mkdtempSync(resolve(tmpdir(), "ask-verification-evidence-"));
try {
  const store = resolve(root, "store");
  const sealed = sealVerificationEvidence(evidenceDraft());
  validateVerificationEvidence(sealed);
  assert.match(sealed.evidence_id, /^verification-evidence-[a-f0-9]{64}$/u);
  assert.match(sealed.evidence_digest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(sealed.reuse_identity_digest, /^sha256:[a-f0-9]{64}$/u);

  const firstPut = putVerificationEvidence({ storeRoot: store, evidence: sealed });
  const secondPut = putVerificationEvidence({ storeRoot: store, evidence: structuredClone(sealed) });
  assert.equal(firstPut.created, true);
  assert.equal(secondPut.created, false);
  assert.equal(firstPut.path, secondPut.path);
  assert.deepEqual(readVerificationEvidence({ storeRoot: store, evidenceId: sealed.evidence_id }), sealed);

  const requirements = buildVerificationRequirements({ requiredGates: [acceptedGate(sealed)] });
  const exactPlan = planExactReuse({ storeRoot: store, requirements });
  validateVerificationReusePlan(exactPlan);
  assert.equal(exactPlan.dispositions[0].disposition, "reuse_exact");
  assert.equal(exactPlan.dispositions[0].reason_code, "exact_identity_verified");
  assert.equal(exactPlan.coverage.status, "covered");
  assert.deepEqual(exactPlan.coverage.covered_gate_ids, [sealed.gate.gate_id]);

  const changedIdentities = [
    ["repository", (identity) => { identity.target.repository_id = "github.com/example/transplant"; }],
    ["target", (identity) => { identity.target.target_revision = "c2637c364d4ef205448b2844ccc74b2928078020"; }],
    ["tree", (identity) => { identity.target.tree_digest = digest("different-tree"); }],
    ["gate contract", (identity) => { identity.gate.contract_digest = digest("different-contract"); }],
    ["consumed input", (identity) => { identity.consumed_inputs[0].digest = digest("changed-input"); }],
    ["command", (identity) => { identity.execution.command.arguments = ["scripts/other-test.mjs"]; }],
    ["runner", (identity) => { identity.execution.runner.runner_version = "2.0.0"; }],
    ["toolchain", (identity) => { identity.execution.toolchain[0].version = "v25.0.0"; }],
    ["environment", (identity) => { identity.execution.environment.identity_digest = digest("different-environment"); }],
  ];
  for (const [label, mutate] of changedIdentities) {
    const gate = acceptedGate(sealed);
    mutate(gate.reuse_identity);
    const plan = planExactReuse({ storeRoot: store, requirements: buildVerificationRequirements({ requiredGates: [gate] }) });
    assert.equal(plan.dispositions[0].disposition, "rerun_required", `${label} transplant must rerun`);
    assert.equal(plan.coverage.status, "blocked", `${label} transplant must block coverage`);
  }

  const independentPlan = planExactReuse({
    storeRoot: store,
    requirements: buildVerificationRequirements({
      requiredGates: [acceptedGate(sealed, { authority: { ...acceptedGate(sealed).authority, independent_judgment_required: true } })],
    }),
  });
  assert.equal(independentPlan.dispositions[0].disposition, "independent_judgment_required");
  assert.equal(independentPlan.dispositions[0].execution_evidence_reusable, true);
  assert.equal(independentPlan.coverage.status, "blocked");

  const emptyPlan = planExactReuse({
    storeRoot: resolve(root, "empty-store"),
    requirements,
  });
  assert.equal(emptyPlan.dispositions[0].disposition, "rerun_required");
  assert.equal(emptyPlan.coverage.status, "blocked");
  const unavailablePlan = planExactReuse({
    storeRoot: resolve(root, "unavailable-store"),
    requirements: buildVerificationRequirements({ requiredGates: [acceptedGate(sealed, { execution_availability: "unavailable" })] }),
  });
  assert.equal(unavailablePlan.dispositions[0].disposition, "blocked_uncovered");

  const conflictingStore = resolve(root, "conflicting-store");
  putVerificationEvidence({ storeRoot: conflictingStore, evidence: sealed });
  const failed = sealVerificationEvidence(evidenceDraft({
    execution: {
      ...evidenceDraft().execution,
      terminal: {
        status: "failed",
        exit_code: 1,
        duration_ms: 125,
        output_bytes: 19,
        output_digest: digest("focused test failed"),
      },
    },
  }));
  assert.equal(failed.reuse_identity_digest, sealed.reuse_identity_digest);
  putVerificationEvidence({ storeRoot: conflictingStore, evidence: failed });
  const conflictPlan = planExactReuse({ storeRoot: conflictingStore, requirements });
  assert.equal(conflictPlan.dispositions[0].disposition, "rerun_required");
  assert.equal(conflictPlan.dispositions[0].reason_code, "conflicting_exact_evidence");

  const transfer = buildEvidenceTransfer({ storeRoot: store, evidenceIds: [sealed.evidence_id] });
  validateEvidenceTransfer(transfer);
  const repeatedTransfer = buildEvidenceTransfer({ storeRoot: store, evidenceIds: [sealed.evidence_id] });
  assert.equal(stableCanonicalJson(transfer), stableCanonicalJson(repeatedTransfer));
  const importedStore = resolve(root, "imported-store");
  const imported = importEvidenceTransfer({ storeRoot: importedStore, transfer });
  assert.deepEqual(imported.evidence_ids, [sealed.evidence_id]);
  assert.deepEqual(readVerificationEvidence({ storeRoot: importedStore, evidenceId: sealed.evidence_id }), sealed);

  const cliDraftPath = resolve(root, "cli-draft.json");
  const cliSealedPath = resolve(root, "cli-sealed.json");
  const cliRequirementsPath = resolve(root, "cli-requirements.json");
  const cliPlanPath = resolve(root, "cli-plan.json");
  const cliTransferPath = resolve(root, "cli-transfer.json");
  const cliStore = resolve(root, "cli-store");
  const cliImportedStore = resolve(root, "cli-imported-store");
  writeFileSync(cliDraftPath, `${JSON.stringify(evidenceDraft(), null, 2)}\n`);
  writeFileSync(cliRequirementsPath, `${JSON.stringify({ requiredGates: [acceptedGate(sealed)] }, null, 2)}\n`);
  const runCli = (args) => spawnSync(process.execPath, [resolve("scripts/verification-evidence.mjs"), ...args], { cwd: resolve("."), encoding: "utf8" });
  const cliPut = runCli(["put", "--store", cliStore, "--input", cliDraftPath, "--output", cliSealedPath]);
  assert.equal(cliPut.status, 0, cliPut.stderr || cliPut.stdout);
  assert.deepEqual(JSON.parse(readFileSync(cliSealedPath, "utf8")), sealed);
  const cliVerify = runCli(["verify", "--store", cliStore, "--evidence-id", sealed.evidence_id]);
  assert.equal(cliVerify.status, 0, cliVerify.stderr || cliVerify.stdout);
  assert.deepEqual(JSON.parse(cliVerify.stdout), sealed);
  const cliPlan = runCli(["plan", "--store", cliStore, "--requirements", cliRequirementsPath, "--output", cliPlanPath]);
  assert.equal(cliPlan.status, 0, cliPlan.stderr || cliPlan.stdout);
  assert.equal(JSON.parse(readFileSync(cliPlanPath, "utf8")).coverage.status, "covered");
  const cliExport = runCli(["export", "--store", cliStore, "--evidence-ids", sealed.evidence_id, "--output", cliTransferPath]);
  assert.equal(cliExport.status, 0, cliExport.stderr || cliExport.stdout);
  const cliImport = runCli(["import", "--store", cliImportedStore, "--input", cliTransferPath]);
  assert.equal(cliImport.status, 0, cliImport.stderr || cliImport.stdout);
  assert.deepEqual(readVerificationEvidence({ storeRoot: cliImportedStore, evidenceId: sealed.evidence_id }), sealed);

  const tamperedTransfer = structuredClone(transfer);
  tamperedTransfer.evidence_objects[0].execution.terminal.output_bytes += 1;
  expectFailure("tampered transfer", () => validateEvidenceTransfer(tamperedTransfer), /digest|identity|tamper/iu);
  const partialTransfer = structuredClone(transfer);
  partialTransfer.evidence_objects = [];
  expectFailure("partial transfer", () => validateEvidenceTransfer(partialTransfer), /schema|reference|object|items/iu);
  const duplicateTransfer = structuredClone(transfer);
  duplicateTransfer.evidence_refs.push(structuredClone(duplicateTransfer.evidence_refs[0]));
  duplicateTransfer.evidence_objects.push(structuredClone(duplicateTransfer.evidence_objects[0]));
  expectFailure("duplicate transfer", () => validateEvidenceTransfer(duplicateTransfer), /duplicate|unique|digest/iu);

  const localOnly = sealVerificationEvidence(evidenceDraft({
    privacy: { ...evidenceDraft().privacy, exportability: "local_only" },
  }));
  putVerificationEvidence({ storeRoot: store, evidence: localOnly });
  expectFailure("local-only export", () => buildEvidenceTransfer({ storeRoot: store, evidenceIds: [localOnly.evidence_id] }), /local_only|export/iu);

  const tamperStore = resolve(root, "tamper-store");
  putVerificationEvidence({ storeRoot: tamperStore, evidence: sealed });
  const storedPath = evidenceObjectPath({ storeRoot: tamperStore, evidenceId: sealed.evidence_id });
  const stored = JSON.parse(readFileSync(storedPath, "utf8"));
  stored.execution.terminal.output_bytes += 1;
  writeFileSync(storedPath, `${JSON.stringify(stored, null, 2)}\n`);
  expectFailure("stored evidence tamper", () => readVerificationEvidence({ storeRoot: tamperStore, evidenceId: sealed.evidence_id }), /digest|content-addressed|tamper/iu);

  const symlinkStore = resolve(root, "symlink-store");
  const symlinkTarget = resolve(root, "symlink-target");
  mkdirSync(symlinkStore);
  mkdirSync(symlinkTarget);
  symlinkSync(symlinkTarget, resolve(symlinkStore, "objects"));
  expectFailure("store symlink", () => putVerificationEvidence({ storeRoot: symlinkStore, evidence: sealed }), /symlink/iu);

  const missingEnvironment = evidenceDraft();
  delete missingEnvironment.execution.environment;
  expectFailure("partial evidence", () => sealVerificationEvidence(missingEnvironment), /environment|schema/iu);
  const rawOutput = evidenceDraft();
  rawOutput.execution.raw_output = "forbidden";
  expectFailure("raw output field", () => sealVerificationEvidence(rawOutput), /raw_output|unknown property|privacy/iu);
  expectFailure("privacy attestation", () => sealVerificationEvidence(evidenceDraft({
    privacy: { ...evidenceDraft().privacy, raw_output_stored: true },
  })), /raw_output|equal false|privacy/iu);
  expectFailure("absolute working directory", () => sealVerificationEvidence(evidenceDraft({
    execution: {
      ...evidenceDraft().execution,
      command: { ...evidenceDraft().execution.command, working_directory: "/private/tmp/work" },
    },
  })), /portable|absolute|working_directory|pattern/iu);
  expectFailure("absolute command argument", () => sealVerificationEvidence(evidenceDraft({
    execution: {
      ...evidenceDraft().execution,
      command: { ...evidenceDraft().execution.command, arguments: ["/Users/example/private-test.mjs"] },
    },
  })), /absolute|private path|argument/iu);
  expectFailure("credential argument", () => sealVerificationEvidence(evidenceDraft({
    execution: {
      ...evidenceDraft().execution,
      command: { ...evidenceDraft().execution.command, arguments: ["--token=private-value"] },
    },
  })), /credential|secret|argument/iu);

  const reordered = evidenceDraft();
  reordered.consumed_inputs.reverse();
  const normalizedOrder = sealVerificationEvidence(reordered);
  assert.equal(normalizedOrder.evidence_id, sealed.evidence_id, "input ordering must not change evidence identity");

  console.log("Verification evidence exact-reuse tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
