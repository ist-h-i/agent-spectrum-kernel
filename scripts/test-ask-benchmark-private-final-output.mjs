import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as boundary from "./ask-benchmark-evaluator-boundary.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const final = {
  task_type: "review", decision: "request_changes", findings: [], requirement_status: [],
  verification_commands: [], completion_claim: "incomplete", route: null, summary: "Scoped review.",
};
const bytes = Buffer.from(`${JSON.stringify(final)}\n`);
const digest = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const normalized = { lineage: {
  run_instance_id: "run-1", case_id: "case-0000000000000000-0000000000000000", attempt: "attempt-000001",
  final_output_digest: digest(bytes), final_output_bytes: bytes.length,
} };
const candidateAuthority = { kind: "verified_terminal_candidate", run_instance_id: normalized.lineage.run_instance_id, case_id: normalized.lineage.case_id, attempt: normalized.lineage.attempt };
const evidence = new Map([["verified-agent-final.json", bytes]]);
const validate = (options = {}) => boundary.validateSealedPrivateFinalOutputEvidence({ root, normalized, candidateAuthority, evidenceBuffers: evidence, ...options });

assert.equal("verifiedFinalOutputBytesForPrivateEvaluation" in boundary, false, "result-reading helper must remain private");
validate();
assert.throws(() => validate({ candidateAuthority: { ...candidateAuthority, case_id: "wrong" } }), /lineage/u);
assert.throws(() => validate({ normalized: { lineage: { ...normalized.lineage, final_output_digest: `sha256:${"0".repeat(64)}` } } }), /differs/u);
assert.throws(() => validate({ evidenceBuffers: new Map() }), /differs/u);
assert.throws(() => validate({ evidenceBuffers: new Map([["verified-agent-final.json", Buffer.from("different")]]) }), /differs/u);
assert.throws(() => validate({ normalized: { lineage: { ...normalized.lineage, final_output_digest: null, final_output_bytes: null } } }), /without normalized/u);
const missingOutput = { lineage: { ...normalized.lineage, final_output_digest: null, final_output_bytes: null } };
validate({ normalized: missingOutput, evidenceBuffers: new Map() });
const malformed = Buffer.from('{"task_type":"review","task_type":"implementation"}');
assert.throws(() => validate({ normalized: { lineage: { ...normalized.lineage, final_output_digest: digest(malformed), final_output_bytes: malformed.length } }, evidenceBuffers: new Map([["verified-agent-final.json", malformed]]) }), /duplicate/u);
const schemaInvalid = Buffer.from('{"task_type":"review"}');
assert.throws(() => validate({ normalized: { lineage: { ...normalized.lineage, final_output_digest: digest(schemaInvalid), final_output_bytes: schemaInvalid.length } }, evidenceBuffers: new Map([["verified-agent-final.json", schemaInvalid]]) }), /Schema|must|missing/u);
process.stdout.write("private final output byte validation: 10 checks passed\n");
