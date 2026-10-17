import { createHash } from "node:crypto";
import { dirname, posix, resolve, win32 } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { validateSchemaValue } from "./json-schema-validation.mjs";

export const VERIFICATION_COMMAND_CONTRACT_SCHEMA_PATH = "benchmarks/schemas/portfolio-verification-command-contract.schema.json";
export const COMMAND_EVIDENCE_SCHEMA_PATH = "benchmarks/schemas/portfolio-command-evidence.schema.json";
export const CODEX_COMMAND_EVENT_FORMAT_REVISION = "codex-exec-jsonl-v1";
export const COMMAND_EVIDENCE_PARSER_REVISION = "1.3.0";
// Opt-in offline primary parsing; legacy adapters retain their exact revision.
export const PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION = "1.4.0-primary-saved";
export const PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION = "1.5.0-primary-saved";
export const PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION = "1.6.0-primary-saved";
export const COMMAND_EVIDENCE_PATH = "command-evidence.json";
export const MAX_COMMAND_EVENT_STREAM_BYTES = 16 * 1024 * 1024;
export const MAX_COMMAND_EVENT_LINE_BYTES = 1024 * 1024;

const TERMINAL_ITEM_STATUSES = new Set(["completed", "failed", "declined"]);
const SHELL_PREFIX = "/bin/bash -lc ";
const SAVED_SHELL_PREFIXES = [SHELL_PREFIX, "/bin/zsh -lc ", "/bin/bash -c "];
const PARSER_REVISIONS = [COMMAND_EVIDENCE_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION];
const boundedSavedRevision = revision => [PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION].includes(revision);
const FAILURE_CODES = new Set(["stream_oversized", "stream_truncated", "line_oversized", "malformed_jsonl", "malformed_event",
  "duplicate_terminal_turn", "sequence_reversal", "event_drop", "runtime_item_error", "turn_failed", "missing_item_id",
  "duplicate_item_id", "invalid_started_status", "completed_without_started", "command_drift", "unknown_status",
  "status_exit_contradiction", "started_without_completed", "missing_terminal_turn", "unsafe_command",
  "unsupported_shell", "malformed_shell_envelope", "ambiguous_shell_word", "unsupported_parser_revision", "ambiguous_command_match", "overlapping_commands", "missing_command", "unsupported_event", "unverified_file_change"]);
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
  if (typeof script !== "string" || script.length === 0 || script.trim() !== script || /(?:^|\/)\.\.(?:\/|$)/u.test(script)) throw new Error(`${label} is unsafe`);
  const inlineNode = script.match(/^node -e '([^']*)'(.*)$/u);
  if (inlineNode) {
    const code = inlineNode[1];
    const suffix = inlineNode[2];
    if (!code.includes("node:fs") || !code.includes("node:crypto") || /(?:child_process|node:net|node:http|node:https|fetch|process\.env|writeFile|unlink|rename|rmSync|exec|spawn|eval|Function)/u.test(code)) throw new Error(`${label} contains an unsafe inline Node authority`);
    if (UNSAFE_SCRIPT.test(suffix) || /(?:^|\/)\.\.(?:\/|$)/u.test(suffix)) throw new Error(`${label} is unsafe`);
    return;
  }
  if (UNSAFE_SCRIPT.test(script)) throw new Error(`${label} is unsafe`);
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

