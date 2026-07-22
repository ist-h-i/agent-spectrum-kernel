import { createHash } from "node:crypto";
import { posix, resolve, sep, win32 } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

export const VERIFICATION_COMMAND_CONTRACT_SCHEMA_PATH = "benchmarks/schemas/portfolio-verification-command-contract.schema.json";
export const COMMAND_EVIDENCE_SCHEMA_PATH = "benchmarks/schemas/portfolio-command-evidence.schema.json";
export const CODEX_COMMAND_EVENT_FORMAT_REVISION = "codex-exec-jsonl-v1";
export const COMMAND_EVIDENCE_PARSER_REVISION = "1.0.0";
export const COMMAND_EVIDENCE_PATH = "command-evidence.json";
export const MAX_COMMAND_EVENT_STREAM_BYTES = 16 * 1024 * 1024;
export const MAX_COMMAND_EVENT_LINE_BYTES = 1024 * 1024;

const TERMINAL_ITEM_STATUSES = new Set(["completed", "failed"]);
const SENSITIVE_COMMAND = /(?:^|\s)(?:[A-Za-z_][A-Za-z0-9_]*=|\/Users\/|\/home\/|\/private\/|\/var\/folders\/|[A-Za-z]:[\\/]|file:\/\/|(?:token|secret|password|credential)[A-Za-z0-9_-]*=)/iu;

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
    assertSafeContractPath(command.working_directory, `verification command ${command.command_id} working directory`);
    if (command.safe_argv.some((arg) => SENSITIVE_COMMAND.test(arg) || posix.isAbsolute(arg) || win32.isAbsolute(arg) || arg.includes(".."))) throw new Error(`verification command ${command.command_id} contains an unsafe argv value`);
    if (command.command_contract_digest !== computeCommandContractDigest(command)) throw new Error(`verification command ${command.command_id} digest mismatch`);
    if (command.requirement === "alternative") {
      if (!command.alternative_group_id) throw new Error(`alternative verification command ${command.command_id} requires a group`);
      alternatives.set(command.alternative_group_id, [...(alternatives.get(command.alternative_group_id) ?? []), command.command_id]);
    } else if (command.alternative_group_id !== null) throw new Error(`non-alternative verification command ${command.command_id} must not declare a group`);
  }
  for (const [group, ids] of alternatives) if (ids.length < 2) throw new Error(`alternative group ${group} is ambiguous`);
  return structuredClone(contract);
}

function commandEvidenceBase({ sequence, started, completed, contract }) {
  const rawCommand = completed.command ?? started.command;
  if (typeof rawCommand !== "string" || rawCommand.length === 0 || SENSITIVE_COMMAND.test(rawCommand)) throw new CommandEvidenceError("unsafe_command", "runtime command cannot be safely classified");
  if (started.command !== undefined && completed.command !== undefined && started.command !== completed.command) throw new CommandEvidenceError("command_drift", "runtime command changed between started and completed events");
  const argv = rawCommand.split(" ");
  if (argv.some((part) => part.length === 0) || rawCommand !== argv.join(" ")) throw new CommandEvidenceError("ambiguous_command", "runtime command is not an exact direct-argv rendering");
  const invocationDigest = commandInvocationDigest(argv);
  const matched = contract?.commands.find(({ safe_argv: argv }) => commandInvocationDigest(argv) === invocationDigest) ?? null;
  const exitCode = completed.exit_code;
  if (!Number.isInteger(exitCode)) throw new CommandEvidenceError("missing_exit_code", "completed command event lacks an integer exit code");
  if (!TERMINAL_ITEM_STATUSES.has(completed.status)) throw new CommandEvidenceError("unknown_status", "completed command event has an unsupported status");
  if ((completed.status === "completed" && exitCode !== 0) || (completed.status === "failed" && exitCode === 0)) throw new CommandEvidenceError("status_exit_contradiction", "command status contradicts exit code");
  const output = Buffer.from(completed.aggregated_output ?? "");
  const workingDirectory = started.cwd ?? completed.cwd ?? ".";
  if (typeof workingDirectory !== "string" || SENSITIVE_COMMAND.test(workingDirectory)) throw new CommandEvidenceError("unsafe_working_directory", "runtime working directory cannot be safely classified");
  const classification = workingDirectory === "." ? "workspace_root" : "workspace_relative";
  if (workingDirectory !== ".") assertSafeContractPath(workingDirectory, "runtime working directory");
  return {
    event_sequence: { started: sequence.started, completed: sequence.completed },
    runtime_item_id_digest: sha256(Buffer.from(started.id)),
    matched_command_id: matched?.command_id ?? null,
    match_state: matched ? "matched" : "unmatched",
    command_invocation_digest: invocationDigest,
    working_directory: { classification, digest: canonicalDigest({ classification, path: workingDirectory }) },
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
    if (event.type === "error" && /(?:drop|lag|stream)/iu.test(String(event.message ?? event.error ?? ""))) throw new CommandEvidenceError("event_drop", "runtime reported an event stream integrity failure");
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
    schema_version: "1.0.0",
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
      contract_probe_evidence: "local_version_help_json_probe",
      downgrade_reason: null,
    },
    ...parsed,
  });
}

