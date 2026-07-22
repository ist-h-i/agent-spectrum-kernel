#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  COMMAND_EVIDENCE_PARSER_REVISION,
  MAX_COMMAND_EVENT_LINE_BYTES,
  buildCodexCommandEvidence,
  buildUnavailableCommandEvidence,
  commandInvocationDigest,
  computeCommandContractDigest,
  computeVerificationCommandContractDigest,
  projectVerifiedCommandEvidence,
  validateCommandEvidenceManifest,
  validateVerificationCommandContract,
} from "./ask-benchmark-command-evidence.mjs";

const root = new URL("..", import.meta.url).pathname;
const digest = (character) => `sha256:${character.repeat(64)}`;

function command(command_id, safe_argv, requirement = "required", alternative_group_id = null) {
  const base = {
    command_id,
    purpose: "test",
    working_directory: ".",
    safe_argv,
    execution_form: "direct_argv",
    requirement,
    alternative_group_id,
    timeout_ms: 60_000,
  };
  return { ...base, command_contract_digest: computeCommandContractDigest(base) };
}

function contract(commands = [command("focused-test", ["node", "workspace/test.mjs"])]) {
  const base = {
    schema_version: "1.0.0",
    schema_path: "benchmarks/schemas/portfolio-verification-command-contract.schema.json",
    program: "adaptive_ask_verification_command_contract",
    fixture_id: "synthetic-command-evidence",
    fixture_input_digest: digest("a"),
    commands,
  };
  return { ...base, contract_digest: computeVerificationCommandContractDigest(base) };
}

const identity = {
  run_instance_id: "12345678-1234-4123-8123-123456789abc",
  case_id: "case-1111111111111111-2222222222222222",
  attempt: "0001",
  adapter: "codex",
  condition: "plain",
  fixture_id: "synthetic-command-evidence",
  repetition: 1,
  fixture_input_digest: digest("a"),
  verification_command_contract_digest: null,
  runtime_identity_digest: digest("b"),
  effective_command_digest: digest("c"),
};

