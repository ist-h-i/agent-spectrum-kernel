#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  attestVerificationEvidence,
  buildEvidenceTransfer,
  buildVerificationRequirements,
  evidenceObjectPath,
  importEvidenceTransfer,
  planExactReuse,
  putVerificationEvidence,
  readVerificationEvidence,
  reuseIdentityFromEvidence,
  stableCanonicalJson,
  validateEvidenceTransfer,
  validateVerificationEvidence,
  validateVerificationReusePlan,
  verificationCommandIdentity,
} from "./verification-evidence.mjs";
import { canonicalDigest } from "./content-addressed-store.mjs";

const digest = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const trustedProducerKeys = generateKeyPairSync("ed25519");
const attackerProducerKeys = generateKeyPairSync("ed25519");

const sealDraft = (draft, privateKey = trustedProducerKeys.privateKey) => attestVerificationEvidence(draft, { privateKey });

function expectFailure(label, action, pattern) {
  assert.throws(action, pattern, label);
}

function resealPlan(plan) {
  const content = structuredClone(plan);
  delete content.plan_id;
  delete content.plan_digest;
  const planDigest = canonicalDigest(content);
  return {
    ...content,
    plan_id: `verification-reuse-plan-${planDigest.slice("sha256:".length)}`,
    plan_digest: planDigest,
  };
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
        ...verificationCommandIdentity({
          executable: "node",
          arguments: ["scripts/test-verification-evidence.mjs"],
          working_directory: ".",
        }),
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
      obligation_refs: ["VER-274-S1@2#O-CAS", "VER-274-S1@2#O-EXACT"],
      explicit_non_coverage: ["independent-semantic-review"],
    },
    invalidation: {
      mode: "exact_identity_only",
      unknown_dependencies_require_rerun: true,
    },
    producer: {
      kind: "developer",
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
    required_obligation_refs: structuredClone(evidence.coverage.obligation_refs),
    authority: {
      independent_judgment_required: false,
      accepted_producers: [{
        kind: evidence.producer.kind,
        identity_digest: evidence.producer.identity_digest,
      }],
      accepted_evidence_levels: ["behavior_verified", "executed"],
    },
    execution_availability: "available",
    ...structuredClone(overrides),
  };
}

