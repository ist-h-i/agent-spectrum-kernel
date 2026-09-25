import { randomUUID } from "node:crypto";
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync,
  renameSync, unlinkSync, writeFileSync, writeSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, parseJsonRejectDuplicateKeys, stableCanonicalJson, assertNoSymlinkPathSegments } from "./content-addressed-store.mjs";
import { successorClosed, successorDigest, successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";
import {
  assertSuccessorMeasuredAuthority, assertSuccessorMeasuredSourceAuthority,
  inspectSuccessorMeasuredAuthority, successorMeasuredJournalPath,
} from "./ask-benchmark-prompt-successor-measured-authority.mjs";
import { inspectSuccessorCollectionControl } from "./ask-benchmark-prompt-successor-collection.mjs";
import { openSuccessorPromptInput } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { executePortfolio, inspectVerifiedPortfolioExecution, recoverPortfolioCase } from "./ask-benchmark-execution.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const completionHandles = new WeakMap();

function measuredSources(sources) {
  return Object.fromEntries(Object.entries(sources).map(([role, source]) => [role, {
    scope: source.scope,
    expectedScopeDigest: source.expectedScopeDigest,
    execution: source.execution,
  }]));
}

function safeJournalPath(value) {
  if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0")) successorFail("SUCCESSOR_JOURNAL_PATH", "journal path");
  const absolute = resolve(value);
  const parent = dirname(absolute);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertNoSymlinkPathSegments(parent, "measured journal parent");
  realpathSync(parent);
  return absolute;
}

function canonicalJournalPath(authority, preparation, sources) {
  return safeJournalPath(successorMeasuredJournalPath(authority, { preparation, sources }));
}

function writeDurableJson(path, value) {
  const parent = dirname(path);
  const temp = `${path}.tmp-${randomUUID()}`;
  const bytes = Buffer.from(`${stableCanonicalJson(value)}\n`);
  if (bytes.length > MAX_JOURNAL_BYTES) successorFail("SUCCESSOR_JOURNAL_SIZE", "journal snapshot");
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  const directory = openSync(parent, "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function readJsonBounded(path, label, maxBytes = MAX_JOURNAL_BYTES) {
  assertNoSymlinkPathSegments(path, label);
  const bytes = readFileSync(path);
  if (bytes.length < 2 || bytes.length > maxBytes) successorFail("SUCCESSOR_JOURNAL_SIZE", label);
  return parseJsonRejectDuplicateKeys(bytes, label);
}

function validateEntry(entry, index, preparation, sources, control) {
  successorClosed(entry, [
    "schema_version", "kind", "position", "case_id", "prompt_role", "native_case_id", "status",
    "global_claim_digest", "pre_collection_digest", "post_collection_digest", "request_digest", "result_digest",
    "commit_digest", "entry_digest",
  ], `measured journal entry ${index + 1}`);
  const { entry_digest: digest, ...body } = entry;
  successorExact(entry.schema_version, "1.0.0", "measured journal entry version");
  successorExact(entry.kind, "prompt_successor_measured_terminal", "measured journal entry kind");
  successorExact(canonicalDigest(body), digest, "measured journal entry digest");
  successorExact(entry.position, index + 1, "measured journal entry position");
  const target = preparation.cases[index];
  successorExact(entry.case_id, target.case_id, "measured journal case order");
  successorExact(entry.prompt_role, target.prompt_role, "measured journal role order");
  const binding = sources[target.prompt_role].scope.source.bindings.find((item) => item.successor_case_id === target.case_id);
  successorExact(entry.native_case_id, binding?.source_case_id, "measured journal native case");
  const observed = control.cases[index];
  successorExact(entry.status, observed.status, "measured journal terminal status");
  successorExact(entry.request_digest, observed.request_digest, "measured journal request digest");
  successorExact(entry.result_digest, observed.result_digest, "measured journal result digest");
  successorExact(entry.commit_digest, observed.commit_digest, "measured journal commit digest");
  for (const key of ["global_claim_digest", "pre_collection_digest", "post_collection_digest", "request_digest", "result_digest", "commit_digest"]) successorDigest(entry[key], `measured journal.${key}`);
  return entry;
}

function readJournalBase(path, authority, preparation) {
  if (!existsSync(path)) return null;
  const value = readJsonBounded(path, "measured journal");
  successorClosed(value, [
    "schema_version", "kind", "authority_digest", "preparation_digest",
    "collection_inspection_digest", "collection_control_digest", "terminal_count", "pending_count",
    "next_case_id", "status", "stop_reasons", "observed_token_lower_bound", "total_tokens",
    "automatic_retries", "durable_global_sequence_verified", "measured_execution_authorized",
    "collection_complete", "portfolio_mutation_authorized", "entries", "journal_digest",
  ], "measured journal");
  const { journal_digest: digest, ...body } = value;
  successorExact(value.schema_version, "1.1.0", "measured journal version");
  successorExact(value.kind, "prompt_successor_measured_journal", "measured journal kind");
  successorExact(canonicalDigest(body), digest, "measured journal digest");
  successorExact(value.authority_digest, canonicalDigest(inspectSuccessorMeasuredAuthority(authority)), "measured journal authority");
  successorExact(value.preparation_digest, preparation.preparation_digest, "measured journal preparation");
  successorExact(value.automatic_retries, 0, "measured journal retries");
  successorExact(value.durable_global_sequence_verified, true, "measured journal sequence flag");
  successorExact(value.measured_execution_authorized, true, "measured journal execution flag");
  successorExact(value.portfolio_mutation_authorized, false, "measured journal mutation flag");
  if (!Array.isArray(value.entries) || value.entries.length !== value.terminal_count) successorFail("SUCCESSOR_MEASURED_JOURNAL_INVALID", "terminal entry count");
  return value;
}

function validateJournalAgainstInspection(value, authority, preparation, sources, inspection, { allowOneUnjournaledTerminal = false } = {}) {
  if (value === null) {
    const allowed = allowOneUnjournaledTerminal ? [0, 1] : [0];
    if (!allowed.includes(inspection.control.terminal_count)) successorFail("SUCCESSOR_MEASURED_JOURNAL_MISSING", "terminal evidence exists without durable journal");
    return [];
  }
  const entries = value.entries.map((entry, index) => validateEntry(entry, index, preparation, sources, inspection.control));
  for (let index = 1; index < entries.length; index += 1) {
    successorExact(entries[index].pre_collection_digest, entries[index - 1].post_collection_digest, "measured journal digest chain");
  }
  const delta = inspection.control.terminal_count - entries.length;
  if (delta !== 0 && !(allowOneUnjournaledTerminal && delta === 1)) successorFail("SUCCESSOR_MEASURED_JOURNAL_DIVERGED", "journal/native terminal count");
  if (delta === 0) {
    successorExact(value.collection_inspection_digest, inspection.inspection_digest, "measured journal current inspection");
    successorExact(value.collection_control_digest, inspection.control.control_digest, "measured journal current control");
    successorExact(value.terminal_count, inspection.control.terminal_count, "measured journal terminal count");
    successorExact(value.pending_count, inspection.control.pending_count, "measured journal pending count");
    successorExact(value.next_case_id, inspection.control.next_case_id, "measured journal next case");
    successorExact(value.status, inspection.control.status, "measured journal status");
    successorExact(value.stop_reasons, inspection.control.stop_reasons, "measured journal stop reasons");
    successorExact(value.total_tokens, inspection.control.total_tokens, "measured journal token total");
    successorExact(value.observed_token_lower_bound, inspection.control.observed_token_lower_bound, "measured journal token lower bound");
    successorExact(value.collection_complete, inspection.control.status === "collected", "measured journal completion flag");
    if (entries.length) successorExact(entries.at(-1).post_collection_digest, inspection.control.control_digest, "measured journal terminal control");
  }
  return entries;
}

function journalSnapshot(authority, inspection, entries) {
  const control = inspection.control;
  const body = {
    schema_version: "1.1.0",
    kind: "prompt_successor_measured_journal",
    authority_digest: canonicalDigest(inspectSuccessorMeasuredAuthority(authority)),
    preparation_digest: control.preparation_digest,
    collection_inspection_digest: inspection.inspection_digest,
    collection_control_digest: control.control_digest,
    terminal_count: control.terminal_count,
    pending_count: control.pending_count,
    next_case_id: control.next_case_id,
    status: control.status,
    stop_reasons: control.stop_reasons,
    observed_token_lower_bound: control.observed_token_lower_bound,
    total_tokens: control.total_tokens,
    automatic_retries: 0,
    durable_global_sequence_verified: true,
    measured_execution_authorized: true,
    collection_complete: control.status === "collected",
    portfolio_mutation_authorized: false,
    entries: structuredClone(entries),
  };
  return { ...body, journal_digest: canonicalDigest(body) };
}

function terminalEntry({ preparation, sources, claim, before, after }) {
  const target = preparation.cases[before.control.terminal_count];
  successorExact(target.case_id, claim.case_id, "measured terminal claim order");
  const observed = after.control.cases[before.control.terminal_count];
  successorExact(observed.case_id, target.case_id, "measured terminal observed case");
  if (["pending", "active"].includes(observed.status)) successorFail("SUCCESSOR_UNCERTAIN_EXECUTION", "claimed case lacks terminal evidence");
  const body = {
    schema_version: "1.0.0",
    kind: "prompt_successor_measured_terminal",
    position: before.control.terminal_count + 1,
    case_id: target.case_id,
    prompt_role: target.prompt_role,
    native_case_id: claim.native_case_id,
    status: observed.status,
    global_claim_digest: claim.claim_digest,
    pre_collection_digest: before.control.control_digest,
    post_collection_digest: after.control.control_digest,
    request_digest: observed.request_digest,
    result_digest: observed.result_digest,
    commit_digest: observed.commit_digest,
  };
  return { ...body, entry_digest: canonicalDigest(body) };
}

function lockRecord(authority, preparation, caseId, role, nativeCaseId, beforeDigest, journal) {
  const body = {
    schema_version: "1.1.0",
    kind: "prompt_successor_measured_claim",
    authority_digest: canonicalDigest(inspectSuccessorMeasuredAuthority(authority)),
    preparation_digest: preparation.preparation_digest,
    case_id: caseId,
    prompt_role: role,
    native_case_id: nativeCaseId,
    pre_collection_digest: beforeDigest,
    pre_journal_digest: journal?.journal_digest ?? null,
    pre_entry_count: journal?.entries.length ?? 0,
    automatic_retry_authorized: false,
  };
  return { ...body, claim_digest: canonicalDigest(body) };
}

function acquireLock(path, record) {
  let fd;
  try { fd = openSync(path, "wx", 0o600); }
  catch (error) {
    if (error?.code === "EEXIST") successorFail("SUCCESSOR_MEASURED_SESSION_LOCKED", "durable global claim");
    throw error;
  }
  try {
    writeFileSync(fd, `${stableCanonicalJson(record)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const directory = openSync(dirname(path), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function readLock(path) {
  const value = readJsonBounded(path, "measured claim", 64 * 1024);
  successorClosed(value, [
    "schema_version", "kind", "authority_digest", "preparation_digest", "case_id", "prompt_role",
    "native_case_id", "pre_collection_digest", "pre_journal_digest", "pre_entry_count",
    "automatic_retry_authorized", "claim_digest",
  ], "measured claim");
  const { claim_digest: digest, ...body } = value;
  successorExact(value.schema_version, "1.1.0", "measured claim version");
  successorExact(value.kind, "prompt_successor_measured_claim", "measured claim kind");
  successorExact(canonicalDigest(body), digest, "measured claim digest");
  successorExact(value.automatic_retry_authorized, false, "measured claim retry");
  successorDigest(value.pre_collection_digest, "measured claim pre-collection");
  if (value.pre_journal_digest !== null) successorDigest(value.pre_journal_digest, "measured claim pre-journal");
  return value;
}

function releaseLock(path) {
  unlinkSync(path);
  const directory = openSync(dirname(path), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

async function inspect(authority, preparation, sources, root) {
  return inspectSuccessorCollectionControl({
    preparation,
    sources: measuredSources(sources),
    accessMode: "measured",
    measuredAuthority: authority,
    root,
  });
}

export async function executeNextMeasuredSuccessorCase({
  authority, preparation, sources, root = ROOT,
}) {
  assertSuccessorMeasuredAuthority(authority, { preparation, sources });
  successorExact(resolve(root), ROOT, "measured execution root");
  const journal = canonicalJournalPath(authority, preparation, sources);
  const lockPath = `${journal}.lock`;
  if (existsSync(lockPath)) successorFail("SUCCESSOR_MEASURED_SESSION_LOCKED", "durable global claim");
  const before = await inspect(authority, preparation, sources, root);
  const previousJournal = readJournalBase(journal, authority, preparation);
  const entries = validateJournalAgainstInspection(previousJournal, authority, preparation, sources, before);
  if (before.control.status !== "ready_for_authorized_claim" || !before.control.next_case_id) {
    successorFail("SUCCESSOR_MEASURED_STOPPED", before.control.stop_reasons.join(",") || before.control.status);
  }
  const target = preparation.cases.find((entry) => entry.case_id === before.control.next_case_id);
  if (!target) successorFail("SUCCESSOR_CASE_MISSING", "measured next case");
  const source = sources[target.prompt_role];
  const binding = source.scope.source.bindings.find((entry) => entry.successor_case_id === target.case_id);
  if (!binding) successorFail("SUCCESSOR_CASE_MISSING", "measured native binding");
  const claim = lockRecord(authority, preparation, target.case_id, target.prompt_role, binding.source_case_id, before.control.control_digest, previousJournal);
  if (process.env.ASK_BENCHMARK_FAULT === "before_measured_lock_pause") {
    writeSync(2, "MEASURED_BEFORE_LOCK\n");
    process.kill(process.pid, "SIGSTOP");
  }
  acquireLock(lockPath, claim);
  try {
    const lockedJournal = readJournalBase(journal, authority, preparation);
    // A controller can release the global lock after a native change only after
    // publishing that change to this journal. The native prefix was inspected
    // above; an unchanged journal under our lock keeps that inspection current.
    if ((lockedJournal?.journal_digest ?? null) !== (previousJournal?.journal_digest ?? null)) {
      successorFail("SUCCESSOR_MEASURED_STALE_CLAIM", "journal changed before global claim");
    }
  } catch (error) {
    // This controller has not opened the Prompt or entered the native runner.
    releaseLock(lockPath);
    throw error;
  }
  try {
    const prompt = await openSuccessorPromptInput({
      preparation,
      scope: source.scope,
      expectedScopeDigest: source.expectedScopeDigest,
      caseId: target.case_id,
      root,
    });
    const output = executePortfolio({
      ...source.execution,
      root,
      adapter: "codex",
      runtimeConfigPath: source.runtimeConfigPath,
      agentBin: source.agentBin,
      caseId: binding.source_case_id,
      maxCases: 1,
      retryFailed: false,
      successorPromptInput: prompt,
    });
    const after = await inspect(authority, preparation, sources, root);
    successorExact(after.control.terminal_count, before.control.terminal_count + 1, "one measured terminal case per claim");
    const nextEntries = [...entries, terminalEntry({ preparation, sources, claim, before, after })];
    writeDurableJson(journal, journalSnapshot(authority, after, nextEntries));
    if (process.env.ASK_BENCHMARK_FAULT === "after_measured_journal_published") process.exit(86);
    releaseLock(lockPath);
    return {
      case_id: target.case_id,
      prompt_role: target.prompt_role,
      native_case_id: binding.source_case_id,
      outcome: structuredClone(output),
      collection: structuredClone(after.control),
      journal: readJournalBase(journal, authority, preparation),
      model_call_authorized_by_issue_291: true,
      automatic_retry_performed: false,
      portfolio_mutation_authorized: false,
    };
  } catch (error) {
    // A crash/exception after the durable global claim leaves the claim in place.
    // Recovery reopens native evidence and either journals the one terminal attempt
    // or releases an unstarted claim. It never starts the case again.
    throw error;
  }
}

export async function recoverMeasuredSuccessorSession({
  authority, preparation, sources, root = ROOT,
}) {
  assertSuccessorMeasuredAuthority(authority, { preparation, sources });
  const journal = canonicalJournalPath(authority, preparation, sources);
  const lockPath = `${journal}.lock`;
  if (!existsSync(lockPath)) successorFail("SUCCESSOR_MEASURED_RECOVERY_NOT_REQUIRED", "durable global claim");
  const claim = readLock(lockPath);
  successorExact(claim.authority_digest, canonicalDigest(inspectSuccessorMeasuredAuthority(authority)), "recovery authority");
  successorExact(claim.preparation_digest, preparation.preparation_digest, "recovery preparation");
  const beforeJournal = readJournalBase(journal, authority, preparation);
  const target = preparation.cases.find((entry) => entry.case_id === claim.case_id);
  if (!target) successorFail("SUCCESSOR_CASE_MISSING", "recovery case");
  successorExact(target.prompt_role, claim.prompt_role, "recovery role");
  const source = sources[target.prompt_role];
  const binding = source.scope.source.bindings.find((entry) => entry.successor_case_id === target.case_id);
  successorExact(binding?.source_case_id, claim.native_case_id, "recovery native case");
  const nativeClaimPath = resolve(source.execution.runDir, "cases", claim.native_case_id, "claim", "claim.json");
  if ((beforeJournal?.journal_digest ?? null) !== claim.pre_journal_digest) {
    // The terminal journal may have been committed by this controller or by
    // a peer with the same deterministic claim before this controller stopped.
    // Reverify the native collection and exact claim entry before unlocking.
    successorExact(beforeJournal?.entries.length, claim.pre_entry_count + 1, "recovery committed entry count");
    const after = await inspect(authority, preparation, sources, root);
    validateJournalAgainstInspection(beforeJournal, authority, preparation, sources, after);
    const prior = { control: { terminal_count: claim.pre_entry_count, control_digest: claim.pre_collection_digest } };
    successorExact(beforeJournal.entries.at(-1), terminalEntry({ preparation, sources, claim, before: prior, after }), "recovery committed claim entry");
    if (existsSync(nativeClaimPath)) successorFail("SUCCESSOR_UNCERTAIN_EXECUTION", "recovery committed native claim");
    releaseLock(lockPath);
    return {
      recovered_case_id: target.case_id,
      native_status: beforeJournal.entries.at(-1).status,
      collection: structuredClone(after.control),
      journal: beforeJournal,
      retry_performed: false,
      portfolio_mutation_authorized: false,
    };
  }
  successorExact(beforeJournal?.entries.length ?? 0, claim.pre_entry_count, "recovery pre-entry count");
  if (beforeJournal !== null) {
    successorExact(claim.pre_collection_digest, beforeJournal.collection_control_digest, "recovery pre-control");
  } else {
    successorExact(claim.pre_entry_count, 0, "recovery initial entry count");
  }
  if (existsSync(nativeClaimPath)) {
    const nativeClaim = parseJsonRejectDuplicateKeys(readFileSync(nativeClaimPath), "native recovery claim");
    recoverPortfolioCase({
      root,
      runDir: source.execution.runDir,
      caseId: claim.native_case_id,
      claimId: nativeClaim.claim_id,
      reason: "Issue #291 measured recovery: preserve the interrupted trial and never retry it.",
    });
  }
  const actual = inspectVerifiedPortfolioExecution({ ...source.execution, root });
  const current = actual.cases.find((entry) => entry.entry.case_id === claim.native_case_id);
  if (!current) successorFail("SUCCESSOR_CASE_MISSING", "recovery native execution");
  if (!["pending", "completed", "failed", "unavailable", "interrupted", "invalid"].includes(current.state.status)) {
    successorFail("SUCCESSOR_UNCERTAIN_EXECUTION", "recovery native status");
  }
  const after = await inspect(authority, preparation, sources, root);
  const entries = validateJournalAgainstInspection(beforeJournal, authority, preparation, sources, after, { allowOneUnjournaledTerminal: true });
  const delta = after.control.terminal_count - entries.length;
  if (![0, 1].includes(delta)) successorFail("SUCCESSOR_MEASURED_JOURNAL_DIVERGED", "recovery terminal delta");
  let nextEntries = entries;
  if (delta === 1) {
    const before = { control: { ...after.control, terminal_count: entries.length, control_digest: claim.pre_collection_digest } };
    nextEntries = [...entries, terminalEntry({ preparation, sources, claim, before, after })];
  } else {
    successorExact(current.state.status, "pending", "recovery without terminal evidence");
  }
  writeDurableJson(journal, journalSnapshot(authority, after, nextEntries));
  releaseLock(lockPath);
  return {
    recovered_case_id: target.case_id,
    native_status: current.state.status,
    collection: structuredClone(after.control),
    journal: readJournalBase(journal, authority, preparation),
    retry_performed: false,
    portfolio_mutation_authorized: false,
  };
}

export async function verifyMeasuredSuccessorCollection({
  authority, preparation, sources, root = ROOT,
}) {
  assertSuccessorMeasuredAuthority(authority, { preparation, sources });
  const journal = canonicalJournalPath(authority, preparation, sources);
  if (existsSync(`${journal}.lock`)) successorFail("SUCCESSOR_MEASURED_SESSION_LOCKED", "collection completion");
  const inspection = await inspect(authority, preparation, sources, root);
  const value = readJournalBase(journal, authority, preparation);
  const entries = validateJournalAgainstInspection(value, authority, preparation, sources, inspection);
  successorExact(inspection.control.status, "collected", "measured collection completion");
  successorExact(inspection.control.terminal_count, preparation.expected_case_count, "measured collection terminal count");
  successorExact(inspection.control.pending_count, 0, "measured collection pending count");
  successorExact(inspection.control.next_case_id, null, "measured collection next case");
  successorExact(inspection.control.stop_reasons, [], "measured collection stop reasons");
  successorExact(entries.length, preparation.expected_case_count, "measured journal complete inventory");
  successorExact(
    inspection.terminal_request_bindings,
    preparation.cases.map(({ case_id }) => ({ case_id, status: "verified" })),
    "measured collection request bindings",
  );
  const evidence = {
    schema_version: "1.0.0",
    kind: "prompt_successor_measured_collection_completion",
    authority_digest: canonicalDigest(inspectSuccessorMeasuredAuthority(authority)),
    preparation_digest: preparation.preparation_digest,
    collection_inspection_digest: inspection.inspection_digest,
    collection_control_digest: inspection.control.control_digest,
    journal_digest: value.journal_digest,
    terminal_count: inspection.control.terminal_count,
    source_scope_digests: Object.fromEntries(Object.entries(sources).map(([role, source]) => [role, source.scope.scope_digest])),
    durable_global_sequence_verified: true,
    all_requests_verified: true,
    automatic_retries: 0,
    measured_result_access_authorized: true,
    portfolio_mutation_authorized: false,
  };
  const handle = Object.freeze({ kind: "prompt_successor_measured_collection_completion_handle" });
  completionHandles.set(handle, evidence);
  return handle;
}

export function assertSuccessorMeasuredCompletion(handle, { authority, preparation, scope }) {
  const evidence = completionHandles.get(handle);
  if (!evidence) successorFail("SUCCESSOR_MEASURED_COLLECTION_REQUIRED", "opaque measured collection completion");
  assertSuccessorMeasuredSourceAuthority(authority, { preparation, scope });
  successorExact(evidence.authority_digest, canonicalDigest(inspectSuccessorMeasuredAuthority(authority)), "measured completion authority");
  successorExact(evidence.preparation_digest, preparation.preparation_digest, "measured completion preparation");
  successorExact(evidence.source_scope_digests[scope.prompt_role], scope.scope_digest, "measured completion source scope");
  successorExact(evidence.durable_global_sequence_verified, true, "measured completion sequence");
  successorExact(evidence.all_requests_verified, true, "measured completion requests");
  successorExact(evidence.terminal_count, preparation.expected_case_count, "measured completion inventory");
  return structuredClone(evidence);
}

export function inspectSuccessorMeasuredCompletion(handle) {
  const evidence = completionHandles.get(handle);
  if (!evidence) successorFail("SUCCESSOR_MEASURED_COLLECTION_REQUIRED", "opaque measured collection completion");
  return structuredClone(evidence);
}