function stream(events) {
  return Buffer.from(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
}

function commandEvents(overrides = {}) {
  const id = overrides.id ?? "runtime-item-1";
  const rawCommand = overrides.command ?? "node workspace/test.mjs";
  const started = { type: "item.started", item: { id, type: "command_execution", command: rawCommand, cwd: ".", status: "in_progress" } };
  const completed = { type: "item.completed", item: { id, type: "command_execution", command: rawCommand, cwd: ".", status: "completed", exit_code: 0, aggregated_output: "focused pass\n", ...overrides.completed } };
  return [started, completed, { type: "turn.completed" }];
}

function expectFailure(label, action, pattern) {
  assert.throws(action, pattern, label);
}

const authority = validateVerificationCommandContract(contract(), { root });
assert.equal(commandInvocationDigest(authority.commands[0].safe_argv), commandInvocationDigest(["node", "workspace/test.mjs"]));
const executed = buildCodexCommandEvidence({ identity: { ...identity, verification_command_contract_digest: authority.contract_digest }, stream: stream(commandEvents()), contract: authority });
validateCommandEvidenceManifest(executed, { root, contract: authority });
const projection = projectVerifiedCommandEvidence({ manifest: executed, contract: authority });
assert.deepEqual(projection.required_command_ids, ["focused-test"]);
assert.deepEqual(projection.attempted_command_ids, ["focused-test"]);
assert.deepEqual(projection.succeeded_command_ids, ["focused-test"]);
assert.deepEqual(projection.failed_command_ids, []);
assert.deepEqual(projection.unavailable_command_ids, []);
assert.equal(projection.references.length, 1);
assert.equal(JSON.stringify(executed).includes("focused pass"), false, "raw command output must not be durable");
assert.equal(JSON.stringify(executed).includes("node workspace/test.mjs"), false, "raw command must not be durable");

const unavailable = buildUnavailableCommandEvidence({
  identity: { ...identity, adapter: "claude", verification_command_contract_digest: authority.contract_digest },
  support: "unsupported",
  probe: "adapter_event_contract_not_implemented",
  reason: "adapter_event_contract_not_implemented",
});
validateCommandEvidenceManifest(unavailable, { root, contract: authority });
const unavailableProjection = projectVerifiedCommandEvidence({ manifest: unavailable, contract: authority });
assert.deepEqual(unavailableProjection.succeeded_command_ids, []);
assert.deepEqual(unavailableProjection.unavailable_command_ids, ["focused-test"]);

expectFailure("duplicate command ID", () => validateVerificationCommandContract(contract([
  command("focused-test", ["node", "workspace/test.mjs"]),
  command("focused-test", ["node", "workspace/other.mjs"]),
]), { root }), /duplicate/u);
expectFailure("duplicate command digest", () => {
  const first = command("first", ["node", "workspace/test.mjs"]);
  const second = { ...first, command_id: "second" };
  return validateVerificationCommandContract(contract([first, second]), { root });
}, /digest|duplicate/u);
expectFailure("ambiguous alternative", () => validateVerificationCommandContract(contract([
  command("alternative-one", ["node", "workspace/test.mjs"], "alternative", "test-group"),
]), { root }), /ambiguous/u);
expectFailure("environment assignment", () => validateVerificationCommandContract(contract([
  command("unsafe-env", ["TOKEN=value", "node"]),
]), { root }), /Schema|unsafe/u);
expectFailure("absolute argv", () => validateVerificationCommandContract(contract([
  command("unsafe-path", ["/usr/bin/node", "workspace/test.mjs"]),
]), { root }), /Schema|unsafe/u);

expectFailure("duplicate event ID", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream([
  ...commandEvents().slice(0, 2),
  ...commandEvents().slice(0, 2),
  { type: "turn.completed" },
]) }), /duplicate/u);
expectFailure("completed without started", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream(commandEvents().slice(1)) }), /without.*started/u);
expectFailure("started without completed", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream([commandEvents()[0], { type: "turn.completed" }]) }), /without.*completed/u);
expectFailure("missing exit code", () => {
  const events = commandEvents(); delete events[1].item.exit_code;
  return buildCodexCommandEvidence({ identity, contract: authority, stream: stream(events) });
}, /exit code/u);
expectFailure("success/nonzero contradiction", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream(commandEvents({ completed: { exit_code: 4 } })) }), /contradicts/u);
expectFailure("failure/zero contradiction", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream(commandEvents({ completed: { status: "failed", exit_code: 0 } })) }), /contradicts/u);
expectFailure("malformed JSONL", () => buildCodexCommandEvidence({ identity, contract: authority, stream: Buffer.from("{bad}\n") }), /malformed/u);
expectFailure("stream truncation", () => buildCodexCommandEvidence({ identity, contract: authority, stream: Buffer.from(JSON.stringify(commandEvents()[0])) }), /truncated/u);
expectFailure("missing terminal turn", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream(commandEvents().slice(0, 2)) }), /terminal turn/u);
expectFailure("stream lag", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream([{ type: "error", message: "stream lag dropped event" }]) }), /integrity/u);
expectFailure("oversized event line", () => buildCodexCommandEvidence({ identity, contract: authority, stream: Buffer.from(`${" ".repeat(MAX_COMMAND_EVENT_LINE_BYTES + 1)}\n`) }), /byte limit/u);
expectFailure("absolute private path", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream(commandEvents({ command: "node /Users/example/test.mjs" })) }), /safely classified/u);
expectFailure("ambiguous shell spacing", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream(commandEvents({ command: "node  workspace/test.mjs" })) }), /exact direct-argv/u);
expectFailure("secret assignment", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream(commandEvents({ command: "TOKEN=value node workspace/test.mjs" })) }), /safely classified/u);
expectFailure("unsupported event revision", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream([{ type: "thread.completed" }]) }), /terminal turn/u);

const driftedManifest = structuredClone(executed);
driftedManifest.commands[0].exit_code = 9;
expectFailure("command evidence digest drift", () => validateCommandEvidenceManifest(driftedManifest, { root, contract: authority }), /identity|digest/u);
const successFromUnavailable = structuredClone(unavailable);
successFromUnavailable.capture.evidence_level = "executed";
expectFailure("unavailable changed to success", () => validateCommandEvidenceManifest(successFromUnavailable, { root, contract: authority }), /digest|supported/u);
assert.equal(COMMAND_EVIDENCE_PARSER_REVISION, "1.0.0");

console.log("ASK benchmark command evidence contract tests passed");
