#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAIM_EVIDENCE_CONTRACT_REF,
  FORMAL_EVIDENCE_LEDGER_TRIGGER_IDS,
  canonicalClaimEvidenceStatuses,
  normalizeClaimEvidenceStatus,
  selectClaimEvidenceMode,
  validateClaimEvidenceUse,
  validateFormalEvidenceLedger,
} from "./claim-evidence-status.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const canonicalStatuses = ["Verified", "Supported", "Hypothesis", "Unknown", "Falsified"];
const formalTriggerIds = [
  "explicit_claim_audit",
  "multiple_material_claims",
  "high_stakes_readiness",
  "cross_artifact_synthesis",
  "stable_claim_ids",
];

assert.equal(CLAIM_EVIDENCE_CONTRACT_REF, "ask.claim-evidence-status@1.0.0");
assert.deepEqual(canonicalClaimEvidenceStatuses(), canonicalStatuses);
assert.deepEqual(FORMAL_EVIDENCE_LEDGER_TRIGGER_IDS, formalTriggerIds);

const schemaPath = resolve(root, "schemas/claim-evidence-status.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
assert.deepEqual(schema.enum, canonicalStatuses);
assert.equal(schema["x-ask-contract"].ref, CLAIM_EVIDENCE_CONTRACT_REF);
assert.deepEqual(schema["x-ask-contract"].formal_ledger.trigger_ids, formalTriggerIds);
assert.equal(schema["x-ask-contract"].inline_default, true);

for (const status of canonicalStatuses) {
  const normalized = normalizeClaimEvidenceStatus({ status });
  assert.equal(normalized.canonical_status, status);
  assert.equal(normalized.original_status, status);
  assert.equal(normalized.migration_basis, "canonical");
}

for (const [legacy, canonical] of Object.entries({
  verified: "Verified",
  supported: "Supported",
  hypothesis: "Hypothesis",
  unknown: "Unknown",
  falsified: "Falsified",
})) {
  const normalized = normalizeClaimEvidenceStatus({ status: legacy });
  assert.equal(normalized.canonical_status, canonical);
  assert.equal(normalized.migration_basis, "lowercase_alias");
}

assert.equal(normalizeClaimEvidenceStatus({ status: "weak", evidence_strength: "indirect", evidence_refs: ["test:fixture"] }).canonical_status, "Supported");
assert.equal(normalizeClaimEvidenceStatus({ status: "weak", evidence_strength: "direct", evidence_refs: ["command:exit-0"] }).canonical_status, "Supported");
assert.equal(normalizeClaimEvidenceStatus({ status: "weak", evidence_strength: "assumption", evidence_refs: [] }).canonical_status, "Hypothesis");
assert.equal(normalizeClaimEvidenceStatus({ status: "weak", evidence_strength: "missing", evidence_refs: [] }).canonical_status, "Hypothesis");
assert.notEqual(normalizeClaimEvidenceStatus({ status: "weak", evidence_strength: "direct", evidence_refs: ["command:exit-0"] }).canonical_status, "Verified");
for (const blankReference of [" ", "\t", "\n"]) {
  assert.throws(
    () => normalizeClaimEvidenceStatus({ status: "weak", evidence_strength: "direct", evidence_refs: [blankReference] }),
    /non-empty strings/iu,
  );
}

const humanConfirmed = normalizeClaimEvidenceStatus({ status: "Human-confirmed", evidence_strength: "direct", evidence_refs: ["owner:statement"] });
assert.equal(humanConfirmed.canonical_status, "Supported");
assert.equal(humanConfirmed.authority_status, "human_confirmed");
assert.equal(humanConfirmed.record_state, "active");

const deprecated = normalizeClaimEvidenceStatus({ status: "Deprecated" });
assert.equal(deprecated.canonical_status, "Unknown");
assert.equal(deprecated.record_state, "deprecated");

const contradicted = normalizeClaimEvidenceStatus({ status: "Contradicted", evidence_refs: ["test:counterexample"] });
assert.equal(contradicted.canonical_status, "Falsified");
assert.equal(contradicted.record_state, "contradicted");

for (const status of ["weakly_supported", "weakened", "pass", "", null]) {
  assert.throws(() => normalizeClaimEvidenceStatus({ status }), /claim evidence status/iu);
}

const migrationInput = { status: "weak", evidence_strength: "indirect", evidence_refs: ["doc:legacy"] };
const before = createHash("sha256").update(JSON.stringify(migrationInput)).digest("hex");
const migration = normalizeClaimEvidenceStatus(migrationInput);
const after = createHash("sha256").update(JSON.stringify(migrationInput)).digest("hex");
assert.equal(after, before, "compatibility normalization must not rewrite the imported artifact");
assert.equal(migration.original_status, "weak");
assert.equal(migration.canonical_status, "Supported");

assert.equal(selectClaimEvidenceMode([]), "inline");
for (const triggerId of formalTriggerIds) assert.equal(selectClaimEvidenceMode([triggerId]), "formal_ledger");
assert.throws(() => selectClaimEvidenceMode(["generic_correctness_claim"]), /formal evidence ledger trigger/iu);
assert.doesNotThrow(() => validateFormalEvidenceLedger({ trigger_ids: [], ledger_present: false }));
assert.doesNotThrow(() => validateFormalEvidenceLedger({ trigger_ids: ["multiple_material_claims"], ledger_present: true }));
assert.throws(() => validateFormalEvidenceLedger({ trigger_ids: ["high_stakes_readiness"], ledger_present: false }), /formal Evidence Ledger is required/iu);
assert.throws(() => validateFormalEvidenceLedger({ trigger_ids: [], ledger_present: true }), /formal Evidence Ledger is not activated/iu);

assert.doesNotThrow(() => validateClaimEvidenceUse({ status: "Verified", evidence_refs: ["command:exit-0"], use: "completion" }));
assert.doesNotThrow(() => validateClaimEvidenceUse({ status: "Supported", evidence_refs: ["inspection:file"] }));
assert.doesNotThrow(() => validateClaimEvidenceUse({ status: "Hypothesis", missing_evidence: ["reproduction"], use: "investigation" }));
assert.doesNotThrow(() => validateClaimEvidenceUse({ status: "Falsified", evidence_refs: ["test:counterexample"], corrected: true }));
assert.throws(() => validateClaimEvidenceUse({ status: "Verified", evidence_refs: [], use: "completion" }), /evidence reference/iu);
assert.throws(() => validateClaimEvidenceUse({ status: "Unknown", use: "pass" }), /Unknown cannot support/iu);
assert.throws(() => validateClaimEvidenceUse({ status: "Unknown", use: "zero" }), /Unknown cannot support/iu);
assert.throws(() => validateClaimEvidenceUse({ status: "Unknown", use: "absence" }), /Unknown cannot support/iu);
for (const use of ["pass", "zero", "absence", "completion", "readiness"]) {
  assert.throws(
    () => validateClaimEvidenceUse({ status: "Verified", evidence_refs: ["command:exit-0"], missing_evidence: ["required-check"], use }),
    /missing evidence/iu,
  );
}
for (const use of ["completion", "merge", "release", "permission", "activation", "correctness", "readiness", "security", "reliability", "performance", "ux", "cost", "maintainability", "no_regression"]) {
  assert.throws(() => validateClaimEvidenceUse({ status: "Hypothesis", missing_evidence: ["next-check"], use }), /Hypothesis cannot support/iu);
}
for (const use of ["correctness", "readiness", "security", "reliability", "performance", "ux", "cost", "maintainability", "no_regression"]) {
  assert.throws(() => validateClaimEvidenceUse({ status: "Supported", evidence_refs: ["inspection:file"], use }), /Supported cannot support/iu);
}
assert.throws(() => validateClaimEvidenceUse({ status: "Supported", evidence_refs: ["inspection:file"], contradicted: true }), /contradictory claim evidence/iu);
assert.throws(() => validateClaimEvidenceUse({ status: "Falsified", evidence_refs: ["test:counterexample"], corrected: false }), /must be corrected/iu);

for (const schemaName of [
  "domain-rule-ledger-entry.schema.json",
  "review-rule-ledger-entry.schema.json",
  "engineering-pattern-ledger-entry.schema.json",
  "verification-pattern-ledger-entry.schema.json",
  "architecture-decision-memory-entry.schema.json",
  "documentation-knowledge-ledger-entry.schema.json",
  "engineering-capability-ledger-entry.schema.json",
]) {
  const consumer = JSON.parse(readFileSync(resolve(root, "schemas", schemaName), "utf8"));
  assert.equal(consumer.properties.evidence_status.$ref, "claim-evidence-status.schema.json");
  assert.equal("enum" in consumer.properties.evidence_status, false, `${schemaName} must not copy the taxonomy`);
}

for (const [schemaName, requiredSeparationFields] of Object.entries({
  "domain-rule-ledger-entry.schema.json": ["authority_status", "record_state"],
  "review-rule-ledger-entry.schema.json": ["authority_status", "record_state"],
  "engineering-pattern-ledger-entry.schema.json": ["authority_status", "record_state"],
  "verification-pattern-ledger-entry.schema.json": ["authority_status", "record_state"],
  "architecture-decision-memory-entry.schema.json": ["authority_status", "record_state"],
  "documentation-knowledge-ledger-entry.schema.json": ["authority_status", "freshness_status"],
  "engineering-capability-ledger-entry.schema.json": ["authority_status", "assessment_state"],
})) {
  const consumer = JSON.parse(readFileSync(resolve(root, "schemas", schemaName), "utf8"));
  for (const field of requiredSeparationFields) assert.ok(consumer.required.includes(field), `${schemaName} must require ${field}`);
}

const epicAdmissionSchema = JSON.parse(readFileSync(resolve(root, "schemas/epic-admission-decision.schema.json"), "utf8"));
assert.equal(epicAdmissionSchema.$defs.evidenceStatus.$ref, "claim-evidence-status.schema.json#/$defs/lowercase_status");
assert.equal("enum" in epicAdmissionSchema.$defs.evidenceStatus, false, "epic admission must reference lowercase compatibility instead of copying it");

const assetRecordSchema = JSON.parse(readFileSync(resolve(root, "schemas/asset-record.schema.json"), "utf8"));
assert.equal(assetRecordSchema.$defs.evidenceStatus.$ref, "claim-evidence-status.schema.json#/$defs/lowercase_observation_status");
assert.equal("enum" in assetRecordSchema.$defs.evidenceStatus, false, "Asset records must reference their backward-compatible claim-status subset instead of copying it");
assert.deepEqual(schema.$defs.lowercase_observation_status.enum, ["verified", "supported", "unknown"]);

console.log("Claim evidence status contract tests passed");
