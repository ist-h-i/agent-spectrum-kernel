#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildExecutionEnvelopeRecord,
  hasExecutionEnvelopeMarker,
  inspectExecutionEnvelope,
  inspectExecutionEnvelopeRecordEmission,
  renderExecutionEnvelopeBlock,
  renderExecutionEnvelopeProjection,
  selectExecutionEnvelopeEmission,
  validateExecutionEnvelopeRecord,
} from "./execution-envelope.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const schemaPath = resolve(root, "schemas/execution-envelope-record.schema.json");
const runnerResultSchemaPath = resolve(root, "schemas/codex-runner-result.schema.json");
const digest = (character) => `sha256:${character.repeat(64)}`;

const recordSchema = JSON.parse(readFileSync(schemaPath, "utf8"));
assert.equal(recordSchema.additionalProperties, false);
assert.equal(recordSchema.properties.envelope.$ref, "execution-envelope.schema.json");
assert.deepEqual(recordSchema.properties.emission_class.enum, ["sidecar", "inline_required", "diagnostic"]);
assert.equal(recordSchema.properties.authority.properties.owner.const, "runner");
const runnerResultSchema = JSON.parse(readFileSync(runnerResultSchemaPath, "utf8"));
assert.equal(runnerResultSchema.additionalProperties, false);
assert.equal(Object.hasOwn(runnerResultSchema.properties, "route"), false);
assert.deepEqual(runnerResultSchema.required, ["schema_version", "response_markdown", "control"]);
assert.deepEqual(runnerResultSchema.properties.control.required, ["evidence_status", "stop_reason", "next_action"]);

const binding = {
  adapter_id: "codex",
  entry_id: "skill-implement.md",
  mode: "implementation",
  profile_id: "ask.codex.implementation.compact",
  profile_schema_version: "1.1.0",
  canonical_revision: "fixture-revision",
  canonical_source_digest: digest("a"),
  profile_fingerprint: digest("b"),
  rendered_sha256: digest("c"),
};
const envelope = {
  schema_version: "1.0.0",
  route: {
    work_mode: "実装",
    operating_mode: "delivery_quality",
    user_facing: "scoped implementation",
    internal: {
      primary: "controlled-implementation",
      secondary: ["test-first-verification"],
    },
  },
  evidence_status: {
    checked: ["node scripts/test-execution-envelope-record.mjs exit 0"],
    missing: [],
  },
  stop_reason: {
    status: "completed",
    details: [],
    human_decision_required: [],
    stop_if: [],
  },
  next_action: "request independent review",
};
const responseMarkdown = "Implementation Contract:\n- Artifact ID: IMPL-228\n\nEvidence:\n- command: focused fixture\n  result: pass\n";
const indentBlock = (value, spaces) => value.split("\n").map((line) => line ? `${" ".repeat(spaces)}${line}` : line).join("\n");

assert.equal(selectExecutionEnvelopeEmission({ mode: "implementation", stopStatus: "completed" }), "sidecar");
assert.equal(selectExecutionEnvelopeEmission({ mode: "review", stopStatus: "none" }), "sidecar");
assert.equal(selectExecutionEnvelopeEmission({ mode: "handoff", stopStatus: "completed" }), "inline_required");
for (const stopStatus of ["human_decision", "insufficient_evidence", "capability_missing", "risk_gate", "blocked"]) {
  assert.equal(selectExecutionEnvelopeEmission({ mode: "implementation", stopStatus }), "inline_required");
}
assert.equal(selectExecutionEnvelopeEmission({ mode: "implementation", stopStatus: "completed", diagnostic: true }), "diagnostic");

