#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  COMMAND_EVIDENCE_PARSER_REVISION,
  MAX_COMMAND_EVENT_LINE_BYTES,
  buildCodexCommandEvidence,
  buildUnavailableCommandEvidence,
  computeCommandContractDigest,
  computeVerificationCommandContractDigest,
  logicalCommandDigest,
  projectVerifiedCommandEvidence,
  renderCommandEvent,
  renderedEventCommandDigest,
  validateCommandEvidenceManifest,
  validateVerificationCommandContract,
} from "./ask-benchmark-command-evidence.mjs";
import { validateBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { validateNormalizedCommandEvidence } from "./ask-benchmark-normalized-results.mjs";

const root = new URL("..", import.meta.url).pathname;
const digest = (character) => `sha256:${character.repeat(64)}`;
const workspaceRoot = mkdtempSync(resolve(tmpdir(), "ask-command-evidence-workspace-"));
mkdirSync(resolve(workspaceRoot, "workspace", "subdir"), { recursive: true });
mkdirSync(resolve(workspaceRoot, "sibling"));
symlinkSync(resolve(workspaceRoot, "workspace", "subdir"), resolve(workspaceRoot, "workspace", "linked-subdir"));

function shellCommand(command_id, canonical_script, requirement = "required", alternative_group_id = null, working_directory = ".") {
  const base = {
    command_id,
    purpose: "test",
    working_directory,
    safe_argv: null,
    execution_form: "codex_shell_command",
    shell_family: "posix_bash",
    shell_envelope: { executable: "/bin/bash", arguments: ["-lc"] },
    canonical_script,
    requirement,
    alternative_group_id,
    timeout_ms: 60_000,
  };
  base.logical_command_digest = logicalCommandDigest(base);
  base.rendered_event_command_digest = renderedEventCommandDigest(base);
  return { ...base, command_contract_digest: computeCommandContractDigest(base) };
}

function directCommand(command_id, safe_argv) {
  const base = {
    command_id,
    purpose: "test",
    working_directory: ".",
    safe_argv,
    execution_form: "direct_argv",
    shell_family: null,
    shell_envelope: null,
    canonical_script: null,
    requirement: "optional",
    alternative_group_id: null,
    timeout_ms: 60_000,
  };
  base.logical_command_digest = logicalCommandDigest(base);
  base.rendered_event_command_digest = renderedEventCommandDigest(base);
  return { ...base, command_contract_digest: computeCommandContractDigest(base) };
}

function contract(commands = [shellCommand("focused-test", "node workspace/test.mjs")]) {
  const base = {
    schema_version: "1.1.0",
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

function commandPair({ id = "runtime-item-1", command, cwd = ".", status = "completed", exit_code = 0, output = "focused pass\n", completed = {} }) {
  return [
    { type: "item.started", item: { id, type: "command_execution", command, cwd, status: "in_progress" } },
    { type: "item.completed", item: { id, type: "command_execution", command, cwd, status, exit_code, aggregated_output: output, ...completed } },
  ];
}

function commandStream(pairs) {
  return stream([...pairs.flat(), { type: "turn.completed" }]);
}

function build(authority, pairs, options = {}) {
  return buildCodexCommandEvidence({
    identity: { ...identity, verification_command_contract_digest: authority.contract_digest },
    stream: commandStream(pairs),
    contract: authority,
    workspaceRoot: options.workspaceRoot ?? workspaceRoot,
  });
}

function expectFailure(label, action, pattern) {
  assert.throws(action, pattern, label);
}

try {
  const authority = validateVerificationCommandContract(contract(), { root });
  const rendered = renderCommandEvent(authority.commands[0]);
  assert.equal(rendered, "/bin/bash -lc 'node workspace/test.mjs'");
  const executed = build(authority, [commandPair({ command: rendered, cwd: workspaceRoot })]);
  validateCommandEvidenceManifest(executed, { root, contract: authority });
  const projection = projectVerifiedCommandEvidence({ manifest: executed, contract: authority });
  assert.deepEqual(projection.required_command_ids, ["focused-test"]);
  assert.deepEqual(projection.attempted_command_ids, ["focused-test"]);
  assert.deepEqual(projection.succeeded_command_ids, ["focused-test"]);
  assert.deepEqual(projection.failed_command_ids, []);
  assert.deepEqual(projection.unavailable_command_ids, []);
  assert.deepEqual(projection.required_alternative_groups, []);
  assert.deepEqual(projection.command_summaries, [{ command_id: "focused-test", execution_count: 1, latest_outcome: "succeeded", any_success: true, any_failure: false }]);
  assert.equal(projection.references.length, 1);
  assert.equal(JSON.stringify(executed).includes("focused pass"), false, "raw command output must not be durable");
  assert.equal(JSON.stringify(executed).includes(rendered), false, "raw shell command must not be durable");
  assert.equal(JSON.stringify(executed).includes(workspaceRoot), false, "absolute workspace path must not be durable");

  for (const script of [
    "node workspace/test.mjs",
    "node 'workspace/quoted.mjs'",
    "node 'workspace/file with spaces.mjs'",
    "node \"workspace/file's.mjs\"",
    "node workspace/test.mjs && node workspace/verify.mjs",
  ]) {
    const command = shellCommand(`shape-${script.length}`, script);
    const shapedAuthority = validateVerificationCommandContract(contract([command]), { root });
    const evidence = build(shapedAuthority, [commandPair({ command: renderCommandEvent(command) })]);
    assert.equal(evidence.commands[0].match_state, "matched", `shell-rendered command must close exactly: ${script}`);
  }

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
  validateCommandEvidenceManifest(buildUnavailableCommandEvidence({
    identity: { ...identity, verification_command_contract_digest: authority.contract_digest },
    support: "supported",
    probe: "runtime_unavailable",
    reason: "runtime_unavailable",
  }), { root, contract: authority });

  expectFailure("duplicate command ID", () => validateVerificationCommandContract(contract([
    shellCommand("focused-test", "node workspace/test.mjs"),
    shellCommand("focused-test", "node workspace/other.mjs"),
  ]), { root }), /duplicate/u);
  expectFailure("duplicate command digest", () => {
    const first = shellCommand("first", "node workspace/test.mjs");
    const second = { ...first, command_id: "second" };
    return validateVerificationCommandContract(contract([first, second]), { root });
  }, /digest|duplicate/u);
  expectFailure("ambiguous alternative", () => validateVerificationCommandContract(contract([
    shellCommand("alternative-one", "node workspace/test.mjs", "alternative", "test-group"),
  ]), { root }), /ambiguous/u);
  expectFailure("environment assignment in public script", () => validateVerificationCommandContract(contract([
    shellCommand("unsafe-env", "TOKEN=value node workspace/test.mjs"),
  ]), { root }), /unsafe/u);
  expectFailure("absolute path in public script", () => validateVerificationCommandContract(contract([
    shellCommand("unsafe-path", "node /usr/local/test.mjs"),
  ]), { root }), /unsafe/u);
  expectFailure("arbitrary absolute path in public script", () => validateVerificationCommandContract(contract([
    shellCommand("unsafe-arbitrary-path", "node /workspace/test.mjs"),
  ]), { root }), /unsafe/u);
  const commandContractSchemaPath = resolve(root, "benchmarks/schemas/portfolio-verification-command-contract.schema.json");
  const schemaAlternativeWithoutGroup = contract([shellCommand("schema-alternative", "node workspace/test.mjs", "alternative", null)]);
  assert.ok(validateBenchmarkSchemaInstance(schemaAlternativeWithoutGroup, { schemaPath: commandContractSchemaPath }).some((error) => /alternative_group_id/u.test(error)), "Schema must require a group ID for alternative commands");
  const schemaRequiredWithGroup = contract([shellCommand("schema-required", "node workspace/test.mjs", "required", "forbidden-group")]);
  assert.ok(validateBenchmarkSchemaInstance(schemaRequiredWithGroup, { schemaPath: commandContractSchemaPath }).some((error) => /alternative_group_id/u.test(error)), "Schema must forbid a group ID for non-alternative commands");
  validateVerificationCommandContract(contract([directCommand("portable-direct", ["node", "workspace/test.mjs"])]), { root });

  expectFailure("shell envelope drift", () => build(authority, [commandPair({ command: "/bin/bash -c 'node workspace/test.mjs'" })]), /unsupported shell/u);
  expectFailure("shell executable drift", () => build(authority, [commandPair({ command: "/bin/sh -lc 'node workspace/test.mjs'" })]), /unsupported shell/u);
  expectFailure("malformed shell quote", () => build(authority, [commandPair({ command: "/bin/bash -lc 'node workspace/test.mjs" })]), /malformed quoting/u);
  expectFailure("unsupported platform shell", () => build(authority, [commandPair({ command: "cmd.exe /c node workspace/test.mjs" })]), /unsupported shell/u);
  expectFailure("absolute path in runtime script", () => build(authority, [commandPair({ command: "/bin/bash -lc 'node /Users/example/test.mjs'" })]), /safely classified/u);
  expectFailure("arbitrary absolute path in runtime script", () => build(authority, [commandPair({ command: "/bin/bash -lc 'node /workspace/test.mjs'" })]), /safely classified/u);
  expectFailure("environment assignment in runtime script", () => build(authority, [commandPair({ command: "/bin/bash -lc 'TOKEN=value node workspace/test.mjs'" })]), /safely classified/u);
  const differentScript = build(authority, [commandPair({ command: "/bin/bash -lc 'node workspace/other.mjs'" })]);
  assert.equal(differentScript.commands[0].match_state, "unmatched", "different safe public script must not match by inference");

  const subdirAuthority = validateVerificationCommandContract(contract([shellCommand("subdir-test", "node test.mjs", "required", null, "workspace/subdir")]), { root });
  const subdirRendered = renderCommandEvent(subdirAuthority.commands[0]);
  const subdirEvidence = build(subdirAuthority, [commandPair({ command: subdirRendered, cwd: resolve(workspaceRoot, "workspace", "subdir") })]);
  assert.equal(subdirEvidence.commands[0].match_state, "matched", "absolute ephemeral cwd must normalize to public relative authority");
  expectFailure("contract root runtime subdirectory", () => build(authority, [commandPair({ command: rendered, cwd: resolve(workspaceRoot, "workspace", "subdir") })]), /working directory.*authority/u);
  expectFailure("contract subdirectory runtime root", () => build(subdirAuthority, [commandPair({ command: subdirRendered, cwd: workspaceRoot })]), /working directory.*authority/u);
  expectFailure("sibling directory", () => build(subdirAuthority, [commandPair({ command: subdirRendered, cwd: resolve(workspaceRoot, "sibling") })]), /working directory.*authority/u);
  expectFailure("workspace escape", () => build(authority, [commandPair({ command: rendered, cwd: resolve(workspaceRoot, "..") })]), /escapes the workspace/u);
  expectFailure("absolute external directory", () => build(authority, [commandPair({ command: rendered, cwd: tmpdir() })]), /escapes the workspace/u);
  expectFailure("symlinked subdirectory", () => build(subdirAuthority, [commandPair({ command: subdirRendered, cwd: resolve(workspaceRoot, "workspace", "linked-subdir") })]), /symlinked|canonical/u);
  expectFailure("started completed cwd drift", () => buildCodexCommandEvidence({
    identity: { ...identity, verification_command_contract_digest: authority.contract_digest },
    contract: authority,
    workspaceRoot,
    stream: stream([
      { type: "item.started", item: { id: "cwd-drift", type: "command_execution", command: rendered, cwd: "." } },
      { type: "item.completed", item: { id: "cwd-drift", type: "command_execution", command: rendered, cwd: "workspace/subdir", status: "completed", exit_code: 0, aggregated_output: "" } },
      { type: "turn.completed" },
    ]),
  }), /working directory changed/u);

  const repeatPair = (id, status = "completed", exitCode = 0) => commandPair({ id, command: rendered, status, exit_code: exitCode });
  const twice = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-1"), repeatPair("repeat-2")]), contract: authority });
  assert.equal(twice.references.length, 2);
  assert.deepEqual(twice.attempted_command_ids, ["focused-test"]);
  assert.deepEqual(twice.command_summaries[0], { command_id: "focused-test", execution_count: 2, latest_outcome: "succeeded", any_success: true, any_failure: false });
  const failThenSuccess = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-fail", "failed", 2), repeatPair("repeat-success")]), contract: authority });
  assert.deepEqual(failThenSuccess.succeeded_command_ids, ["focused-test"]);
  assert.deepEqual(failThenSuccess.failed_command_ids, []);
  assert.deepEqual(failThenSuccess.command_summaries[0], { command_id: "focused-test", execution_count: 2, latest_outcome: "succeeded", any_success: true, any_failure: true });
  const successThenFail = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-success"), repeatPair("repeat-fail", "failed", 2)]), contract: authority });
  assert.deepEqual(successThenFail.succeeded_command_ids, []);
  assert.deepEqual(successThenFail.failed_command_ids, ["focused-test"]);
  assert.equal(successThenFail.command_summaries[0].latest_outcome, "failed");
  const three = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-a"), repeatPair("repeat-b"), repeatPair("repeat-c")]), contract: authority });
  assert.equal(three.references.length, 3);
  assert.equal(three.command_summaries[0].execution_count, 3);

  const alternatives = validateVerificationCommandContract(contract([
    shellCommand("alternative-a", "node workspace/a.mjs", "alternative", "test-group"),
    shellCommand("alternative-b", "node workspace/b.mjs", "alternative", "test-group"),
    shellCommand("optional-only", "node workspace/optional.mjs", "optional"),
  ]), { root });
  const alternativeA = alternatives.commands[0];
  const optional = alternatives.commands[2];
  const satisfiedGroup = projectVerifiedCommandEvidence({ manifest: build(alternatives, [commandPair({ command: renderCommandEvent(alternativeA) })]), contract: alternatives });
  validateNormalizedCommandEvidence(satisfiedGroup);
  assert.deepEqual(satisfiedGroup.required_command_ids, []);
  assert.deepEqual(satisfiedGroup.required_alternative_groups, [{ group_id: "test-group", member_ids: ["alternative-a", "alternative-b"], attempted_ids: ["alternative-a"], succeeded_ids: ["alternative-a"], satisfaction_state: "satisfied" }]);
  const optionalOnly = projectVerifiedCommandEvidence({ manifest: build(alternatives, [commandPair({ command: renderCommandEvent(optional) })]), contract: alternatives });
  assert.equal(optionalOnly.required_alternative_groups[0].satisfaction_state, "unsatisfied");
  validateNormalizedCommandEvidence(optionalOnly);
  const failedAlternative = projectVerifiedCommandEvidence({ manifest: build(alternatives, [commandPair({ command: renderCommandEvent(alternativeA), status: "failed", exit_code: 3 })]), contract: alternatives });
  assert.equal(failedAlternative.required_alternative_groups[0].satisfaction_state, "unsatisfied");
  const unavailableAlternatives = projectVerifiedCommandEvidence({ manifest: buildUnavailableCommandEvidence({ identity: { ...identity, verification_command_contract_digest: alternatives.contract_digest }, support: "supported", probe: "command_contract_unavailable", reason: "command_contract_unavailable" }), contract: alternatives });
  assert.equal(unavailableAlternatives.required_alternative_groups[0].satisfaction_state, "unavailable");
  validateNormalizedCommandEvidence(unavailableAlternatives);

  const unmatchedAlternative = projectVerifiedCommandEvidence({ manifest: build(alternatives, [commandPair({ command: "/bin/bash -lc 'node workspace/unmatched.mjs'" })]), contract: alternatives });
  assert.equal(unmatchedAlternative.unmatched_command_count, 1);
  assert.equal(unmatchedAlternative.required_alternative_groups[0].satisfaction_state, "unsatisfied");
  validateNormalizedCommandEvidence(unmatchedAlternative);
  const undeclaredReference = structuredClone(satisfiedGroup);
  undeclaredReference.references[0].command_id = "undeclared-command";
  expectFailure("undeclared normalized command", () => validateNormalizedCommandEvidence(undeclaredReference), /attempted command inventory/u);
  const transplantedGroupMember = structuredClone(satisfiedGroup);
  transplantedGroupMember.required_alternative_groups[0].succeeded_ids = ["optional-only"];
  expectFailure("transplanted alternative member", () => validateNormalizedCommandEvidence(transplantedGroupMember), /group inventory/u);
  const unavailablePromoted = structuredClone(unavailableAlternatives);
  unavailablePromoted.required_alternative_groups[0].satisfaction_state = "satisfied";
  expectFailure("unavailable alternative promoted to success", () => validateNormalizedCommandEvidence(unavailablePromoted), /group satisfaction/u);

  expectFailure("item-level stream loss", () => buildCodexCommandEvidence({
    identity: { ...identity, verification_command_contract_digest: authority.contract_digest },
    contract: authority,
    workspaceRoot,
    stream: stream([
      ...commandPair({ command: rendered }),
      { type: "item.completed", item: { id: "item-error", type: "error", message: "event stream lagged; dropped events" } },
      { type: "turn.completed" },
    ]),
  }), /integrity failure/u);
  expectFailure("unknown item-level error", () => buildCodexCommandEvidence({
    identity: { ...identity, verification_command_contract_digest: authority.contract_digest },
    contract: authority,
    workspaceRoot,
    stream: stream([{ type: "item.completed", item: { id: "item-error", type: "error", message: "unknown runtime error" } }, { type: "turn.completed" }]),
  }), /unclassified error/u);

  expectFailure("duplicate event ID", () => build(authority, [repeatPair("duplicate"), repeatPair("duplicate")]), /duplicate/u);
  expectFailure("completed without started", () => buildCodexCommandEvidence({ identity, contract: authority, workspaceRoot, stream: stream([...commandPair({ command: rendered }).slice(1), { type: "turn.completed" }]) }), /without.*started/u);
  expectFailure("started without completed", () => buildCodexCommandEvidence({ identity, contract: authority, workspaceRoot, stream: stream([commandPair({ command: rendered })[0], { type: "turn.completed" }]) }), /without.*completed/u);
  expectFailure("missing exit code", () => build(authority, [commandPair({ command: rendered, completed: { exit_code: undefined } })]), /exit code/u);
  expectFailure("success/nonzero contradiction", () => build(authority, [commandPair({ command: rendered, exit_code: 4 })]), /contradicts/u);
  expectFailure("failure/zero contradiction", () => build(authority, [commandPair({ command: rendered, status: "failed", exit_code: 0 })]), /contradicts/u);
  expectFailure("malformed JSONL", () => buildCodexCommandEvidence({ identity, contract: authority, stream: Buffer.from("{bad}\n") }), /malformed/u);
  expectFailure("stream truncation", () => buildCodexCommandEvidence({ identity, contract: authority, stream: Buffer.from(JSON.stringify(commandPair({ command: rendered })[0])) }), /truncated/u);
  expectFailure("missing terminal turn", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream(commandPair({ command: rendered })) }), /terminal turn/u);
  expectFailure("top-level stream lag", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream([{ type: "error", message: "stream lag dropped event" }]) }), /integrity/u);
  expectFailure("oversized event line", () => buildCodexCommandEvidence({ identity, contract: authority, stream: Buffer.from(`${" ".repeat(MAX_COMMAND_EVENT_LINE_BYTES + 1)}\n`) }), /byte limit/u);
  expectFailure("unsupported event revision", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream([{ type: "thread.completed" }]) }), /terminal turn/u);

  const driftedManifest = structuredClone(executed);
  driftedManifest.commands[0].exit_code = 9;
  expectFailure("command evidence digest drift", () => validateCommandEvidenceManifest(driftedManifest, { root, contract: authority }), /identity|digest/u);
  const successFromUnavailable = structuredClone(unavailable);
  successFromUnavailable.capture.evidence_level = "executed";
  expectFailure("unavailable changed to success", () => validateCommandEvidenceManifest(successFromUnavailable, { root, contract: authority }), /Schema|digest|capture/u);
  assert.equal(COMMAND_EVIDENCE_PARSER_REVISION, "1.1.0");

  console.log("ASK benchmark command evidence contract tests passed");
} finally {
  rmSync(workspaceRoot, { recursive: true, force: true });
}
