import { createHash } from "node:crypto";
import { posix, resolve, win32 } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

export const VERIFICATION_COMMAND_CONTRACT_SCHEMA_PATH = "benchmarks/schemas/portfolio-verification-command-contract.schema.json";
export const COMMAND_EVIDENCE_SCHEMA_PATH = "benchmarks/schemas/portfolio-command-evidence.schema.json";
export const CODEX_COMMAND_EVENT_FORMAT_REVISION = "codex-exec-jsonl-v1";
export const COMMAND_EVIDENCE_PARSER_REVISION = "1.2.0";
export const COMMAND_EVIDENCE_PATH = "command-evidence.json";
export const MAX_COMMAND_EVENT_STREAM_BYTES = 16 * 1024 * 1024;
export const MAX_COMMAND_EVENT_LINE_BYTES = 1024 * 1024;

const TERMINAL_ITEM_STATUSES = new Set(["completed", "failed"]);
const SHELL_PREFIX = "/bin/bash -lc ";
const STREAM_INTEGRITY_ERROR = /(?:drop(?:ped)?\s+event|event\s+(?:drop|loss)|stream\s+lag|lagged|backpressure|truncat|sequence\s+integrity|integrity\s+failure)/iu;
const SENSITIVE_VALUE = /(?:^|\s)(?:[A-Za-z_][A-Za-z0-9_]*=|\/Users\/|\/home\/|\/private\/|\/var\/folders\/|[A-Za-z]:[\\/]|file:\/\/|(?:token|secret|password|credential)[A-Za-z0-9_-]*=)/iu;
const UNSAFE_SCRIPT = /(?:^|[\s;&|(<"'])(?:[A-Za-z_][A-Za-z0-9_]*=|\/(?:[^/\s;&|()<>"']|$)|[A-Za-z]:[\\/]|file:\/\/|(?:token|secret|password|credential)[A-Za-z0-9_-]*=)/iu;

export class CommandEvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CommandEvidenceError";
    this.code = code;
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function withoutField(value, field) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function jsonBytes(value) {
  return Buffer.from(stableCanonicalJson(value));
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains a duplicate value`);
}

function assertSafeContractPath(value, label) {
  if (typeof value !== "string" || value.length === 0 || (value !== "." && (posix.isAbsolute(value) || win32.isAbsolute(value) || posix.normalize(value) !== value || value === ".." || value.startsWith("../") || value.includes("\\")))) {
    throw new Error(`${label} must be a portable workspace-relative path`);
  }
}

function assertSafeScript(script, label) {
  if (typeof script !== "string" || script.length === 0 || script.trim() !== script || UNSAFE_SCRIPT.test(script) || /(?:^|\/)\.\.(?:\/|$)/u.test(script)) throw new Error(`${label} is unsafe`);
}

function quotePosixShellWord(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function renderCommandEvent(command) {
  if (command.execution_form === "direct_argv") return command.safe_argv.join(" ");
  if (command.execution_form === "codex_shell_command" && command.shell_family === "posix_bash" && command.shell_envelope?.executable === "/bin/bash" && stableCanonicalJson(command.shell_envelope.arguments) === stableCanonicalJson(["-lc"])) {
    return `${SHELL_PREFIX}${quotePosixShellWord(command.canonical_script)}`;
  }
  throw new Error(`verification command ${command.command_id ?? "unknown"} has an unsupported execution form`);
}

export function logicalCommandDigest(command) {
  if (command.execution_form === "direct_argv") return canonicalDigest({ execution_form: command.execution_form, safe_argv: command.safe_argv });
  return canonicalDigest({ execution_form: command.execution_form, canonical_script: command.canonical_script });
}

export function renderedEventCommandDigest(command) {
  return sha256(Buffer.from(renderCommandEvent(command)));
}

export function commandInvocationDigest(safeArgv) {
  return canonicalDigest({ execution_form: "direct_argv", safe_argv: safeArgv });
}

export function computeCommandContractDigest(command) {
  return canonicalDigest(withoutField(command, "command_contract_digest"));
}

export function computeVerificationCommandContractDigest(contract) {
  return canonicalDigest(withoutField(contract, "contract_digest"));
}

export function validateVerificationCommandContract(contract, { root }) {
  assertBenchmarkSchemaInstance(contract, { schemaPath: resolve(root, VERIFICATION_COMMAND_CONTRACT_SCHEMA_PATH), label: "verification command contract" });
  if (contract.contract_digest !== computeVerificationCommandContractDigest(contract)) throw new Error("verification command contract digest mismatch");
  assertUnique(contract.commands.map(({ command_id: id }) => id), "verification command IDs");
  assertUnique(contract.commands.map(({ command_contract_digest: digest }) => digest), "verification command digests");
  const alternatives = new Map();
  for (const command of contract.commands) {
    assertSafeContractPath(command.working_directory.path, `verification command ${command.command_id} working directory`);
    if (command.execution_form === "direct_argv") {
      if (command.safe_argv.some((arg) => SENSITIVE_VALUE.test(arg) || posix.isAbsolute(arg) || win32.isAbsolute(arg) || arg.includes(".."))) throw new Error(`verification command ${command.command_id} contains an unsafe argv value`);
    } else {
      if (command.safe_argv !== null || command.shell_family !== "posix_bash" || command.shell_envelope?.executable !== "/bin/bash" || stableCanonicalJson(command.shell_envelope.arguments) !== stableCanonicalJson(["-lc"])) throw new Error(`verification command ${command.command_id} shell authority is invalid`);
      assertSafeScript(command.canonical_script, `verification command ${command.command_id} canonical script`);
    }
    if (command.logical_command_digest !== logicalCommandDigest(command)) throw new Error(`verification command ${command.command_id} logical command digest mismatch`);
    if (command.rendered_event_command_digest !== renderedEventCommandDigest(command)) throw new Error(`verification command ${command.command_id} rendered event digest mismatch`);
    if (command.command_contract_digest !== computeCommandContractDigest(command)) throw new Error(`verification command ${command.command_id} digest mismatch`);
    if (command.requirement === "alternative") {
      if (!command.alternative_group_id) throw new Error(`alternative verification command ${command.command_id} requires a group`);
      alternatives.set(command.alternative_group_id, [...(alternatives.get(command.alternative_group_id) ?? []), command.command_id]);
    } else if (command.alternative_group_id !== null) throw new Error(`non-alternative verification command ${command.command_id} must not declare a group`);
  }
  for (const [group, ids] of alternatives) if (ids.length < 2) throw new Error(`alternative group ${group} is ambiguous`);
  return structuredClone(contract);
}

function decodePosixSingleQuotedWord(value) {
  if (!value.startsWith("'") || !value.endsWith("'")) throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell command has malformed quoting");
  let output = "";
  let index = 1;
  const terminal = value.length - 1;
  while (index < terminal) {
    if (value[index] !== "'") {
      output += value[index];
      index += 1;
      continue;
    }
    if (value.slice(index, index + 4) !== "'\\''") throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell command has malformed quoting");
    output += "'";
    index += 4;
  }
  return output;
}

function classifyRuntimeCommand(rawCommand, contract) {
  if (typeof rawCommand !== "string" || rawCommand.length === 0 || SENSITIVE_VALUE.test(rawCommand.replace(SHELL_PREFIX, ""))) throw new CommandEvidenceError("unsafe_command", "runtime command cannot be safely classified");
  const direct = contract?.commands.filter(({ execution_form }) => execution_form === "direct_argv").find((command) => renderCommandEvent(command) === rawCommand);
  if (direct) return { execution_form: "direct_argv", logical_digest: direct.logical_command_digest, rendered_digest: sha256(Buffer.from(rawCommand)), script: null };
  if (!rawCommand.startsWith(SHELL_PREFIX)) throw new CommandEvidenceError("unsupported_shell", "runtime command uses an unsupported shell envelope");
  const script = decodePosixSingleQuotedWord(rawCommand.slice(SHELL_PREFIX.length));
  try { assertSafeScript(script, "runtime canonical script"); } catch { throw new CommandEvidenceError("unsafe_command", "runtime command cannot be safely classified"); }
  return { execution_form: "codex_shell_command", logical_digest: canonicalDigest({ execution_form: "codex_shell_command", canonical_script: script }), rendered_digest: sha256(Buffer.from(rawCommand)), script };
}

function commandEvidenceBase({ sequence, started, completed, contract }) {
  const rawCommand = completed.command ?? started.command;
  if (started.command !== undefined && completed.command !== undefined && started.command !== completed.command) throw new CommandEvidenceError("command_drift", "runtime command changed between started and completed events");
  const classified = classifyRuntimeCommand(rawCommand, contract);
  const renderedMatches = contract?.commands.filter((command) => command.rendered_event_command_digest === classified.rendered_digest && command.execution_form === classified.execution_form) ?? [];
  const commandMatch = renderedMatches.find((command) => command.logical_command_digest === classified.logical_digest) ?? null;
  const matched = commandMatch?.working_directory.evidence_requirement === "not_required" ? commandMatch : null;
  const matchState = matched ? "matched" : commandMatch ? "cwd_unverified" : "unmatched";
  const exitCode = completed.exit_code;
  if (!Number.isInteger(exitCode)) throw new CommandEvidenceError("missing_exit_code", "completed command event lacks an integer exit code");
  if (!TERMINAL_ITEM_STATUSES.has(completed.status)) throw new CommandEvidenceError("unknown_status", "completed command event has an unsupported status");
  if ((completed.status === "completed" && exitCode !== 0) || (completed.status === "failed" && exitCode === 0)) throw new CommandEvidenceError("status_exit_contradiction", "command status contradicts exit code");
  const output = Buffer.from(completed.aggregated_output ?? "");
  return {
    event_sequence: { started: sequence.started, completed: sequence.completed },
    runtime_item_id_digest: sha256(Buffer.from(started.id)),
    matched_command_id: matched?.command_id ?? null,
    match_state: matchState,
    execution_form: classified.execution_form,
    logical_command_digest: classified.logical_digest,
    rendered_event_command_digest: classified.rendered_digest,
    working_directory: { status: "unavailable", classification: null, value: null, digest: null, source: "codex_exec_jsonl_cwd_not_exposed" },
    status: exitCode === 0 ? "succeeded" : "failed",
    exit_code: exitCode,
    duration: { status: "unknown", milliseconds: null },
    aggregated_output: { bytes: output.length, digest: sha256(output) },
    capture_source: "codex_exec_jsonl",
    evidence_level: "executed",
  };
}

function closeCommandEvidence(base, identity) {
  const digest = canonicalDigest({ ...identity, ...base });
  const id = `command-evidence-${digest.slice("sha256:".length, "sha256:".length + 32)}`;
  const bytes = jsonBytes({ command_evidence_id: id, command_evidence_digest: digest, ...base }).length;
  return { command_evidence_id: id, command_evidence_digest: digest, ...base, bytes };
}

function failOnRuntimeErrorEvent(event) {
  const topLevel = event.type === "error";
  const itemLevel = event.type === "item.completed" && event.item?.type === "error";
  if (!topLevel && !itemLevel) return;
  const category = String(event.category ?? event.error_category ?? event.item?.category ?? event.item?.error_category ?? "");
  const message = String(event.message ?? event.error ?? event.item?.message ?? event.item?.error ?? "");
  if (STREAM_INTEGRITY_ERROR.test(`${category} ${message}`)) throw new CommandEvidenceError("event_drop", "runtime reported an event stream integrity failure");
  throw new CommandEvidenceError("runtime_item_error", "runtime emitted an unclassified error item");
}

export function parseCodexCommandEvents({ stream, identity, contract }) {
  const bytes = Buffer.isBuffer(stream) ? stream : Buffer.from(stream ?? "");
  if (bytes.length > MAX_COMMAND_EVENT_STREAM_BYTES) throw new CommandEvidenceError("stream_oversized", "command event stream exceeds the byte limit");
  if (bytes.length === 0 || bytes.at(-1) !== 0x0a) throw new CommandEvidenceError("stream_truncated", "command event stream is empty or truncated");
  const lines = bytes.toString("utf8").split("\n").slice(0, -1);
  const active = new Map();
  const completedIds = new Set();
  const commands = [];
  let terminalTurn = false;
  let eventSequence = 0;
  for (const line of lines) {
    if (Buffer.byteLength(line) > MAX_COMMAND_EVENT_LINE_BYTES) throw new CommandEvidenceError("line_oversized", "command event line exceeds the byte limit");
    let event;
    try { event = JSON.parse(line); } catch { throw new CommandEvidenceError("malformed_jsonl", "command event stream contains malformed JSONL"); }
    eventSequence += 1;
    failOnRuntimeErrorEvent(event);
    if (event.type === "turn.completed") {
      if (terminalTurn) throw new CommandEvidenceError("duplicate_terminal_turn", "command event stream contains duplicate terminal turn events");
      terminalTurn = true;
      continue;
    }
    if (!["item.started", "item.completed"].includes(event.type) || event.item?.type !== "command_execution") continue;
    const item = event.item;
    if (typeof item.id !== "string" || item.id.length === 0) throw new CommandEvidenceError("missing_item_id", "command event lacks a stable item ID");
    if (terminalTurn) throw new CommandEvidenceError("sequence_reversal", "command event appears after terminal turn completion");
    if (event.type === "item.started") {
      if (active.has(item.id) || completedIds.has(item.id)) throw new CommandEvidenceError("duplicate_item_id", "command event item ID is duplicated");
      active.set(item.id, { item, sequence: eventSequence });
      continue;
    }
    const started = active.get(item.id);
    if (!started) throw new CommandEvidenceError("completed_without_started", "command completed without a matching started event");
    active.delete(item.id);
    completedIds.add(item.id);
    commands.push(closeCommandEvidence(commandEvidenceBase({ sequence: { started: started.sequence, completed: eventSequence }, started: started.item, completed: item, contract }), identity));
  }
  if (active.size > 0) throw new CommandEvidenceError("started_without_completed", "command started without a matching completed event");
  if (!terminalTurn) throw new CommandEvidenceError("missing_terminal_turn", "command event stream lacks terminal turn completion");
  return { stream: { bytes: bytes.length, digest: sha256(bytes) }, command_event_count: commands.length, commands };
}

function manifestIdentity(args) {
  return {
    run_instance_id: args.run_instance_id,
    case_id: args.case_id,
    attempt: args.attempt,
    adapter: args.adapter,
    condition: args.condition,
    fixture_id: args.fixture_id,
    repetition: args.repetition,
    fixture_input_digest: args.fixture_input_digest,
    verification_command_contract_digest: args.verification_command_contract_digest,
    runtime_identity_digest: args.runtime_identity_digest,
    effective_command_digest: args.effective_command_digest,
  };
}

export function buildCommandEvidenceManifest({ identity, capture, stream, command_event_count, commands }) {
  const base = {
    schema_version: "1.2.0",
    schema_path: COMMAND_EVIDENCE_SCHEMA_PATH,
    program: "adaptive_ask_command_evidence",
    ...manifestIdentity(identity),
    capture,
    stream,
    command_event_count,
    commands,
    privacy: { raw_command_stored: false, raw_output_stored: false, full_event_stream_stored: false, absolute_paths_stored: false, secrets_stored: false },
  };
  return { ...base, manifest_digest: canonicalDigest(base) };
}

export function buildUnavailableCommandEvidence({ identity, support, probe, reason, stream = Buffer.alloc(0) }) {
  const bytes = Buffer.isBuffer(stream) ? stream : Buffer.from(stream ?? "");
  return buildCommandEvidenceManifest({
    identity,
    capture: {
      support,
      evidence_level: "unavailable",
      event_transport: support === "supported" ? "codex_exec_jsonl" : "none",
      event_format_revision: support === "supported" ? CODEX_COMMAND_EVENT_FORMAT_REVISION : null,
      parser_revision: support === "supported" ? COMMAND_EVIDENCE_PARSER_REVISION : null,
      contract_probe_evidence: probe,
      downgrade_reason: reason,
    },
    stream: { bytes: bytes.length, digest: sha256(bytes) },
    command_event_count: 0,
    commands: [],
  });
}

export function buildCodexCommandEvidence({ identity, stream, contract }) {
  const parsed = parseCodexCommandEvents({ stream, identity: manifestIdentity(identity), contract });
  return buildCommandEvidenceManifest({
    identity,
    capture: {
      support: "supported",
      evidence_level: "executed",
      event_transport: "codex_exec_jsonl",
      event_format_revision: CODEX_COMMAND_EVENT_FORMAT_REVISION,
      parser_revision: COMMAND_EVIDENCE_PARSER_REVISION,
      contract_probe_evidence: "runtime_event_shell_authority",
      downgrade_reason: null,
    },
    ...parsed,
  });
}

function assertCaptureSemantics(manifest) {
  const capture = manifest.capture;
  if (capture.evidence_level === "executed") {
    if (capture.support !== "supported" || capture.event_transport !== "codex_exec_jsonl" || capture.event_format_revision !== CODEX_COMMAND_EVENT_FORMAT_REVISION || capture.parser_revision !== COMMAND_EVIDENCE_PARSER_REVISION || capture.contract_probe_evidence !== "runtime_event_shell_authority" || capture.downgrade_reason !== null) throw new Error("executed command evidence capture contract is inconsistent");
    return;
  }
  if (capture.support === "supported") {
    if (capture.event_transport !== "codex_exec_jsonl" || capture.event_format_revision !== CODEX_COMMAND_EVENT_FORMAT_REVISION || capture.parser_revision !== COMMAND_EVIDENCE_PARSER_REVISION || !["capture_invalid", "command_contract_unavailable", "runtime_unavailable", "shell_capability_unavailable"].includes(capture.contract_probe_evidence) || capture.downgrade_reason === null) throw new Error("supported unavailable command evidence capture contract is inconsistent");
  } else if (capture.event_transport !== "none" || capture.event_format_revision !== null || capture.parser_revision !== null || capture.downgrade_reason === null) throw new Error("unsupported command evidence capture contract is inconsistent");
}

export function validateCommandEvidenceManifest(manifest, { root, contract = null, expectedContractDigest = contract?.contract_digest ?? null, requireContractClosure = contract !== null || expectedContractDigest === null }) {
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, COMMAND_EVIDENCE_SCHEMA_PATH), label: "command evidence manifest" });
  if (manifest.manifest_digest !== canonicalDigest(withoutField(manifest, "manifest_digest"))) throw new Error("command evidence manifest digest mismatch");
  if (expectedContractDigest !== manifest.verification_command_contract_digest) throw new Error("command evidence contract binding mismatch");
  assertCaptureSemantics(manifest);
  assertUnique(manifest.commands.map(({ command_evidence_id: id }) => id), "command evidence IDs");
  assertUnique(manifest.commands.map(({ runtime_item_id_digest: digest }) => digest), "runtime item identity digests");
  assertUnique(manifest.commands.map(({ event_sequence: sequence }) => `${sequence.started}:${sequence.completed}`), "command event sequences");
  if (manifest.command_event_count !== manifest.commands.length) throw new Error("command evidence event count mismatch");
  if (manifest.capture.evidence_level === "unavailable" && (manifest.command_event_count !== 0 || manifest.commands.length !== 0)) throw new Error("unavailable command evidence must have zero events");
  const commandById = new Map(contract?.commands.map((command) => [command.command_id, command]) ?? []);
  let previousCompleted = 0;
  for (const command of manifest.commands) {
    const base = withoutField(withoutField(withoutField(command, "command_evidence_id"), "command_evidence_digest"), "bytes");
    const digest = canonicalDigest({ ...manifestIdentity(manifest), ...base });
    const id = `command-evidence-${digest.slice("sha256:".length, "sha256:".length + 32)}`;
    if (command.command_evidence_digest !== digest || command.command_evidence_id !== id) throw new Error("command evidence identity mismatch");
    if (command.bytes !== jsonBytes({ command_evidence_id: id, command_evidence_digest: digest, ...base }).length) throw new Error("command evidence byte count mismatch");
    if (command.event_sequence.completed <= command.event_sequence.started || command.event_sequence.completed <= previousCompleted) throw new Error("command event sequence is reversed");
    previousCompleted = command.event_sequence.completed;
    if ((command.status === "succeeded" && command.exit_code !== 0) || (command.status === "failed" && (!Number.isInteger(command.exit_code) || command.exit_code === 0))) throw new Error("command evidence status contradicts exit code");
    if (command.match_state === "matched") {
      const authority = commandById.get(command.matched_command_id);
      if (requireContractClosure && (!authority || authority.execution_form !== command.execution_form || authority.logical_command_digest !== command.logical_command_digest || authority.rendered_event_command_digest !== command.rendered_event_command_digest || authority.working_directory.evidence_requirement !== "not_required" || command.working_directory.status !== "unavailable")) throw new Error("matched command evidence does not close to public authority");
    } else {
      if (command.matched_command_id !== null) throw new Error("unmatched or cwd-unverified command evidence must not name a command ID");
      if (requireContractClosure && command.match_state === "cwd_unverified" && !contract?.commands.some((authority) => authority.execution_form === command.execution_form && authority.logical_command_digest === command.logical_command_digest && authority.rendered_event_command_digest === command.rendered_event_command_digest && authority.working_directory.evidence_requirement === "runtime_observed")) throw new Error("cwd-unverified command evidence does not close to public authority");
    }
  }
  return structuredClone(manifest);
}

export function projectVerifiedCommandEvidence({ manifest, contract }) {
  const commands = contract?.commands ?? [];
  const commandOrder = new Map(commands.map((command, index) => [command.command_id, index]));
  const byId = new Map();
  for (const evidence of manifest.commands) {
    if (evidence.matched_command_id === null) continue;
    byId.set(evidence.matched_command_id, [...(byId.get(evidence.matched_command_id) ?? []), evidence]);
  }
  const attempted = commands.filter(({ command_id }) => byId.has(command_id)).map(({ command_id }) => command_id);
  const summaries = attempted.map((commandId) => {
    const executions = byId.get(commandId);
    const latest = executions.at(-1).status;
    return {
      command_id: commandId,
      execution_count: executions.length,
      latest_outcome: latest,
      any_success: executions.some(({ status }) => status === "succeeded"),
      any_failure: executions.some(({ status }) => status === "failed"),
    };
  });
  const latestById = new Map(summaries.map((summary) => [summary.command_id, summary.latest_outcome]));
  const succeeded = attempted.filter((id) => latestById.get(id) === "succeeded");
  const failed = attempted.filter((id) => latestById.get(id) === "failed");
  const required = commands.filter(({ requirement }) => requirement === "required").map(({ command_id }) => command_id);
  const unavailable = required.filter((id) => !latestById.has(id));
  const groups = new Map();
  for (const command of commands.filter(({ requirement }) => requirement === "alternative")) {
    if (!groups.has(command.alternative_group_id)) groups.set(command.alternative_group_id, []);
    groups.get(command.alternative_group_id).push(command.command_id);
  }
  const requiredAlternativeGroups = [...groups.entries()].map(([groupId, memberIds]) => {
    const attemptedIds = memberIds.filter((id) => latestById.has(id));
    const succeededIds = memberIds.filter((id) => latestById.get(id) === "succeeded");
    return {
      group_id: groupId,
      member_ids: memberIds,
      attempted_ids: attemptedIds,
      succeeded_ids: succeededIds,
      satisfaction_state: manifest.capture.evidence_level === "unavailable" ? "unavailable" : succeededIds.length > 0 ? "satisfied" : "unsatisfied",
    };
  });
  for (const values of [required, attempted, succeeded, failed, unavailable]) assertUnique(values, "normalized command evidence inventory");
  for (const group of requiredAlternativeGroups) for (const id of [...group.attempted_ids, ...group.succeeded_ids]) if (!commandOrder.has(id)) throw new Error("alternative group contains an undeclared command ID");
  return {
    manifest_digest: manifest.manifest_digest,
    capture_support: manifest.capture.support,
    evidence_level: manifest.capture.evidence_level,
    command_event_count: manifest.command_event_count,
    verification_command_contract_digest: manifest.verification_command_contract_digest,
    required_command_ids: required,
    required_alternative_groups: requiredAlternativeGroups,
    command_summaries: summaries,
    attempted_command_ids: attempted,
    succeeded_command_ids: succeeded,
    failed_command_ids: failed,
    unavailable_command_ids: unavailable,
    unmatched_command_count: manifest.commands.filter(({ match_state }) => match_state === "unmatched").length,
    cwd_unverified_command_count: manifest.commands.filter(({ match_state }) => match_state === "cwd_unverified").length,
    references: manifest.commands.map((command) => ({
      command_id: command.matched_command_id,
      match_state: command.match_state,
      command_evidence_id: command.command_evidence_id,
      digest: command.command_evidence_digest,
      bytes: command.bytes,
      outcome: command.status,
      exit_code: command.exit_code,
    })),
  };
}