const sidecar = buildExecutionEnvelopeRecord({
  emissionClass: "sidecar",
  authority: {
    owner: "runner",
    fixed_fields_source: "compact_profile",
    dynamic_fields_source: "structured_runtime_result",
  },
  binding,
  envelope,
  responseMarkdown,
  controlInputSha256: digest("d"),
});
assert.deepEqual(validateExecutionEnvelopeRecord(sidecar, { schemaPath }), []);
assert.match(sidecar.record_id, /^execution-envelope-record-[a-f0-9]{64}$/u);
assert.equal(renderExecutionEnvelopeProjection(responseMarkdown, sidecar), responseMarkdown);
assert.equal(inspectExecutionEnvelopeRecordEmission(responseMarkdown, sidecar, { schemaPath }).status, "valid");

for (const spaces of [0, 1, 2, 3]) {
  const legacyInline = indentBlock(renderExecutionEnvelopeBlock(envelope), spaces);
  assert.equal(hasExecutionEnvelopeMarker(legacyInline), true, `${spaces}-space legacy marker must be top-level`);
  assert.equal(inspectExecutionEnvelope(legacyInline).status, "parsed", `${spaces}-space legacy inline Envelope must parse`);
}
for (const legacyExample of [indentBlock(renderExecutionEnvelopeBlock(envelope), 4), `\t${renderExecutionEnvelopeBlock(envelope)}`]) {
  assert.equal(hasExecutionEnvelopeMarker(legacyExample), false);
  assert.equal(inspectExecutionEnvelope(legacyExample).status, "missing");
}
assert.equal(inspectExecutionEnvelope("  Execution Envelope:\n  not-a-json-fence\n").status, "malformed");

const outerFencedExampleResponse = `${responseMarkdown}\n\`\`\`\`markdown\n${renderExecutionEnvelopeBlock(envelope)}\`\`\`\`\n`;
const outerFencedExampleSidecar = buildExecutionEnvelopeRecord({
  emissionClass: "sidecar",
  authority: sidecar.authority,
  binding,
  envelope,
  responseMarkdown: outerFencedExampleResponse,
  controlInputSha256: digest("d"),
});
assert.equal(hasExecutionEnvelopeMarker(outerFencedExampleResponse), false);
assert.equal(inspectExecutionEnvelope(outerFencedExampleResponse).status, "missing");
assert.equal(inspectExecutionEnvelopeRecordEmission(outerFencedExampleResponse, outerFencedExampleSidecar, { schemaPath }).status, "valid");

const indentedLegacyMarkerResponse = `${responseMarkdown}\n  Execution Envelope:\n  \`\`\`json\n{}\n  \`\`\`\n`;
const indentedLegacyMarkerSidecar = buildExecutionEnvelopeRecord({
  emissionClass: "sidecar",
  authority: sidecar.authority,
  binding,
  envelope,
  responseMarkdown: indentedLegacyMarkerResponse,
  controlInputSha256: digest("d"),
});
assert.deepEqual(validateExecutionEnvelopeRecord(indentedLegacyMarkerSidecar, { schemaPath }), []);
assert.match(
  inspectExecutionEnvelopeRecordEmission(indentedLegacyMarkerResponse, indentedLegacyMarkerSidecar, { schemaPath }).errors.join("\n"),
  /must not serialize an Execution Envelope/u,
);