const root = mkdtempSync(resolve(tmpdir(), "ask-verification-evidence-"));
try {
  const store = resolve(root, "store");
  const sealed = sealDraft(evidenceDraft());
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
  validateVerificationReusePlan(exactPlan, { requirements, storeRoot: store });
  assert.equal(exactPlan.dispositions[0].disposition, "reuse_exact");
  assert.equal(exactPlan.dispositions[0].reason_code, "exact_identity_verified");
  assert.deepEqual(exactPlan.dispositions[0].required_obligation_refs, sealed.coverage.obligation_refs);
  assert.deepEqual(exactPlan.dispositions[0].covered_obligation_refs, sealed.coverage.obligation_refs);
  assert.deepEqual(exactPlan.dispositions[0].uncovered_obligation_refs, []);
  assert.equal(exactPlan.coverage.status, "covered");
  assert.deepEqual(exactPlan.coverage.covered_gate_ids, [sealed.gate.gate_id]);
  expectFailure(
    "reuse plan requires evidence resolution",
    () => validateVerificationReusePlan(exactPlan, { requirements }),
    /store|resolve|evidence/iu,
  );
  expectFailure(
    "reuse plan requires bound requirements",
    () => validateVerificationReusePlan(exactPlan, { storeRoot: store }),
    /requirements/iu,
  );

  const unresolvedPlan = structuredClone(exactPlan);
  unresolvedPlan.dispositions[0].evidence_digest = digest("missing-evidence-object");
  unresolvedPlan.dispositions[0].evidence_id = `verification-evidence-${unresolvedPlan.dispositions[0].evidence_digest.slice("sha256:".length)}`;
  expectFailure(
    "reuse plan must resolve referenced evidence",
    () => validateVerificationReusePlan(resealPlan(unresolvedPlan), { requirements, storeRoot: store }),
    /evidence|resolve|store|missing/iu,
  );

  const uncoveredObligation = "VER-274-S1@2#O-TRANSFER";
  const obligationMismatchRequirements = buildVerificationRequirements({
    requiredGates: [acceptedGate(sealed, {
      required_obligation_refs: [...sealed.coverage.obligation_refs, uncoveredObligation],
    })],
  });
  const obligationMismatchPlan = planExactReuse({ storeRoot: store, requirements: obligationMismatchRequirements });
  assert.equal(obligationMismatchPlan.dispositions[0].disposition, "rerun_required");
  assert.equal(obligationMismatchPlan.dispositions[0].reason_code, "exact_evidence_coverage_mismatch");
  assert.deepEqual(obligationMismatchPlan.dispositions[0].covered_obligation_refs, []);
  assert.deepEqual(obligationMismatchPlan.dispositions[0].uncovered_obligation_refs, obligationMismatchRequirements.required_gates[0].required_obligation_refs);
  assert.equal(obligationMismatchPlan.coverage.status, "blocked");
  expectFailure(
    "plan requirements binding",
    () => validateVerificationReusePlan(exactPlan, { requirements: obligationMismatchRequirements, storeRoot: store }),
    /requirements|obligation|target|gate/iu,
  );

  const staleProducerGate = acceptedGate(sealed);
  staleProducerGate.authority.accepted_producers[0].identity_digest = digest("different-producer-authority");
  const staleProducerPlan = planExactReuse({
    storeRoot: store,
    requirements: buildVerificationRequirements({ requiredGates: [staleProducerGate] }),
  });
  assert.equal(staleProducerPlan.dispositions[0].disposition, "rerun_required");
  assert.equal(staleProducerPlan.dispositions[0].reason_code, "exact_evidence_authority_mismatch");
  assert.equal(staleProducerPlan.coverage.status, "blocked");

  expectFailure("producer impersonation", () => sealDraft(evidenceDraft({
    producer: {
      kind: "developer",
      identity_digest: sealed.producer.identity_digest,
    },
  }), attackerProducerKeys.privateKey), /producer identity|signing key|attest/iu);

  const wrongKindStore = resolve(root, "wrong-kind-store");
  const wrongKind = sealDraft(evidenceDraft({ producer: { kind: "reviewer" } }));
  putVerificationEvidence({ storeRoot: wrongKindStore, evidence: wrongKind });
  const wrongKindPlan = planExactReuse({ storeRoot: wrongKindStore, requirements });
  assert.equal(wrongKindPlan.dispositions[0].reason_code, "exact_evidence_authority_mismatch", "producer kind and key fingerprint must be accepted as one pair");

  const changedIdentities = [
    ["repository", (identity) => { identity.target.repository_id = "github.com/example/transplant"; }],
    ["target", (identity) => { identity.target.target_revision = "c2637c364d4ef205448b2844ccc74b2928078020"; }],
    ["tree", (identity) => { identity.target.tree_digest = digest("different-tree"); }],
    ["gate contract", (identity) => { identity.gate.contract_digest = digest("different-contract"); }],
    ["consumed input", (identity) => { identity.consumed_inputs[0].digest = digest("changed-input"); }],
    ["command", (identity) => { identity.execution.command = verificationCommandIdentity({ executable: "node", arguments: ["scripts/other-test.mjs"], working_directory: "." }); }],
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
  const failed = sealDraft(evidenceDraft({
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

  const untrustedEvidence = sealDraft(evidenceDraft(), attackerProducerKeys.privateKey);
  const untrustedSourceStore = resolve(root, "untrusted-source-store");
  putVerificationEvidence({ storeRoot: untrustedSourceStore, evidence: untrustedEvidence });
  const untrustedTransfer = buildEvidenceTransfer({ storeRoot: untrustedSourceStore, evidenceIds: [untrustedEvidence.evidence_id] });
  const untrustedImportedStore = resolve(root, "untrusted-imported-store");
  importEvidenceTransfer({ storeRoot: untrustedImportedStore, transfer: untrustedTransfer });
  const untrustedImportedPlan = planExactReuse({ storeRoot: untrustedImportedStore, requirements });
  assert.equal(untrustedImportedPlan.dispositions[0].reason_code, "exact_evidence_authority_mismatch", "import must not grant producer authority");

  const secondEvidence = sealDraft(evidenceDraft({
    execution: {
      ...evidenceDraft().execution,
      terminal: {
        ...evidenceDraft().execution.terminal,
        duration_ms: 456,
        output_digest: digest("second focused test pass"),
      },
    },
  }));
  putVerificationEvidence({ storeRoot: store, evidence: secondEvidence });
  const multiTransfer = buildEvidenceTransfer({ storeRoot: store, evidenceIds: [sealed.evidence_id, secondEvidence.evidence_id] });
  const partialImportStore = resolve(root, "partial-import-store");
  const firstImportObject = multiTransfer.evidence_objects[0];
  const conflictingImportObject = multiTransfer.evidence_objects[1];
  const conflictingImportPath = evidenceObjectPath({ storeRoot: partialImportStore, evidenceId: conflictingImportObject.evidence_id });
  mkdirSync(dirname(conflictingImportPath), { recursive: true });
  writeFileSync(conflictingImportPath, "{}\n");
  expectFailure("multi-object import preflight", () => importEvidenceTransfer({ storeRoot: partialImportStore, transfer: multiTransfer }), /digest|content-addressed|conflict|tamper/iu);
  assert.equal(existsSync(evidenceObjectPath({ storeRoot: partialImportStore, evidenceId: firstImportObject.evidence_id })), false, "import must preflight all existing destinations before publishing a new object");

  const cliDraftPath = resolve(root, "cli-draft.json");
  const cliSealedPath = resolve(root, "cli-sealed.json");
  const cliRequirementsPath = resolve(root, "cli-requirements.json");
  const cliPlanPath = resolve(root, "cli-plan.json");
  const cliTransferPath = resolve(root, "cli-transfer.json");
  const cliStore = resolve(root, "cli-store");
  const cliImportedStore = resolve(root, "cli-imported-store");
  writeFileSync(cliDraftPath, `${JSON.stringify(sealed, null, 2)}\n`);
  writeFileSync(cliRequirementsPath, `${JSON.stringify({ requiredGates: [acceptedGate(sealed)] }, null, 2)}\n`);
  const runCli = (args) => spawnSync(process.execPath, [resolve("scripts/verification-evidence.mjs"), ...args], { cwd: resolve("."), encoding: "utf8" });
  const runCliAsync = (args) => new Promise((complete) => {
    const child = spawn(process.execPath, [resolve("scripts/verification-evidence.mjs"), ...args], { cwd: resolve(".") });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => complete({ status, stdout, stderr }));
  });
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

  const unsignedDraftPath = resolve(root, "unsigned-draft.json");
  writeFileSync(unsignedDraftPath, `${JSON.stringify(evidenceDraft(), null, 2)}\n`);
  const unsignedPut = runCli(["put", "--store", resolve(root, "unsigned-store"), "--input", unsignedDraftPath]);
  assert.notEqual(unsignedPut.status, 0);
  assert.match(unsignedPut.stderr, /producer-attested|sealed evidence/iu);
  const unknownOption = runCli(["verify", "--store", cliStore, "--evidence-id", sealed.evidence_id, "--surprise", "value"]);
  assert.notEqual(unknownOption.status, 0);
  assert.match(unknownOption.stderr, /unknown.*option/iu);

  const duplicateKeyPath = resolve(root, "duplicate-key-evidence.json");
  const duplicateKeyEvidence = JSON.stringify(sealed).replace('{"schema_version":', '{"schema_version":"1.0.0","schema_version":');
  writeFileSync(duplicateKeyPath, `${duplicateKeyEvidence}\n`);
  const duplicateKeyPut = runCli(["put", "--store", resolve(root, "duplicate-key-store"), "--input", duplicateKeyPath]);
  assert.notEqual(duplicateKeyPut.status, 0);
  assert.match(duplicateKeyPut.stderr, /duplicate JSON object key/iu);

  const racingStore = resolve(root, "racing-store");
  const racingPuts = await Promise.all([
    runCliAsync(["put", "--store", racingStore, "--input", cliDraftPath]),
    runCliAsync(["put", "--store", racingStore, "--input", cliDraftPath]),
  ]);
  for (const result of racingPuts) assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(racingPuts.map((result) => JSON.parse(result.stdout).created).sort(), [false, true]);

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
  const tamperedSignature = structuredClone(sealed);
  tamperedSignature.producer.attestation.signature = `${tamperedSignature.producer.attestation.signature[0] === "A" ? "B" : "A"}${tamperedSignature.producer.attestation.signature.slice(1)}`;
  expectFailure("producer signature tamper", () => validateVerificationEvidence(tamperedSignature), /signature|attestation/iu);

  const localOnly = sealDraft(evidenceDraft({
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

  const nonCanonicalStore = resolve(root, "non-canonical-store");
  putVerificationEvidence({ storeRoot: nonCanonicalStore, evidence: sealed });
  const nonCanonicalPath = evidenceObjectPath({ storeRoot: nonCanonicalStore, evidenceId: sealed.evidence_id });
  const nonCanonicalValue = JSON.parse(readFileSync(nonCanonicalPath, "utf8"));
  writeFileSync(nonCanonicalPath, `${JSON.stringify(nonCanonicalValue, null, 2)}\n`);
  expectFailure("canonical-byte-only tamper", () => readVerificationEvidence({ storeRoot: nonCanonicalStore, evidenceId: sealed.evidence_id }), /canonical byte form/iu);

  const symlinkStore = resolve(root, "symlink-store");
  const symlinkTarget = resolve(root, "symlink-target");
  mkdirSync(symlinkStore);
  mkdirSync(symlinkTarget);
  symlinkSync(symlinkTarget, resolve(symlinkStore, "objects"));
  expectFailure("store symlink", () => putVerificationEvidence({ storeRoot: symlinkStore, evidence: sealed }), /symlink/iu);

  const missingEnvironment = evidenceDraft();
  delete missingEnvironment.execution.environment;
  expectFailure("partial evidence", () => sealDraft(missingEnvironment), /environment|schema/iu);
  const rawOutput = evidenceDraft();
  rawOutput.execution.raw_output = "forbidden";
  expectFailure("raw output field", () => sealDraft(rawOutput), /raw_output|unknown property|privacy/iu);
  const contradictoryCoverage = evidenceDraft();
  contradictoryCoverage.coverage.explicit_non_coverage.push(contradictoryCoverage.coverage.obligation_refs[0]);
  expectFailure("contradictory coverage", () => sealDraft(contradictoryCoverage), /coverage|obligation|contradict/iu);
  const conflictingInputPath = evidenceDraft();
  conflictingInputPath.consumed_inputs[1].path = conflictingInputPath.consumed_inputs[0].path;
  expectFailure("conflicting consumed input path", () => sealDraft(conflictingInputPath), /consumed input|path|duplicate|conflict/iu);
  const conflictingToolchain = evidenceDraft();
  conflictingToolchain.execution.toolchain.push({
    ...conflictingToolchain.execution.toolchain[0],
    version: "v25.0.0",
    identity_digest: digest("node-v25.0.0-darwin-arm64"),
  });
  expectFailure("conflicting toolchain name", () => sealDraft(conflictingToolchain), /toolchain|name|duplicate|conflict/iu);
  expectFailure("privacy attestation", () => sealDraft(evidenceDraft({
    privacy: { ...evidenceDraft().privacy, raw_output_stored: true },
  })), /raw_output|equal false|privacy/iu);
  expectFailure("absolute working directory", () => sealDraft(evidenceDraft({
    execution: {
      ...evidenceDraft().execution,
      command: { ...evidenceDraft().execution.command, working_directory: "/private/tmp/work" },
    },
  })), /portable|absolute|working_directory|pattern/iu);
  const privateCommand = verificationCommandIdentity({
    executable: "node",
    arguments: ["/Users/example/private-test.mjs", "--token=private-value", "Authorization: Bearer private-value"],
    working_directory: ".",
  });
  assert.equal(Object.hasOwn(privateCommand, "arguments"), false);
  assert.doesNotMatch(stableCanonicalJson(privateCommand), /Users|private-value|Bearer/u);
  const privateCommandEvidence = sealDraft(evidenceDraft({
    execution: {
      ...evidenceDraft().execution,
      command: privateCommand,
    },
  }));
  const privateCommandStore = resolve(root, "private-command-store");
  putVerificationEvidence({ storeRoot: privateCommandStore, evidence: privateCommandEvidence });
  const privateCommandTransfer = buildEvidenceTransfer({ storeRoot: privateCommandStore, evidenceIds: [privateCommandEvidence.evidence_id] });
  assert.doesNotMatch(stableCanonicalJson(privateCommandTransfer), /Users|private-value|Bearer/u);
  expectFailure("raw credential arguments", () => sealDraft(evidenceDraft({
    execution: {
      ...evidenceDraft().execution,
      command: { ...evidenceDraft().execution.command, arguments: ["--token=private-value", "Authorization: Bearer private-value"] },
    },
  })), /arguments|unknown property|schema|privacy/iu);
  expectFailure("raw prompt transcript", () => sealDraft(evidenceDraft({
    execution: {
      ...evidenceDraft().execution,
      transcript: "private prompt and raw log",
    },
  })), /transcript|unknown property|schema|privacy/iu);
  expectFailure("parent path segment", () => sealDraft(evidenceDraft({
    consumed_inputs: [{
      ...evidenceDraft().consumed_inputs[0],
      path: "scripts/../private-input.json",
    }],
  })), /portable|path|pattern|schema/iu);

  const reordered = evidenceDraft();
  reordered.consumed_inputs.reverse();
  const normalizedOrder = sealDraft(reordered);
  assert.equal(normalizedOrder.evidence_id, sealed.evidence_id, "input ordering must not change evidence identity");

  console.log("Verification evidence exact-reuse tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