// Finite renderings of public bytes in the *declared* envelope. This does not
// equate shells/flags, interpret a script, normalize whitespace or infer cwd.
function authorityRenderDigests(command, parserRevision) {
  if (!boundedSavedRevision(parserRevision) || command.execution_form !== "codex_shell_command") {
    return [command.rendered_event_command_digest];
  }
  const script = command.canonical_script;
  const doubleQuoted = '"' + script.replace(/[\\"$`]/gu, character => "\\" + character) + '"';
  const shlexQuoted = "'" + script.replaceAll("'", "'\"'\"'") + "'";
  return [...new Set([renderCommandEvent(command), SHELL_PREFIX + doubleQuoted, SHELL_PREFIX + shlexQuoted])]
    .map(value => sha256(Buffer.from(value)));
}

function closesCommandAuthority(command, authority, parserRevision) {
  return authority.execution_form === command.execution_form
    && authority.logical_command_digest === command.logical_command_digest
    && authorityRenderDigests(authority, parserRevision).includes(command.rendered_event_command_digest);
}

// An undeclared auxiliary command is never verification authority. In v2 only
// this small read grammar is retainable; unknown scripts do not vanish behind
// a later successful check. No shell or candidate code is executed here.
function boundedAuxiliaryRead(script) {
  if (typeof script !== "string" || script.includes("..")) return false;
  const word = '[A-Za-z0-9_./-]+', path = `(?:${word}|'${word}'|"${word}")`;
  return script.split(/\s*(?:&&|;)\s*/u).every(part => /^(?:pwd|rg --files)$/u.test(part)
    || new RegExp(`^cat(?: +${path})+$`, 'u').test(part)
    || new RegExp(`^ls(?: -[al]{1,2})?(?: +${path})*$`, 'u').test(part));
}

// V3 adds finite discovery forms, not arbitrary shell parsing or partial salvage.
// No paths, expansions, extra options, -exec/-delete or executable input follow
// these new tokens. Existing capture safety checks still run before this gate.
function boundedAuxiliaryReadV3(script) {
  if (typeof script !== "string" || script.includes("..")) return false;
  const filename = '[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*';
  const filter = `(?:${filename}|'${filename}'|"${filename}")`;
  return script.split(/\s*(?:&&|;)\s*/u).every(part => boundedAuxiliaryRead(part)
    || part === 'find . -name AGENTS.md -print'
    || new RegExp(`^rg --files(?: -g ${filter})+$`, 'u').test(part));
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

export function validateVerificationCommandContract(contract, { root, schema = null }) {
  const schemaPath = resolve(root, VERIFICATION_COMMAND_CONTRACT_SCHEMA_PATH);
  if (schema === null) assertBenchmarkSchemaInstance(contract, { schemaPath, label: "verification command contract" });
  else {
    const errors = validateSchemaValue(contract, schema, { baseDir: dirname(schemaPath), rootSchema: schema });
    if (errors.length > 0) throw new Error(`verification command contract failed JSON Schema validation:\n${errors.join("\n")}`);
  }
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

export function commandEvidenceFailureReason(error) {
  return "capture_invalid:" + (error instanceof CommandEvidenceError && FAILURE_CODES.has(error.code) ? error.code : "unclassified");
}

function assertParserRevision(value) {
  if (!PARSER_REVISIONS.includes(value)) throw new CommandEvidenceError("unsupported_parser_revision", "unsupported command evidence parser revision");
}

// Decode one literal shell word as data. No expansions, evaluation or execution.
function decodeLiteralShellWord(value) {
  let output = "", quote = null, sawQuote = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\0") throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell word contains a prohibited character");
    if (quote === "'") {
      if (character === "'") quote = null; else output += character;
      continue;
    }
    if (character === "\\") {
      const next = value[++index];
      if (next === undefined) throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell word has incomplete escaping");
      if (next === "\0") throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell word contains a prohibited character");
      if (next === "\n") continue;
      if (quote === '"' && !['$', String.fromCharCode(96), '"', '\\'].includes(next)) output += "\\";
      output += next;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = null;
      else if (character === "$" || character === String.fromCharCode(96)) throw new CommandEvidenceError("ambiguous_shell_word", "runtime shell word requires expansion");
      else output += character;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; sawQuote = true; continue; }
    if (!/[A-Za-z0-9_./:@%+=,-]/u.test(character)) throw new CommandEvidenceError("ambiguous_shell_word", "runtime shell envelope is not one literal word");
    output += character;
  }
  if (quote !== null || !sawQuote || output.length === 0) throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell word has malformed quoting");
  return output;
}

function classifyRuntimeCommand(rawCommand, contract, parserRevision) {
  if (typeof rawCommand !== "string" || rawCommand.length === 0) throw new CommandEvidenceError("unsafe_command", "runtime command cannot be safely classified");
  const direct = contract?.commands.filter(({ execution_form }) => execution_form === "direct_argv").find((command) => renderCommandEvent(command) === rawCommand);
  if (direct) return { execution_form: "direct_argv", logical_digest: direct.logical_command_digest, rendered_digest: sha256(Buffer.from(rawCommand)), script: null };
  const saved = parserRevision !== COMMAND_EVIDENCE_PARSER_REVISION;
  const prefix = (saved ? SAVED_SHELL_PREFIXES : [SHELL_PREFIX]).find(value => rawCommand.startsWith(value));
  if (!prefix) throw new CommandEvidenceError("unsupported_shell", "runtime command uses an unsupported shell envelope");
  const word = rawCommand.slice(prefix.length);
  // Only this complete literal auxiliary word bypasses quoted-word decoding.
  // It remains unmatched; this does not add unquoted verification renderings.
  const script = parserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION && word === 'pwd'
    ? 'pwd' : saved ? decodeLiteralShellWord(word) : decodePosixSingleQuotedWord(word);
  if (/(?:^|[;,])\s*(?:token|secret|password|credential)[A-Za-z0-9_-]*\s*=/iu.test(script)) throw new CommandEvidenceError("unsafe_command", "runtime command cannot be safely classified");
  try { assertSafeScript(script, "runtime canonical script"); } catch { throw new CommandEvidenceError("unsafe_command", "runtime command cannot be safely classified"); }
  return { execution_form: "codex_shell_command", logical_digest: canonicalDigest({ execution_form: "codex_shell_command", canonical_script: script }), rendered_digest: sha256(Buffer.from(rawCommand)), script };
}

function commandTerminalOutcome(completed) {
  if (!TERMINAL_ITEM_STATUSES.has(completed.status)) throw new CommandEvidenceError("unknown_status", "completed command event has an unsupported terminal status");
  const exitCode = completed.exit_code ?? null;
  if (completed.status === "completed" && (!Number.isInteger(exitCode) || exitCode !== 0)) throw new CommandEvidenceError("status_exit_contradiction", "command status contradicts exit code: completed requires zero");
  if (completed.status === "failed" && (!Number.isInteger(exitCode) || exitCode === 0)) throw new CommandEvidenceError("status_exit_contradiction", "command status contradicts exit code: failed requires a nonzero integer");
  if (completed.status === "declined" && exitCode !== null) throw new CommandEvidenceError("status_exit_contradiction", "command status contradicts exit code: declined requires absent or null");
  return { status: completed.status === "completed" ? "succeeded" : completed.status, exitCode };
}

function assertCommandPairIntegrity(started, completed) {
  if (started.command !== undefined && completed.command !== undefined && started.command !== completed.command) throw new CommandEvidenceError("command_drift", "runtime command changed between started and completed events");
  if (started.status !== undefined && started.status !== "in_progress") throw new CommandEvidenceError("invalid_started_status", "started command event has a non-progress status");
  commandTerminalOutcome(completed);
}

function commandEvidenceBase({ sequence, started, completed, contract, parserRevision }) {
  const rawCommand = completed.command ?? started.command;
  const classified = classifyRuntimeCommand(rawCommand, contract, parserRevision);
  const candidate = { execution_form: classified.execution_form, logical_command_digest: classified.logical_digest,
    rendered_event_command_digest: classified.rendered_digest };
  const matches = contract?.commands.filter(command => closesCommandAuthority(candidate, command, parserRevision)) ?? [];
  if (boundedSavedRevision(parserRevision)) {
    if (matches.length > 1) throw new CommandEvidenceError("ambiguous_command_match", "multiple public command IDs match one invocation");
    const declaredBody = contract?.commands.some(command => command.execution_form === classified.execution_form && command.logical_command_digest === classified.logical_digest);
    const auxiliaryRead = parserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION
      ? boundedAuxiliaryReadV3(classified.script) : boundedAuxiliaryRead(classified.script);
    // V2 retained a declared body under a different envelope as unmatched. V3
    // cannot establish that invocation's relationship/side effects and refuses.
    const legacyDeclaredBody = parserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION && declaredBody;
    if (!matches.length && !legacyDeclaredBody && !auxiliaryRead) throw new CommandEvidenceError("unsafe_command", "undeclared command is outside the bounded auxiliary read grammar");
  }
  const commandMatch = matches[0] ?? null;
  const matched = commandMatch?.working_directory.evidence_requirement === "not_required" ? commandMatch : null;
  const matchState = matched ? "matched" : commandMatch ? "cwd_unverified" : "unmatched";
  const outcome = commandTerminalOutcome(completed);
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
    status: outcome.status,
    exit_code: outcome.exitCode,
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

// An inert type must not conceal an opaque tool payload. Other event forms are
// unknown in V3, not assumed harmless merely because they are not commands.
function assertV3EventShape(event) {
  const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key));
  const item = event.item;
  if (event.type === 'error' || event.type === 'turn.failed' || event.type === 'item.completed' && item?.type === 'error') return;
  let valid = false;
  if (event.type === 'thread.started') valid = closed(event, ['type', 'thread_id']) && typeof event.thread_id === 'string' && event.thread_id.length > 0;
  else if (event.type === 'turn.started') valid = closed(event, ['type']);
  else if (event.type === 'turn.completed') valid = closed(event, ['type', 'usage']) && (event.usage === undefined
    || closed(event.usage, ['input_tokens', 'cached_input_tokens', 'output_tokens'])
      && Object.values(event.usage).every(value => Number.isInteger(value) && value >= 0));
  else if (closed(event, ['type', 'item']) && ['item.started', 'item.updated', 'item.completed'].includes(event.type)
    && typeof item?.id === 'string' && item.id.length > 0) {
    if (item.type === 'command_execution') valid = event.type !== 'item.updated'
      && closed(item, ['id', 'type', 'command', 'status', 'exit_code', 'aggregated_output', 'cwd', 'command_id']);
    else if (item.type === 'file_change') valid = event.type === 'item.completed' && closed(item, ['id', 'type', 'changes', 'status'])
      && Array.isArray(item.changes) && item.changes.length > 0
      && item.changes.every(change => closed(change, ['path', 'kind']) && typeof change.path === 'string' && ['add', 'delete', 'update'].includes(change.kind));
    else if (['agent_message', 'reasoning'].includes(item.type)) valid = closed(item, ['id', 'type', 'text'])
      && (event.type === 'item.started' && item.text === undefined || typeof item.text === 'string');
    else if (item.type === 'todo_list') valid = closed(item, ['id', 'type', 'items']) && Array.isArray(item.items)
      && item.items.every(entry => closed(entry, ['text', 'completed']) && typeof entry.text === 'string' && typeof entry.completed === 'boolean');
  }
  if (!valid) throw new CommandEvidenceError('unsupported_event', 'event meaning or side effects are not established');
}

export function parseCodexCommandEvents({ stream, identity, contract, parserRevision = COMMAND_EVIDENCE_PARSER_REVISION, candidateChangePaths = [] }) {
  assertParserRevision(parserRevision);
  const v3 = parserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION;
  if (v3 && (!Array.isArray(candidateChangePaths) || candidateChangePaths.some(path => typeof path !== 'string'
    || path === '.' || !/^[A-Za-z0-9._/-]+$/u.test(path) || posix.isAbsolute(path)
    || posix.normalize(path) !== path || path.split('/').includes('..')))) throw new CommandEvidenceError('unverified_file_change', 'candidate change context is not canonical');
  const changePaths = new Set(v3 ? candidateChangePaths : []);
  const bytes = Buffer.isBuffer(stream) ? stream : Buffer.from(stream ?? "");
  if (bytes.length > MAX_COMMAND_EVENT_STREAM_BYTES) throw new CommandEvidenceError("stream_oversized", "command event stream exceeds the byte limit");
  if (bytes.length === 0 || bytes.at(-1) !== 0x0a) throw new CommandEvidenceError("stream_truncated", "command event stream is empty or truncated");
  const lines = bytes.toString("utf8").split("\n").slice(0, -1);
  const active = new Map();
  const completedIds = new Set();
  const itemTypes = new Map();
  const commandPairs = [];
  let verificationStarted = false;
  let terminalTurn = false;
  let eventSequence = 0;
  for (const line of lines) {
    if (Buffer.byteLength(line) > MAX_COMMAND_EVENT_LINE_BYTES) throw new CommandEvidenceError("line_oversized", "command event line exceeds the byte limit");
    let event;
    try { event = parserRevision !== COMMAND_EVIDENCE_PARSER_REVISION ? parseJsonRejectDuplicateKeys(line) : JSON.parse(line); }
    catch { throw new CommandEvidenceError("malformed_jsonl", "command event stream contains malformed JSONL"); }
    if (parserRevision !== COMMAND_EVIDENCE_PARSER_REVISION && (!event || typeof event !== "object" || Array.isArray(event) || typeof event.type !== "string" || !event.type)) throw new CommandEvidenceError("malformed_event", "command event has no unambiguous type");
    if (v3) assertV3EventShape(event);
    eventSequence += 1;
    if (event.type === "turn.completed") {
      if (terminalTurn) throw new CommandEvidenceError("duplicate_terminal_turn", "command event stream contains duplicate terminal turn events");
      terminalTurn = true;
      continue;
    }
    if (terminalTurn) throw new CommandEvidenceError("sequence_reversal", "runtime event appears after terminal turn completion");
    failOnRuntimeErrorEvent(event);
    if (event.type === "turn.failed") throw new CommandEvidenceError("turn_failed", "runtime turn failed before command evidence completion");
    if (v3 && event.item) {
      const { id, type } = event.item;
      if (itemTypes.has(id) && itemTypes.get(id) !== type) throw new CommandEvidenceError('unsupported_event', 'item identity changed its event meaning');
      itemTypes.set(id, type);
      if (type === 'file_change') {
        if (completedIds.has(id)) throw new CommandEvidenceError('duplicate_item_id', 'file change item ID is duplicated');
        if (verificationStarted || active.size || event.item.status !== 'completed'
          || event.item.changes.some(change => !changePaths.has(change.path))) throw new CommandEvidenceError('unverified_file_change', 'file change is outside the established pre-verification candidate scope');
        completedIds.add(id);
        continue;
      }
    }
    if (!["item.started", "item.completed"].includes(event.type) || event.item?.type !== "command_execution") continue;
    const item = event.item;
    if (typeof item.id !== "string" || item.id.length === 0) throw new CommandEvidenceError("missing_item_id", "command event lacks a stable item ID");
    if (parserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION && (typeof item.command !== 'string' || !item.command.length)) throw new CommandEvidenceError('missing_command', 'both command events must identify the invocation');
    if (event.type === "item.started") {
      if (active.has(item.id) || completedIds.has(item.id)) throw new CommandEvidenceError("duplicate_item_id", "command event item ID is duplicated");
      if (parserRevision === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION && active.size) throw new CommandEvidenceError('overlapping_commands', 'command relationship is not serially established');
      if (item.status !== undefined && item.status !== "in_progress") throw new CommandEvidenceError("invalid_started_status", "started command event has a non-progress status");
      // The boundary begins at invocation start, even if the eventual check
      // fails, is declined, or cannot close required cwd evidence.
      if (v3 && contract?.commands.some(command => authorityRenderDigests(command, parserRevision).includes(sha256(Buffer.from(item.command))))) verificationStarted = true;
      active.set(item.id, { item, sequence: eventSequence });
      continue;
    }
    if (completedIds.has(item.id)) throw new CommandEvidenceError("duplicate_item_id", "command event item ID is duplicated");
    const started = active.get(item.id);
    if (!started) throw new CommandEvidenceError("completed_without_started", "command completed without a matching started event");
    assertCommandPairIntegrity(started.item, item);
    active.delete(item.id);
    completedIds.add(item.id);
    commandPairs.push({ sequence: { started: started.sequence, completed: eventSequence }, started: started.item, completed: item });
  }
  if (active.size > 0) throw new CommandEvidenceError("started_without_completed", "command started without a matching completed event");
  if (!terminalTurn) throw new CommandEvidenceError("missing_terminal_turn", "command event stream lacks terminal turn completion");
  const commands = [];
  let unsupportedShell = null;
  for (const pair of commandPairs) {
    try {
      commands.push(closeCommandEvidence(commandEvidenceBase({ ...pair, contract, parserRevision }), identity));
    } catch (error) {
      if (error?.code !== "unsupported_shell") throw error;
      unsupportedShell ??= error;
    }
  }
  if (unsupportedShell) throw unsupportedShell;
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

export function buildUnavailableCommandEvidence({ identity, support, probe, reason, stream = Buffer.alloc(0), parserRevision = COMMAND_EVIDENCE_PARSER_REVISION }) {
  assertParserRevision(parserRevision);
  const bytes = Buffer.isBuffer(stream) ? stream : Buffer.from(stream ?? "");
  return buildCommandEvidenceManifest({
    identity,
    capture: {
      support,
      evidence_level: "unavailable",
      event_transport: support === "supported" ? "codex_exec_jsonl" : "none",
      event_format_revision: support === "supported" ? CODEX_COMMAND_EVENT_FORMAT_REVISION : null,
      parser_revision: support === "supported" ? parserRevision : null,
      contract_probe_evidence: probe,
      downgrade_reason: reason,
    },
    stream: { bytes: bytes.length, digest: sha256(bytes) },
    command_event_count: 0,
    commands: [],
  });
}

export function buildCodexCommandEvidence({ identity, stream, contract, parserRevision = COMMAND_EVIDENCE_PARSER_REVISION, candidateChangePaths = [] }) {
  const parsed = parseCodexCommandEvents({ stream, identity: manifestIdentity(identity), contract, parserRevision, candidateChangePaths });
  return buildCommandEvidenceManifest({
    identity,
    capture: {
      support: "supported",
      evidence_level: "executed",
      event_transport: "codex_exec_jsonl",
      event_format_revision: CODEX_COMMAND_EVENT_FORMAT_REVISION,
      parser_revision: parserRevision,
      contract_probe_evidence: "runtime_event_shell_authority",
      downgrade_reason: null,
    },
    ...parsed,
  });
}

function assertCaptureSemantics(manifest) {
  const capture = manifest.capture;
  if (capture.evidence_level === "executed") {
    if (capture.support !== "supported" || capture.event_transport !== "codex_exec_jsonl" || capture.event_format_revision !== CODEX_COMMAND_EVENT_FORMAT_REVISION || !PARSER_REVISIONS.includes(capture.parser_revision) || capture.contract_probe_evidence !== "runtime_event_shell_authority" || capture.downgrade_reason !== null) throw new Error("executed command evidence capture contract is inconsistent");
    return;
  }
  if (capture.support === "supported") {
    if (capture.event_transport !== "codex_exec_jsonl" || capture.event_format_revision !== CODEX_COMMAND_EVENT_FORMAT_REVISION || !PARSER_REVISIONS.includes(capture.parser_revision) || !["capture_invalid", "command_contract_unavailable", "runtime_unavailable", "shell_capability_unavailable"].includes(capture.contract_probe_evidence) || capture.downgrade_reason === null) throw new Error("supported unavailable command evidence capture contract is inconsistent");
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
    if (manifest.capture.parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION && command.event_sequence.started <= previousCompleted) throw new Error('command event sequences overlap');
    previousCompleted = command.event_sequence.completed;
    if ((command.status === "succeeded" && command.exit_code !== 0) || (command.status === "failed" && (!Number.isInteger(command.exit_code) || command.exit_code === 0)) || (command.status === "declined" && command.exit_code !== null)) throw new Error("command evidence status contradicts exit code");
    if (command.match_state === "matched") {
      const authority = commandById.get(command.matched_command_id);
      if (requireContractClosure && (!authority || !closesCommandAuthority(command, authority, manifest.capture.parser_revision) || authority.working_directory.evidence_requirement !== "not_required" || command.working_directory.status !== "unavailable")) throw new Error("matched command evidence does not close to public authority");
      if (requireContractClosure && boundedSavedRevision(manifest.capture.parser_revision) && contract.commands.filter(item => closesCommandAuthority(command, item, manifest.capture.parser_revision)).length !== 1) throw new Error("ambiguous public command authority");
    } else {
      if (command.matched_command_id !== null) throw new Error("unmatched or cwd-unverified command evidence must not name a command ID");
      if (requireContractClosure && command.match_state === "cwd_unverified" && !contract?.commands.some((authority) => closesCommandAuthority(command, authority, manifest.capture.parser_revision) && authority.working_directory.evidence_requirement === "runtime_observed")) throw new Error("cwd-unverified command evidence does not close to public authority");
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
      any_declined: executions.some(({ status }) => status === "declined"),
    };
  });
  const latestById = new Map(summaries.map((summary) => [summary.command_id, summary.latest_outcome]));
  const succeeded = attempted.filter((id) => latestById.get(id) === "succeeded");
  const failed = attempted.filter((id) => latestById.get(id) === "failed");
  const declined = attempted.filter((id) => latestById.get(id) === "declined");
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
  for (const values of [required, attempted, succeeded, failed, declined, unavailable]) assertUnique(values, "normalized command evidence inventory");
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
    declined_command_ids: declined,
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
    declined_references: manifest.commands.filter(({ status }) => status === "declined").map((command) => ({
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