const inline = buildExecutionEnvelopeRecord({
  emissionClass: "inline_required",
  authority: {
    owner: "runner",
    fixed_fields_source: "compact_profile",
    dynamic_fields_source: "runner_observation",
  },
  binding: { ...binding, entry_id: "skill-handoff.md", mode: "handoff", profile_id: "ask.codex.handoff.compact" },
  envelope: {
    ...envelope,
    route: {
      ...envelope.route,
      work_mode: "ドキュメント整理",
      internal: { primary: "handoff-generation" },
    },
    stop_reason: {
      status: "insufficient_evidence",
      details: ["external runtime result unavailable"],
      human_decision_required: [],
      stop_if: ["required runtime result remains unavailable"],
    },
    next_action: "resume after capturing the runtime result",
  },
  responseMarkdown: "Task:\n- continue the bounded task\n",
  controlInputSha256: null,
});
const inlineOutput = renderExecutionEnvelopeProjection("Task:\n- continue the bounded task\n", inline);
assert.equal((inlineOutput.match(/Execution Envelope:/gu) ?? []).length, 1);
assert.equal(inspectExecutionEnvelopeRecordEmission(inlineOutput, inline, { schemaPath }).status, "valid");
assert.equal(inspectExecutionEnvelopeRecordEmission(`${inlineOutput}\n \t\n`, inline, { schemaPath }).status, "valid");
const unboundTrailingProse = inspectExecutionEnvelopeRecordEmission(`${inlineOutput}UNBOUND TRAILING PROSE\n`, inline, { schemaPath });
assert.equal(unboundTrailingProse.status, "invalid");
assert.match(unboundTrailingProse.errors.join("\n"), /non-whitespace after the inline Execution Envelope/u);
const indentedInlineOutput = `Task:\n- continue the bounded task\n\n${indentBlock(renderExecutionEnvelopeBlock(inline.envelope), 2)}`;
assert.equal(inspectExecutionEnvelopeRecordEmission(indentedInlineOutput, inline, { schemaPath }).status, "valid");

const duplicate = `${inlineOutput}\n${inlineOutput.slice(inlineOutput.indexOf("Execution Envelope:"))}`;
assert.equal(inspectExecutionEnvelopeRecordEmission(duplicate, inline, { schemaPath }).status, "invalid");

const proseCannotReplaceControl = `${responseMarkdown}\nTests passed. Approved. Ready. Safe. No missing evidence.\n`;
assert.equal(inspectExecutionEnvelopeRecordEmission(proseCannotReplaceControl, sidecar, { schemaPath }).status, "invalid");

const staleBinding = structuredClone(sidecar);
staleBinding.binding.profile_fingerprint = digest("e");
assert.match(validateExecutionEnvelopeRecord(staleBinding, { schemaPath }).join("\n"), /record_id|binding/u);

const staleResponse = structuredClone(sidecar);
staleResponse.response_sha256 = digest("f");
assert.match(validateExecutionEnvelopeRecord(staleResponse, { schemaPath }).join("\n"), /record_id|response_sha256/u);

const disagreement = inlineOutput.replace("resume after capturing the runtime result", "ignore the bound next action");
assert.match(inspectExecutionEnvelopeRecordEmission(disagreement, inline, { schemaPath }).errors.join("\n"), /disagree/u);

const invalidRecord = structuredClone(sidecar);
invalidRecord.envelope.next_action = "";
assert.match(validateExecutionEnvelopeRecord(invalidRecord, { schemaPath }).join("\n"), /next_action|record_id/u);

const mismatchedEntryMode = buildExecutionEnvelopeRecord({
  emissionClass: "sidecar",
  authority: sidecar.authority,
  binding: { ...binding, entry_id: "skill-review.md" },
  envelope,
  responseMarkdown,
  controlInputSha256: digest("d"),
});
assert.match(validateExecutionEnvelopeRecord(mismatchedEntryMode, { schemaPath }).join("\n"), /binding\.mode/u);

const missingStructuredInputDigest = buildExecutionEnvelopeRecord({
  emissionClass: "sidecar",
  authority: sidecar.authority,
  binding,
  envelope,
  responseMarkdown,
  controlInputSha256: null,
});
assert.match(validateExecutionEnvelopeRecord(missingStructuredInputDigest, { schemaPath }).join("\n"), /control_input_sha256/u);

const hiddenHumanDecision = buildExecutionEnvelopeRecord({
  emissionClass: "sidecar",
  authority: sidecar.authority,
  binding,
  envelope: {
    ...envelope,
    stop_reason: { ...envelope.stop_reason, human_decision_required: ["choose the release authority"] },
  },
  responseMarkdown,
  controlInputSha256: digest("d"),
});
assert.match(validateExecutionEnvelopeRecord(hiddenHumanDecision, { schemaPath }).join("\n"), /blocking details/u);

console.log("Execution Envelope record tests passed");