export function validateCommandEvidenceManifest(manifest, { root, contract = null, expectedContractDigest = contract?.contract_digest ?? null, requireContractClosure = contract !== null || expectedContractDigest === null }) {
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, COMMAND_EVIDENCE_SCHEMA_PATH), label: "command evidence manifest" });
  if (manifest.manifest_digest !== canonicalDigest(withoutField(manifest, "manifest_digest"))) throw new Error("command evidence manifest digest mismatch");
  if (expectedContractDigest !== manifest.verification_command_contract_digest) throw new Error("command evidence contract binding mismatch");
  assertUnique(manifest.commands.map(({ command_evidence_id: id }) => id), "command evidence IDs");
  assertUnique(manifest.commands.map(({ runtime_item_id_digest: digest }) => digest), "runtime item identity digests");
  if (manifest.command_event_count !== manifest.commands.length) throw new Error("command evidence event count mismatch");
  if (manifest.capture.evidence_level === "unavailable" && (manifest.command_event_count !== 0 || manifest.commands.length !== 0)) throw new Error("unavailable command evidence must have zero events");
  if (manifest.capture.evidence_level === "executed" && manifest.capture.support !== "supported") throw new Error("executed command evidence requires supported capture");
  const commandById = new Map(contract?.commands.map((command) => [command.command_id, command]) ?? []);
  for (const command of manifest.commands) {
    const base = withoutField(withoutField(withoutField(command, "command_evidence_id"), "command_evidence_digest"), "bytes");
    const digest = canonicalDigest({ ...manifestIdentity(manifest), ...base });
    const id = `command-evidence-${digest.slice("sha256:".length, "sha256:".length + 32)}`;
    if (command.command_evidence_digest !== digest || command.command_evidence_id !== id) throw new Error("command evidence identity mismatch");
    if (command.bytes !== jsonBytes({ command_evidence_id: id, command_evidence_digest: digest, ...base }).length) throw new Error("command evidence byte count mismatch");
    if (command.event_sequence.completed <= command.event_sequence.started) throw new Error("command event sequence is reversed");
    if ((command.status === "succeeded" && command.exit_code !== 0) || (command.status === "failed" && (!Number.isInteger(command.exit_code) || command.exit_code === 0))) throw new Error("command evidence status contradicts exit code");
    if (command.match_state === "matched") {
      const authority = commandById.get(command.matched_command_id);
      if (requireContractClosure && (!authority || commandInvocationDigest(authority.safe_argv) !== command.command_invocation_digest)) throw new Error("matched command evidence does not close to public authority");
    } else if (command.matched_command_id !== null) throw new Error("unmatched command evidence must not name a command ID");
  }
  return structuredClone(manifest);
}

export function projectVerifiedCommandEvidence({ manifest, contract }) {
  const required = contract?.commands.filter(({ requirement }) => requirement === "required").map(({ command_id }) => command_id) ?? [];
  const requiredIds = [...required];
  const attempted = manifest.commands.filter(({ matched_command_id: id }) => id !== null).map(({ matched_command_id: id }) => id);
  const succeeded = manifest.commands.filter(({ matched_command_id: id, status }) => id !== null && status === "succeeded").map(({ matched_command_id: id }) => id);
  const failed = manifest.commands.filter(({ matched_command_id: id, status }) => id !== null && status === "failed").map(({ matched_command_id: id }) => id);
  for (const values of [requiredIds, attempted, succeeded, failed]) assertUnique(values, "normalized command evidence inventory");
  const unavailable = manifest.capture.evidence_level === "unavailable" ? requiredIds : requiredIds.filter((id) => !attempted.includes(id));
  return {
    manifest_digest: manifest.manifest_digest,
    capture_support: manifest.capture.support,
    evidence_level: manifest.capture.evidence_level,
    command_event_count: manifest.command_event_count,
    verification_command_contract_digest: manifest.verification_command_contract_digest,
    required_command_ids: requiredIds,
    attempted_command_ids: attempted,
    succeeded_command_ids: succeeded,
    failed_command_ids: failed,
    unavailable_command_ids: unavailable,
    unmatched_command_count: manifest.commands.filter(({ match_state }) => match_state === "unmatched").length,
    references: manifest.commands.map((command) => ({
      command_id: command.matched_command_id,
      command_evidence_id: command.command_evidence_id,
      digest: command.command_evidence_digest,
      bytes: command.bytes,
      outcome: command.status,
      exit_code: command.exit_code,
    })),
  };
}
