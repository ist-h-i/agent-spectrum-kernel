#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";

const root = new URL("..", import.meta.url).pathname;
const digest = (character) => `sha256:${character.repeat(64)}`;
const workspaceRoot = mkdtempSync(resolve(tmpdir(), "ask-command-evidence-workspace-"));
mkdirSync(resolve(workspaceRoot, "workspace", "subdir"), { recursive: true });
mkdirSync(resolve(workspaceRoot, "sibling"));
symlinkSync(resolve(workspaceRoot, "workspace", "subdir"), resolve(workspaceRoot, "workspace", "linked-subdir"));

function shellCommand(command_id, canonical_script, requirement = "required", alternative_group_id = null, working_directory = ".", evidence_requirement = "not_required") {
  const base = {
    command_id,
    purpose: "test",
    working_directory: { path: working_directory, evidence_requirement },
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
    working_directory: { path: ".", evidence_requirement: "not_required" },
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
    schema_version: "1.2.0",
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

function commandPair({ id = "runtime-item-1", command, cwd, status = "completed", exit_code = 0, output = "focused pass\n", completed = {} }) {
  const unknownCwd = cwd === undefined ? {} : { cwd };
  return [
    { type: "item.started", item: { id, type: "command_execution", command, status: "in_progress", ...unknownCwd } },
    { type: "item.completed", item: { id, type: "command_execution", command, status, exit_code, aggregated_output: output, ...unknownCwd, ...completed } },
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
  });
}

function expectFailure(label, action, pattern) {
  assert.throws(action, pattern, label);
}

function resealCommandEvidence(manifest, commandIndex, mutate) {
  const sealed = structuredClone(manifest);
  const current = sealed.commands[commandIndex];
  const { command_evidence_id: _id, command_evidence_digest: _digest, bytes: _bytes, ...base } = current;
  mutate(base);
  const identityFields = Object.fromEntries(["run_instance_id", "case_id", "attempt", "adapter", "condition", "fixture_id", "repetition", "fixture_input_digest", "verification_command_contract_digest", "runtime_identity_digest", "effective_command_digest"].map((field) => [field, sealed[field]]));
  const digestValue = canonicalDigest({ ...identityFields, ...base });
  const id = `command-evidence-${digestValue.slice("sha256:".length, "sha256:".length + 32)}`;
  sealed.commands[commandIndex] = { command_evidence_id: id, command_evidence_digest: digestValue, ...base };
  sealed.commands[commandIndex].bytes = Buffer.from(stableCanonicalJson(sealed.commands[commandIndex])).length;
  const { manifest_digest: _manifestDigest, ...manifestBase } = sealed;
  sealed.manifest_digest = canonicalDigest(manifestBase);
  return sealed;
}

try {
  const authority = validateVerificationCommandContract(contract(), { root });
  const rendered = renderCommandEvent(authority.commands[0]);
  assert.equal(rendered, "/bin/bash -lc 'node workspace/test.mjs'");
  const executed = build(authority, [commandPair({ command: rendered })]);
  validateCommandEvidenceManifest(executed, { root, contract: authority });
  const projection = projectVerifiedCommandEvidence({ manifest: executed, contract: authority });
  assert.deepEqual(projection.required_command_ids, ["focused-test"]);
  assert.deepEqual(projection.attempted_command_ids, ["focused-test"]);
  assert.deepEqual(projection.succeeded_command_ids, ["focused-test"]);
  assert.deepEqual(projection.failed_command_ids, []);
  assert.deepEqual(projection.unavailable_command_ids, []);
  assert.deepEqual(projection.required_alternative_groups, []);
  assert.deepEqual(projection.command_summaries, [{ command_id: "focused-test", execution_count: 1, latest_outcome: "succeeded", any_success: true, any_failure: false, any_declined: false }]);
  assert.equal(projection.references.length, 1);
  assert.equal(JSON.stringify(executed).includes("focused pass"), false, "raw command output must not be durable");
  assert.equal(JSON.stringify(executed).includes(rendered), false, "raw shell command must not be durable");
  assert.equal(JSON.stringify(executed).includes(workspaceRoot), false, "absolute workspace path must not be durable");
  assert.deepEqual(executed.commands[0].working_directory, { status: "unavailable", classification: null, value: null, digest: null, source: "codex_exec_jsonl_cwd_not_exposed" });

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

  const runtimeObservedCommand = shellCommand("cwd-dependent", "node workspace/test.mjs", "required", null, ".", "runtime_observed");
  const runtimeObservedAuthority = validateVerificationCommandContract(contract([runtimeObservedCommand]), { root });
  const runtimeObservedRendered = renderCommandEvent(runtimeObservedCommand);
  const cwdUnavailable = build(runtimeObservedAuthority, [commandPair({ command: runtimeObservedRendered })]);
  assert.equal(cwdUnavailable.commands[0].match_state, "cwd_unverified", "missing transport cwd must not be inferred as workspace root");
  assert.equal(cwdUnavailable.commands[0].matched_command_id, null);
  assert.deepEqual(projectVerifiedCommandEvidence({ manifest: cwdUnavailable, contract: runtimeObservedAuthority }).unavailable_command_ids, ["cwd-dependent"]);
  const fakeCwd = build(runtimeObservedAuthority, [commandPair({ command: runtimeObservedRendered, cwd: workspaceRoot })]);
  assert.equal(fakeCwd.commands[0].match_state, "cwd_unverified", "unknown fake cwd fields must not become production authority");
  const fakeSubdirectoryCwd = build(runtimeObservedAuthority, [commandPair({ command: runtimeObservedRendered, cwd: resolve(workspaceRoot, "workspace", "subdir") })]);
  assert.equal(fakeSubdirectoryCwd.commands[0].match_state, "cwd_unverified", "a root command observed from a fake subdirectory cwd must not gain inferred success");
  assert.equal(executed.commands[0].match_state, "matched", "only an explicit not_required contract may match without cwd evidence");
  const inferredCwd = resealCommandEvidence(cwdUnavailable, 0, (command) => {
    command.working_directory = { status: "observed", classification: "workspace_root", value: ".", digest: canonicalDigest({ classification: "workspace_root", path: "." }), source: "forged_runtime_cwd" };
    command.match_state = "matched";
    command.matched_command_id = "cwd-dependent";
  });
  expectFailure("re-sealed unavailable cwd promoted to workspace root", () => validateCommandEvidenceManifest(inferredCwd, { root, contract: runtimeObservedAuthority }), /Schema|authority/u);
  const promotedCwdProjection = projectVerifiedCommandEvidence({ manifest: cwdUnavailable, contract: runtimeObservedAuthority });
  promotedCwdProjection.succeeded_command_ids = ["cwd-dependent"];
  promotedCwdProjection.unavailable_command_ids = [];
  expectFailure("normalized cwd unavailable promoted to success", () => validateNormalizedCommandEvidence(promotedCwdProjection), /reference|inventory|summary/u);

  const repeatPair = (id, status = "completed", exitCode = 0) => commandPair({ id, command: rendered, status, exit_code: exitCode });
  const twice = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-1"), repeatPair("repeat-2")]), contract: authority });
  assert.equal(twice.references.length, 2);
  assert.deepEqual(twice.attempted_command_ids, ["focused-test"]);
  assert.deepEqual(twice.command_summaries[0], { command_id: "focused-test", execution_count: 2, latest_outcome: "succeeded", any_success: true, any_failure: false, any_declined: false });
  const failThenSuccess = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-fail", "failed", 2), repeatPair("repeat-success")]), contract: authority });
  assert.deepEqual(failThenSuccess.succeeded_command_ids, ["focused-test"]);
  assert.deepEqual(failThenSuccess.failed_command_ids, []);
  assert.deepEqual(failThenSuccess.command_summaries[0], { command_id: "focused-test", execution_count: 2, latest_outcome: "succeeded", any_success: true, any_failure: true, any_declined: false });
  const successThenFail = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-success"), repeatPair("repeat-fail", "failed", 2)]), contract: authority });
  assert.deepEqual(successThenFail.succeeded_command_ids, []);
  assert.deepEqual(successThenFail.failed_command_ids, ["focused-test"]);
  assert.equal(successThenFail.command_summaries[0].latest_outcome, "failed");
  const three = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-a"), repeatPair("repeat-b"), repeatPair("repeat-c")]), contract: authority });
  assert.equal(three.references.length, 3);
  assert.equal(three.command_summaries[0].execution_count, 3);

  const declinedOnly = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-declined", "declined", null)]), contract: authority });
  assert.deepEqual(declinedOnly.attempted_command_ids, ["focused-test"], "declined commands must remain observed attempts");
  assert.deepEqual(declinedOnly.succeeded_command_ids, []);
  assert.deepEqual(declinedOnly.failed_command_ids, []);
  assert.deepEqual(declinedOnly.declined_command_ids, ["focused-test"]);
  assert.equal(declinedOnly.declined_references.length, 1);
  assert.equal(declinedOnly.declined_references[0].outcome, "declined");
  assert.deepEqual(declinedOnly.command_summaries[0], { command_id: "focused-test", execution_count: 1, latest_outcome: "declined", any_success: false, any_failure: false, any_declined: true });
  validateNormalizedCommandEvidence(declinedOnly);
  const declinedWithoutExitCode = build(authority, [commandPair({ id: "declined-no-exit", command: rendered, status: "declined", completed: { exit_code: undefined } })]);
  assert.equal(declinedWithoutExitCode.commands[0].status, "declined");
  assert.equal(declinedWithoutExitCode.commands[0].exit_code, null, "an absent declined exit code must normalize to typed null");
  const successThenDeclined = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-success"), repeatPair("repeat-declined", "declined", null)]), contract: authority });
  assert.deepEqual(successThenDeclined.declined_command_ids, ["focused-test"]);
  assert.deepEqual(successThenDeclined.succeeded_command_ids, []);
  assert.deepEqual(successThenDeclined.command_summaries[0], { command_id: "focused-test", execution_count: 2, latest_outcome: "declined", any_success: true, any_failure: false, any_declined: true });
  const declinedThenSuccess = projectVerifiedCommandEvidence({ manifest: build(authority, [repeatPair("repeat-declined", "declined", null), repeatPair("repeat-success")]), contract: authority });
  assert.deepEqual(declinedThenSuccess.succeeded_command_ids, ["focused-test"]);
  assert.deepEqual(declinedThenSuccess.declined_command_ids, []);
  assert.deepEqual(declinedThenSuccess.command_summaries[0], { command_id: "focused-test", execution_count: 2, latest_outcome: "succeeded", any_success: true, any_failure: false, any_declined: true });
  expectFailure("declined with zero exit code", () => build(authority, [repeatPair("declined-zero", "declined", 0)]), /exit code|contradicts/u);
  expectFailure("declined with nonzero exit code", () => build(authority, [repeatPair("declined-nonzero", "declined", 7)]), /exit code|contradicts/u);
  expectFailure("in-progress terminal status", () => build(authority, [repeatPair("in-progress", "in_progress", null)]), /terminal|status/u);
  expectFailure("unknown terminal status", () => build(authority, [repeatPair("unknown", "cancelled", null)]), /terminal|status/u);
  const declinedPromoted = resealCommandEvidence(build(authority, [repeatPair("declined-promoted", "declined", null)]), 0, (command) => { command.status = "succeeded"; });
  expectFailure("declined evidence re-sealed as success", () => validateCommandEvidenceManifest(declinedPromoted, { root, contract: authority }), /Schema|exit code|contradicts/u);

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
  const declinedAlternative = projectVerifiedCommandEvidence({ manifest: build(alternatives, [commandPair({ command: renderCommandEvent(alternativeA), status: "declined", exit_code: null })]), contract: alternatives });
  assert.equal(declinedAlternative.required_alternative_groups[0].satisfaction_state, "unsatisfied");
  assert.deepEqual(declinedAlternative.required_alternative_groups[0].attempted_ids, ["alternative-a"]);
  assert.deepEqual(declinedAlternative.required_alternative_groups[0].succeeded_ids, []);
  const declinedThenAlternativeSuccess = projectVerifiedCommandEvidence({ manifest: build(alternatives, [
    commandPair({ id: "alternative-declined", command: renderCommandEvent(alternativeA), status: "declined", exit_code: null }),
    commandPair({ id: "alternative-success", command: renderCommandEvent(alternatives.commands[1]) }),
  ]), contract: alternatives });
  assert.equal(declinedThenAlternativeSuccess.required_alternative_groups[0].satisfaction_state, "satisfied");
  const optionalDeclined = projectVerifiedCommandEvidence({ manifest: build(alternatives, [commandPair({ command: renderCommandEvent(optional), status: "declined", exit_code: null })]), contract: alternatives });
  assert.deepEqual(optionalDeclined.declined_command_ids, ["optional-only"]);
  validateNormalizedCommandEvidence(optionalDeclined);
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
  const unsupportedPair = commandPair({ command: "/bin/zsh -lc 'node workspace/test.mjs'" });
  for (const [label, events, pattern] of [
    ["unsupported shell then dropped event", [...unsupportedPair, { type: "item.completed", item: { id: "item-error", type: "error", message: "event stream lagged; dropped events" } }, { type: "turn.completed" }], /integrity failure/u],
    ["unsupported shell then malformed JSON", null, /malformed JSONL/u],
    ["unsupported shell without terminal turn", unsupportedPair, /terminal turn/u],
    ["unsupported shell then duplicate item", [...unsupportedPair, ...commandPair({ id: "runtime-item-1", command: "/bin/zsh -lc 'node workspace/test.mjs'" }), { type: "turn.completed" }], /duplicate/u],
  ]) {
    const unsupportedStream = label.includes("malformed JSON")
      ? Buffer.from(`${unsupportedPair.map((event) => JSON.stringify(event)).join("\n")}\n{bad}\n`)
      : stream(events);
    expectFailure(label, () => buildCodexCommandEvidence({ identity: { ...identity, verification_command_contract_digest: authority.contract_digest }, contract: authority, stream: unsupportedStream }), pattern);
  }
  expectFailure("integrity error before unsupported shell", () => buildCodexCommandEvidence({
    identity: { ...identity, verification_command_contract_digest: authority.contract_digest },
    contract: authority,
    stream: stream([{ type: "item.completed", item: { id: "item-error", type: "error", message: "dropped event" } }, ...unsupportedPair, { type: "turn.completed" }]),
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
  expectFailure("turn failure", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream([{ type: "turn.failed", error: { message: "runtime turn failed" } }]) }), /turn failed/u);
  expectFailure("oversized event line", () => buildCodexCommandEvidence({ identity, contract: authority, stream: Buffer.from(`${" ".repeat(MAX_COMMAND_EVENT_LINE_BYTES + 1)}\n`) }), /byte limit/u);
  expectFailure("unsupported event revision", () => buildCodexCommandEvidence({ identity, contract: authority, stream: stream([{ type: "thread.completed" }]) }), /terminal turn/u);

  const driftedManifest = structuredClone(executed);
  driftedManifest.commands[0].exit_code = 9;
  expectFailure("command evidence digest drift", () => validateCommandEvidenceManifest(driftedManifest, { root, contract: authority }), /Schema|identity|digest/u);
  const successFromUnavailable = structuredClone(unavailable);
  successFromUnavailable.capture.evidence_level = "executed";
  expectFailure("unavailable changed to success", () => validateCommandEvidenceManifest(successFromUnavailable, { root, contract: authority }), /Schema|digest|capture/u);

  const stableReadRoot = resolve(realpathSync(workspaceRoot), "stable-command-evidence-races");
  mkdirSync(stableReadRoot);
  const stablePath = resolve(stableReadRoot, "command-evidence.json");
  const replacementPath = resolve(stableReadRoot, "replacement.json");
  writeFileSync(stablePath, "{\"value\":1}\n");
  writeFileSync(replacementPath, "{\"value\":2}\n");
  expectFailure("different-byte replacement after descriptor open", () => readStableFile(stablePath, "command evidence", 1024, { allowEmpty: false, afterOpen: () => renameSync(replacementPath, stablePath) }), /replaced|changed/u);
  writeFileSync(stablePath, "{\"value\":1}\n");
  writeFileSync(replacementPath, "{\"value\":1}\n");
  expectFailure("same-byte different-inode replacement after descriptor open", () => readStableFile(stablePath, "command evidence", 1024, { allowEmpty: false, afterOpen: () => renameSync(replacementPath, stablePath) }), /replaced|changed/u);

  const canonicalParent = resolve(stableReadRoot, "canonical-parent");
  const canonicalOriginal = resolve(stableReadRoot, "canonical-parent-original");
  const canonicalAlternate = resolve(stableReadRoot, "canonical-alternate");
  mkdirSync(canonicalParent);
  mkdirSync(canonicalAlternate);
  writeFileSync(resolve(canonicalParent, "command-evidence.json"), "{\"value\":1}\n");
  writeFileSync(resolve(canonicalAlternate, "command-evidence.json"), "{\"value\":1}\n");
  expectFailure("canonical parent replacement after descriptor open", () => readStableFile(resolve(canonicalParent, "command-evidence.json"), "command evidence", 1024, {
    allowEmpty: false,
    afterOpen: () => {
      renameSync(canonicalParent, canonicalOriginal);
      symlinkSync(canonicalAlternate, canonicalParent, "dir");
    },
  }), /replaced|canonical|changed/u);

  writeFileSync(stablePath, "{\"value\":3}\n");
  const stableBefore = readStableFile(stablePath, "command evidence", 1024, { allowEmpty: false, afterOpen: () => {} });
  const stableAfter = readStableFile(stablePath, "command evidence", 1024, { allowEmpty: false });
  assertStableFileEvidence(stableBefore, stableAfter, "command evidence");
  assert.equal(stableBefore.bytes.toString("utf8"), "{\"value\":3}\n", "stable verification must remain read-only");
  assert.equal(COMMAND_EVIDENCE_PARSER_REVISION, "1.3.0");

  console.log("ASK benchmark command evidence contract tests passed");
} finally {
  rmSync(workspaceRoot, { recursive: true, force: true });
}
