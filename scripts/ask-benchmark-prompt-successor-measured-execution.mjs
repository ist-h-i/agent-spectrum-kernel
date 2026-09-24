import { randomUUID } from "node:crypto";
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, parseJsonRejectDuplicateKeys, stableCanonicalJson, assertNoSymlinkPathSegments } from "./content-addressed-store.mjs";
import { successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";
import { assertSuccessorMeasuredAuthority, inspectSuccessorMeasuredAuthority } from "./ask-benchmark-prompt-successor-measured-authority.mjs";
import { inspectSuccessorCollectionControl } from "./ask-benchmark-prompt-successor-collection.mjs";
import { openSuccessorPromptInput } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { executePortfolio, inspectVerifiedPortfolioExecution, recoverPortfolioCase } from "./ask-benchmark-execution.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;

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

function lockRecord(authority, preparation, caseId, role, nativeCaseId, beforeDigest) {
  const body = {
    schema_version: "1.0.0",
    kind: "prompt_successor_measured_claim",
    authority_digest: canonicalDigest(inspectSuccessorMeasuredAuthority(authority)),
    preparation_digest: preparation.preparation_digest,
    case_id: caseId,
    prompt_role: role,
    native_case_id: nativeCaseId,
    pre_collection_digest: beforeDigest,
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
  const bytes = readFileSync(path);
  if (bytes.length < 2 || bytes.length > 64 * 1024) successorFail("SUCCESSOR_JOURNAL_SIZE", "measured claim");
  const value = parseJsonRejectDuplicateKeys(bytes, "measured claim");
  const { claim_digest: digest, ...body } = value;
  successorExact(canonicalDigest(body), digest, "measured claim digest");
  return value;
}

function releaseLock(path) {
  unlinkSync(path);
  const directory = openSync(dirname(path), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function journalSnapshot(authority, inspection) {
  const control = inspection.control;
  const body = {
    schema_version: "1.0.0",
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
    portfolio_mutation_authorized: false,
  };
  return { ...body, journal_digest: canonicalDigest(body) };
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
  authority, preparation, sources, journalPath, root = ROOT,
}) {
  assertSuccessorMeasuredAuthority(authority, { preparation, sources });
  successorExact(resolve(root), ROOT, "measured execution root");
  const journal = safeJournalPath(journalPath);
  const lockPath = `${journal}.lock`;
  if (existsSync(lockPath)) successorFail("SUCCESSOR_MEASURED_SESSION_LOCKED", "durable global claim");
  const before = await inspect(authority, preparation, sources, root);
  if (before.control.status !== "ready_for_authorized_claim" || !before.control.next_case_id) {
    successorFail("SUCCESSOR_MEASURED_STOPPED", before.control.stop_reasons.join(",") || before.control.status);
  }
  const target = preparation.cases.find((entry) => entry.case_id === before.control.next_case_id);
  if (!target) successorFail("SUCCESSOR_CASE_MISSING", "measured next case");
  const source = sources[target.prompt_role];
  const binding = source.scope.source.bindings.find((entry) => entry.successor_case_id === target.case_id);
  if (!binding) successorFail("SUCCESSOR_CASE_MISSING", "measured native binding");
  const claim = lockRecord(authority, preparation, target.case_id, target.prompt_role, binding.source_case_id, before.control.control_digest);
  acquireLock(lockPath, claim);
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
    const completed = after.control.cases.find((entry) => entry.case_id === target.case_id);
    if (!completed || ["pending", "active"].includes(completed.status)) successorFail("SUCCESSOR_UNCERTAIN_EXECUTION", "claimed case lacks terminal evidence");
    writeDurableJson(journal, journalSnapshot(authority, after));
    releaseLock(lockPath);
    return {
      case_id: target.case_id,
      prompt_role: target.prompt_role,
      native_case_id: binding.source_case_id,
      outcome: structuredClone(output),
      collection: structuredClone(after.control),
      journal: parseJsonRejectDuplicateKeys(readFileSync(journal), "measured journal"),
      model_call_authorized_by_issue_291: true,
      automatic_retry_performed: false,
      portfolio_mutation_authorized: false,
    };
  } catch (error) {
    // A crash/exception after the durable global claim must leave the claim in
    // place. Recovery reopens native evidence; it never starts the case again.
    throw error;
  }
}

export async function recoverMeasuredSuccessorSession({
  authority, preparation, sources, journalPath, root = ROOT,
}) {
  assertSuccessorMeasuredAuthority(authority, { preparation, sources });
  const journal = safeJournalPath(journalPath);
  const lockPath = `${journal}.lock`;
  if (!existsSync(lockPath)) successorFail("SUCCESSOR_MEASURED_RECOVERY_NOT_REQUIRED", "durable global claim");
  const claim = readLock(lockPath);
  successorExact(claim.authority_digest, canonicalDigest(inspectSuccessorMeasuredAuthority(authority)), "recovery authority");
  successorExact(claim.preparation_digest, preparation.preparation_digest, "recovery preparation");
  const target = preparation.cases.find((entry) => entry.case_id === claim.case_id);
  if (!target) successorFail("SUCCESSOR_CASE_MISSING", "recovery case");
  successorExact(target.prompt_role, claim.prompt_role, "recovery role");
  const source = sources[target.prompt_role];
  const binding = source.scope.source.bindings.find((entry) => entry.successor_case_id === target.case_id);
  successorExact(binding?.source_case_id, claim.native_case_id, "recovery native case");
  const actual = inspectVerifiedPortfolioExecution({ ...source.execution, root });
  const current = actual.cases.find((entry) => entry.entry.case_id === claim.native_case_id);
  if (!current) successorFail("SUCCESSOR_CASE_MISSING", "recovery native execution");
  if (current.state.status === "active") {
    const claimPath = resolve(source.execution.runDir, "cases", claim.native_case_id, "claim", "claim.json");
    const nativeClaim = parseJsonRejectDuplicateKeys(readFileSync(claimPath), "native recovery claim");
    recoverPortfolioCase({
      root,
      runDir: source.execution.runDir,
      caseId: claim.native_case_id,
      claimId: nativeClaim.claim_id,
      reason: "Issue #291 measured recovery: preserve the interrupted trial and never retry it.",
    });
  } else if (current.state.status !== "pending" && !["completed", "failed", "unavailable", "interrupted", "invalid"].includes(current.state.status)) {
    successorFail("SUCCESSOR_UNCERTAIN_EXECUTION", "recovery native status");
  }
  const after = await inspect(authority, preparation, sources, root);
  writeDurableJson(journal, journalSnapshot(authority, after));
  releaseLock(lockPath);
  return {
    recovered_case_id: target.case_id,
    native_status: current.state.status,
    collection: structuredClone(after.control),
    journal: parseJsonRejectDuplicateKeys(readFileSync(journal), "measured journal"),
    retry_performed: false,
    portfolio_mutation_authorized: false,
  };
}
