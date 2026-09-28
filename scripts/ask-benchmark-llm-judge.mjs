import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import {
  assertNoSymlinkPathSegments,
  canonicalDigest,
  parseJsonRejectDuplicateKeys,
  putContentAddressedJson,
  readContentAddressedJson,
  readJsonFileStrict,
  readStableBytes,
  stableCanonicalJson,
  writeCanonicalJsonNoReplace,
} from "./content-addressed-store.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const JUDGE_RESPONSE_SCHEMA_PATH = "benchmarks/schemas/llm-judge-response.schema.json";
export const JUDGE_INSTRUCTION_PATH = "docs/prompt-successor-llm-judge.md";
const RESPONSE_SCHEMA_BYTES = readStableBytes(resolve(REPOSITORY_ROOT, JUDGE_RESPONSE_SCHEMA_PATH), "Judge response schema");
const RESPONSE_SCHEMA = parseJsonRejectDuplicateKeys(RESPONSE_SCHEMA_BYTES, "Judge response schema");
const RESPONSE_SCHEMA_DIGEST = rawDigest(RESPONSE_SCHEMA_BYTES);
const SLOTS = Object.freeze(["A", "B"]);
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const CRITERION_ID = /^[a-z][a-z0-9_-]{0,95}$/u;
const SAMPLE_ID = /^sample-[a-f0-9]{32}$/u;
const ROLE_MARKERS = /\b(?:current_prompt|prompt_v2)\b|\bprompt\s*role\s*:/iu;
const TERMINAL_STATUSES = new Set(["completed", "timeout", "transport_error", "auth_failed", "provider_limit", "response_too_large", "token_limit"]);
const MAX_LEDGER_BYTES = 4 * 1024 * 1024;

export class JudgeUnresolvedError extends Error {
  constructor(code) {
    super(`Judge outcome is unresolved: ${code}`);
    this.name = "JudgeUnresolvedError";
    this.code = code;
  }
}

export class JudgeAuthorityError extends Error {
  constructor(code) {
    super(`Judge authority rejected: ${code}`);
    this.name = "JudgeAuthorityError";
    this.code = code;
  }
}

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function authority(condition, code) {
  if (!condition) throw new JudgeAuthorityError(code);
}

function unresolved(condition, code) {
  if (!condition) throw new JudgeUnresolvedError(code);
}

function closed(value, keys, code) {
  authority(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, code);
  authority(Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)), code);
}

function nonempty(value, code, max = 8192) {
  authority(typeof value === "string" && value.length > 0 && value.length <= max, code);
}

function digest(value, code) {
  authority(typeof value === "string" && DIGEST.test(value), code);
}

function positiveInteger(value, code, max = Number.MAX_SAFE_INTEGER) {
  authority(Number.isSafeInteger(value) && value > 0 && value <= max, code);
}

function decodeExact(bytes, code) {
  authority(Buffer.isBuffer(bytes), code);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new JudgeUnresolvedError("invalid_utf8_output");
  }
  unresolved(Buffer.compare(Buffer.from(text, "utf8"), bytes) === 0, "output_byte_conversion");
  return text;
}

function boundedText(value, code, max = 1024 * 1024) {
  unresolved(typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= max, code);
  unresolved(Buffer.from(value, "utf8").toString("utf8") === value, "invalid_text_encoding");
  return value;
}

function assertNoRoleMarkers(text, privateMarkers) {
  unresolved(!ROLE_MARKERS.test(text), "blindness_violation");
  for (const marker of privateMarkers) {
    authority(typeof marker === "string" && marker.length > 0, "invalid_private_marker");
    unresolved(!text.toLowerCase().includes(marker.toLowerCase()), "blindness_violation");
  }
}

function lineCount(text) {
  return text.split("\n").length;
}

function assertRuntimeProfile(profile) {
  closed(profile, ["authority_profile", "provider", "model", "native_identity_digest", "runtime_config_digest", "observed_revision", "transport_kind", "tools_disabled", "fresh_process_per_slot", "workspace_isolated", "response_format_json"], "runtime_profile_shape");
  authority(["synthetic_only", "live_native"].includes(profile.authority_profile), "runtime_authority_profile");
  nonempty(profile.provider, "runtime_provider", 128);
  nonempty(profile.model, "runtime_model", 128);
  digest(profile.native_identity_digest, "runtime_native_identity_digest");
  digest(profile.runtime_config_digest, "runtime_config_digest");
  nonempty(profile.observed_revision, "runtime_observed_revision", 128);
  authority(profile.tools_disabled === true && profile.fresh_process_per_slot === true && profile.workspace_isolated === true && profile.response_format_json === true, "runtime_isolation_missing");
  authority(profile.transport_kind === (profile.authority_profile === "live_native" ? "native_cli" : "fake_adapter"), "runtime_transport_kind");
  if (profile.authority_profile === "live_native") {
    authority(profile.provider !== "fake" && profile.model !== "scripted", "live_runtime_unconfigured");
  } else {
    authority(profile.provider === "fake" && profile.model === "scripted", "fake_runtime_mismatch");
  }
}

function assertLimits(limits) {
  closed(limits, ["max_packet_bytes", "max_response_bytes", "timeout_ms", "max_input_tokens_per_call", "max_output_tokens_per_call", "max_total_tokens", "max_samples", "max_calls", "unknown_token_policy"], "limits_shape");
  positiveInteger(limits.max_packet_bytes, "packet_limit", 32 * 1024 * 1024);
  positiveInteger(limits.max_response_bytes, "response_limit", 4 * 1024 * 1024);
  positiveInteger(limits.timeout_ms, "timeout_limit", 3_600_000);
  positiveInteger(limits.max_input_tokens_per_call, "input_token_limit");
  positiveInteger(limits.max_output_tokens_per_call, "output_token_limit");
  positiveInteger(limits.max_total_tokens, "total_token_limit");
  positiveInteger(limits.max_samples, "sample_limit", 100_000);
  authority(limits.max_calls === 2 * limits.max_samples, "fixed_two_slot_call_limit");
  authority(["stop_remaining", "charge_maximum"].includes(limits.unknown_token_policy), "unknown_token_policy");
}

function assertCriteria(criteria) {
  authority(Array.isArray(criteria) && criteria.length > 0 && criteria.length <= 128, "criteria_inventory");
  const ids = new Set();
  for (const criterion of criteria) {
    closed(criterion, ["criterion_id", "rubric"], "criterion_shape");
    authority(typeof criterion.criterion_id === "string" && CRITERION_ID.test(criterion.criterion_id) && !ids.has(criterion.criterion_id), "criterion_id");
    nonempty(criterion.rubric, "criterion_rubric", 16000);
    ids.add(criterion.criterion_id);
  }
}

/** The protocol is frozen before measured output exists. No future response digest is an input. */
export function createJudgeProtocol({ criteria, instructionText, sourceDigest, targetManifestDigest, runtimeProfile, limits }) {
  assertCriteria(criteria);
  boundedText(instructionText, "judge_instruction_missing", 64 * 1024);
  digest(sourceDigest, "protocol_source_digest");
  digest(targetManifestDigest, "protocol_target_manifest_digest");
  assertRuntimeProfile(runtimeProfile);
  assertLimits(limits);
  const body = {
    schema_version: "1.0.0",
    kind: "llm_judge_protocol",
    source_digest: sourceDigest,
    target_manifest_digest: targetManifestDigest,
    rubric_digest: canonicalDigest(criteria),
    criteria,
    instruction_text: instructionText,
    instruction_digest: rawDigest(Buffer.from(instructionText, "utf8")),
    response_schema_path: JUDGE_RESPONSE_SCHEMA_PATH,
    response_schema_digest: RESPONSE_SCHEMA_DIGEST,
    runtime_profile: runtimeProfile,
    limits,
    slot_count: 2,
    resolution_rule: "two_matching_decisive_v1",
    blindness_rule: "reject_role_markers_no_rewrite_v1",
  };
  return { ...body, protocol_digest: canonicalDigest(body) };
}

export function verifyJudgeProtocol(protocol) {
  closed(protocol, ["schema_version", "kind", "source_digest", "target_manifest_digest", "rubric_digest", "criteria", "instruction_text", "instruction_digest", "response_schema_path", "response_schema_digest", "runtime_profile", "limits", "slot_count", "resolution_rule", "blindness_rule", "protocol_digest"], "protocol_shape");
  const expected = createJudgeProtocol({ criteria: protocol.criteria, instructionText: protocol.instruction_text, sourceDigest: protocol.source_digest, targetManifestDigest: protocol.target_manifest_digest, runtimeProfile: protocol.runtime_profile, limits: protocol.limits });
  authority(stableCanonicalJson(expected) === stableCanonicalJson(protocol), "protocol_digest_or_contract");
  return protocol;
}

/** Document IDs are assigned here, so caller-provided case/run names never enter the visible packet. */
export function buildJudgePacket({ protocol, sampleId, task, documents, verifiedFacts = [], originalOutputBytes, privateMarkers = [] }) {
  verifyJudgeProtocol(protocol);
  authority(typeof sampleId === "string" && SAMPLE_ID.test(sampleId), "anonymous_sample_id");
  authority(Array.isArray(documents) && documents.length > 0 && documents.length <= 98, "document_inventory");
  authority(Array.isArray(verifiedFacts) && Array.isArray(privateMarkers), "packet_input_shape");
  const outputText = decodeExact(originalOutputBytes, "original_output_bytes");
  boundedText(outputText, "empty_or_large_output", protocol.limits.max_packet_bytes);
  boundedText(task, "task_missing", protocol.limits.max_packet_bytes);
  const visibleDocuments = documents.map((document, index) => {
    closed(document, ["kind", "text"], "document_shape");
    authority(["source", "specification", "execution_evidence"].includes(document.kind), "document_kind");
    boundedText(document.text, "document_missing", protocol.limits.max_packet_bytes);
    return { document_id: `doc-${String(index + 1).padStart(3, "0")}`, kind: document.kind, text: document.text, line_count: lineCount(document.text) };
  });
  authority(visibleDocuments.some((document) => document.kind === "source"), "source_document_missing");
  visibleDocuments.push({ document_id: "target-output", kind: "target_output", text: outputText, line_count: lineCount(outputText) });
  const visibleFacts = verifiedFacts.map((fact) => {
    closed(fact, ["text", "document_index", "start_line", "end_line"], "verified_fact_shape");
    boundedText(fact.text, "verified_fact_text", 4000);
    authority(Number.isSafeInteger(fact.document_index) && fact.document_index >= 0 && fact.document_index < documents.length, "verified_fact_document");
    const document = visibleDocuments[fact.document_index];
    authority(Number.isSafeInteger(fact.start_line) && Number.isSafeInteger(fact.end_line) && fact.start_line >= 1 && fact.end_line >= fact.start_line && fact.end_line <= document.line_count, "verified_fact_range");
    return { text: fact.text, document_id: document.document_id, start_line: fact.start_line, end_line: fact.end_line };
  });
  for (const value of [task, ...visibleDocuments.map((document) => document.text), ...visibleFacts.map((fact) => fact.text)]) assertNoRoleMarkers(value, privateMarkers);
  const packet = {
    schema_version: "1.0.0",
    kind: "llm_judge_packet",
    sample_id: sampleId,
    protocol_digest: protocol.protocol_digest,
    task,
    criteria: protocol.criteria,
    documents: visibleDocuments,
    verified_facts: visibleFacts,
    response_schema: RESPONSE_SCHEMA,
  };
  unresolved(Buffer.byteLength(stableCanonicalJson(packet), "utf8") <= protocol.limits.max_packet_bytes, "packet_too_large");
  return { packet, packet_digest: canonicalDigest(packet), original_output_digest: rawDigest(originalOutputBytes) };
}

function verifyPacket(protocol, packet) {
  closed(packet, ["schema_version", "kind", "sample_id", "protocol_digest", "task", "criteria", "documents", "verified_facts", "response_schema"], "packet_shape");
  authority(packet.schema_version === "1.0.0" && packet.kind === "llm_judge_packet" && packet.protocol_digest === protocol.protocol_digest, "packet_protocol");
  authority(typeof packet.sample_id === "string" && SAMPLE_ID.test(packet.sample_id), "packet_sample_id");
  authority(stableCanonicalJson(packet.criteria) === stableCanonicalJson(protocol.criteria), "packet_criteria");
  authority(stableCanonicalJson(packet.response_schema) === stableCanonicalJson(RESPONSE_SCHEMA), "packet_response_schema");
  authority(Array.isArray(packet.documents) && packet.documents.length >= 2, "packet_documents");
  authority(packet.documents.at(-1)?.document_id === "target-output" && packet.documents.at(-1)?.kind === "target_output", "packet_target_output");
  const rebuilt = buildJudgePacket({
    protocol,
    sampleId: packet.sample_id,
    task: packet.task,
    documents: packet.documents.slice(0, -1).map((document) => ({ kind: document.kind, text: document.text })),
    verifiedFacts: packet.verified_facts.map((fact) => ({ text: fact.text, document_index: Number(fact.document_id.slice(4)) - 1, start_line: fact.start_line, end_line: fact.end_line })),
    originalOutputBytes: Buffer.from(packet.documents.at(-1).text, "utf8"),
  });
  authority(stableCanonicalJson(rebuilt.packet) === stableCanonicalJson(packet), "packet_reconstruction");
  return rebuilt;
}

export function createJudgeRequest({ protocol, packet, privateBinding, originalOutputDigest }) {
  verifyJudgeProtocol(protocol);
  const rebuilt = verifyPacket(protocol, packet);
  closed(privateBinding, ["fixture_id", "prompt_role", "run_id", "case_id", "attempt", "sample_index", "normalized_result_digest", "source_snapshot_digest", "original_evaluation_digest", "original_output_digest", "freeze_digest"], "private_binding_shape");
  for (const key of ["fixture_id", "run_id", "case_id", "attempt"]) nonempty(privateBinding[key], `private_binding_${key}`, 256);
  authority(["current_prompt", "prompt_v2"].includes(privateBinding.prompt_role), "private_binding_role");
  authority(Number.isSafeInteger(privateBinding.sample_index) && privateBinding.sample_index >= 0 && privateBinding.sample_index < protocol.limits.max_samples, "private_binding_sample_index");
  for (const key of ["normalized_result_digest", "source_snapshot_digest", "original_evaluation_digest", "original_output_digest", "freeze_digest"]) digest(privateBinding[key], `private_binding_${key}`);
  authority(originalOutputDigest === rebuilt.original_output_digest, "request_original_output_digest");
  authority(privateBinding.original_output_digest === originalOutputDigest, "private_binding_output_digest");
  authority(privateBinding.run_id.length >= 8 && privateBinding.case_id.length >= 8, "private_binding_marker_length");
  for (const value of [packet.task, ...packet.documents.map((document) => document.text), ...packet.verified_facts.map((fact) => fact.text)]) {
    assertNoRoleMarkers(value, [privateBinding.run_id, privateBinding.case_id]);
  }
  const body = {
    schema_version: "1.0.0", kind: "llm_judge_request", protocol_digest: protocol.protocol_digest,
    packet_digest: rebuilt.packet_digest, sample_id: packet.sample_id,
    original_output_digest: originalOutputDigest, private_binding: privateBinding,
  };
  return { ...body, request_digest: canonicalDigest(body) };
}

function verifyRequest(protocol, packet, request) {
  closed(request, ["schema_version", "kind", "protocol_digest", "packet_digest", "sample_id", "original_output_digest", "private_binding", "request_digest"], "request_shape");
  const expected = createJudgeRequest({ protocol, packet, privateBinding: request.private_binding, originalOutputDigest: request.original_output_digest });
  authority(stableCanonicalJson(expected) === stableCanonicalJson(request), "request_digest_or_binding");
  return request;
}

function responseAssert(condition, code) {
  if (!condition) throw new JudgeUnresolvedError(code);
}

function responseClosed(value, keys) {
  responseAssert(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, "invalid_response_shape");
  responseAssert(Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)), "invalid_response_shape");
}

/** JSON, duplicate keys, UTF-8, exact criterion inventory, line ranges, and quotes are checked here. */
export function parseJudgeResponse({ protocol, packet, rawResponseBytes }) {
  verifyJudgeProtocol(protocol);
  verifyPacket(protocol, packet);
  responseAssert(Buffer.isBuffer(rawResponseBytes) && rawResponseBytes.length > 0 && rawResponseBytes.length <= protocol.limits.max_response_bytes, "invalid_response_size");
  let response;
  try {
    response = parseJsonRejectDuplicateKeys(rawResponseBytes, "Judge response");
  } catch {
    throw new JudgeUnresolvedError("invalid_response_json");
  }
  responseClosed(response, ["schema_version", "sample_id", "criteria"]);
  responseAssert(response.schema_version === "1.0.0" && response.sample_id === packet.sample_id, "invalid_response_identity");
  responseAssert(Array.isArray(response.criteria) && response.criteria.length === protocol.criteria.length, "invalid_response_criteria");
  const expected = new Set(protocol.criteria.map((criterion) => criterion.criterion_id));
  const seen = new Set();
  const documents = new Map(packet.documents.map((document) => [document.document_id, document]));
  for (const item of response.criteria) {
    responseClosed(item, ["criterion_id", "verdict", "reason_code", "brief_rationale", "evidence_references", "examined_documents"]);
    responseAssert(expected.has(item.criterion_id) && !seen.has(item.criterion_id), "invalid_response_criteria");
    seen.add(item.criterion_id);
    responseAssert(["pass", "fail", "abstain"].includes(item.verdict), "invalid_response_verdict");
    const reasons = {
      pass: ["satisfied"],
      fail: ["missing", "contradiction", "incorrect_fact"],
      abstain: ["insufficient_context", "ambiguous"],
    };
    responseAssert(reasons[item.verdict].includes(item.reason_code), "invalid_response_reason");
    responseAssert(typeof item.brief_rationale === "string" && item.brief_rationale.trim().length > 0 && item.brief_rationale.length <= 1200, "invalid_response_rationale");
    responseAssert(Array.isArray(item.evidence_references) && item.evidence_references.length <= 24, "invalid_response_references");
    responseAssert(Array.isArray(item.examined_documents) && item.examined_documents.length <= 24 && new Set(item.examined_documents).size === item.examined_documents.length, "invalid_response_examined_scope");
    for (const documentId of item.examined_documents) responseAssert(documents.has(documentId), "invalid_response_examined_scope");
    if (item.verdict === "pass" || (item.verdict === "fail" && item.reason_code !== "missing")) responseAssert(item.evidence_references.length > 0, "invalid_response_missing_evidence");
    if (item.reason_code === "missing") responseAssert(item.examined_documents.includes("target-output"), "invalid_response_missing_scope");
    for (const reference of item.evidence_references) {
      responseClosed(reference, ["document_id", "start_line", "end_line", "quote"]);
      const document = documents.get(reference.document_id);
      responseAssert(document !== undefined, "invalid_response_document_reference");
      responseAssert(Number.isSafeInteger(reference.start_line) && Number.isSafeInteger(reference.end_line) && reference.start_line >= 1 && reference.end_line >= reference.start_line && reference.end_line <= document.line_count, "invalid_response_line_range");
      responseAssert(typeof reference.quote === "string" && reference.quote.length > 0 && reference.quote.length <= 1200, "invalid_response_quote");
      const citedText = document.text.split("\n").slice(reference.start_line - 1, reference.end_line).join("\n");
      responseAssert(citedText.includes(reference.quote), "invalid_response_quote");
    }
  }
  responseAssert(seen.size === expected.size, "invalid_response_criteria");
  try {
    assertBenchmarkSchemaInstance(response, { schemaPath: resolve(REPOSITORY_ROOT, JUDGE_RESPONSE_SCHEMA_PATH), label: "Judge response" });
  } catch {
    throw new JudgeUnresolvedError("invalid_response_schema");
  }
  return response;
}

function receiptRuntime(profile, observed) {
  closed(observed, ["provider", "model", "native_identity_digest", "runtime_config_digest", "observed_revision", "session_id", "process_id", "tools_disabled", "fresh_process", "workspace_isolated"], "receipt_runtime_shape");
  for (const key of ["provider", "model", "native_identity_digest", "runtime_config_digest", "observed_revision"]) authority(observed[key] === profile[key], `receipt_runtime_${key}`);
  nonempty(observed.session_id, "receipt_session_id", 256);
  positiveInteger(observed.process_id, "receipt_process_id");
  authority(observed.tools_disabled === true && observed.fresh_process === true && observed.workspace_isolated === true, "receipt_runtime_isolation");
}

function tokenUsage(tokens) {
  closed(tokens, ["input", "output", "total"], "receipt_tokens_shape");
  for (const value of Object.values(tokens)) authority(value === null || (Number.isSafeInteger(value) && value >= 0), "receipt_tokens_value");
  if (tokens.input !== null && tokens.output !== null && tokens.total !== null) authority(tokens.total >= tokens.input + tokens.output, "receipt_token_total");
}

function exceedsPerCallTokenLimit(tokens, limits) {
  return (tokens.input !== null && tokens.input > limits.max_input_tokens_per_call)
    || (tokens.output !== null && tokens.output > limits.max_output_tokens_per_call);
}

function createReceipt({ protocol, request, packet, claim, slot, result, errorCode = null }) {
  let status;
  let runtime = null;
  let rawBytes = null;
  let exitCode = null;
  let signal = null;
  let timedOut = false;
  let durationMs = 0;
  let tokens = { input: null, output: null, total: null };
  if (errorCode) {
    status = ["AUTH_FAILED", "PROVIDER_LIMIT"].includes(errorCode) ? errorCode.toLowerCase() : "transport_error";
  } else {
    closed(result, ["rawResponseBytes", "exitCode", "signal", "timedOut", "durationMs", "tokens", "runtime"], "adapter_result_shape");
    authority(Buffer.isBuffer(result.rawResponseBytes), "adapter_raw_response_bytes");
    authority(result.exitCode === null || (Number.isSafeInteger(result.exitCode) && result.exitCode >= 0), "adapter_exit_code");
    authority(result.signal === null || typeof result.signal === "string", "adapter_signal");
    authority(typeof result.timedOut === "boolean", "adapter_timeout");
    authority(Number.isSafeInteger(result.durationMs) && result.durationMs >= 0, "adapter_duration");
    tokenUsage(result.tokens);
    receiptRuntime(protocol.runtime_profile, result.runtime);
    ({ rawResponseBytes: rawBytes, exitCode, signal, timedOut, durationMs, tokens, runtime } = result);
    status = timedOut ? "timeout" : exitCode !== 0 || signal !== null ? "transport_error" : "completed";
    if (status === "completed" && durationMs > protocol.limits.timeout_ms) status = "timeout";
    if (rawBytes.length > protocol.limits.max_response_bytes) status = "response_too_large";
    if (exceedsPerCallTokenLimit(tokens, protocol.limits)) status = "token_limit";
  }
  const savedBytes = rawBytes && rawBytes.length > protocol.limits.max_response_bytes ? null : rawBytes;
  const body = {
    schema_version: "1.0.0", kind: "llm_judge_receipt", protocol_digest: protocol.protocol_digest,
    request_digest: request.request_digest, packet_digest: canonicalDigest(packet), claim_digest: claim.claim_digest,
    slot, authority_profile: protocol.runtime_profile.authority_profile, status,
    runtime, exit_code: exitCode, signal, timed_out: timedOut, duration_ms: durationMs,
    tokens, raw_response_base64: savedBytes?.toString("base64") ?? null,
    raw_response_digest: rawBytes ? rawDigest(rawBytes) : null,
    raw_response_bytes: rawBytes?.length ?? null,
  };
  return { ...body, receipt_digest: canonicalDigest(body) };
}

function verifyReceipt({ protocol, request, packet, receipt, slot }) {
  closed(receipt, ["schema_version", "kind", "protocol_digest", "request_digest", "packet_digest", "claim_digest", "slot", "authority_profile", "status", "runtime", "exit_code", "signal", "timed_out", "duration_ms", "tokens", "raw_response_base64", "raw_response_digest", "raw_response_bytes", "receipt_digest"], "receipt_shape");
  const { receipt_digest: receiptDigest, ...body } = receipt;
  authority(receiptDigest === canonicalDigest(body), "receipt_digest");
  authority(receipt.schema_version === "1.0.0" && receipt.kind === "llm_judge_receipt", "receipt_version");
  authority(receipt.protocol_digest === protocol.protocol_digest && receipt.request_digest === request.request_digest && receipt.packet_digest === canonicalDigest(packet) && receipt.slot === slot, "receipt_request_binding");
  authority(receipt.authority_profile === protocol.runtime_profile.authority_profile, "receipt_authority_profile");
  authority(receipt.claim_digest === makeClaim(protocol, request, packet, slot).claim_digest, "receipt_claim_digest");
  authority(TERMINAL_STATUSES.has(receipt.status), "receipt_status");
  if (receipt.runtime !== null) receiptRuntime(protocol.runtime_profile, receipt.runtime);
  tokenUsage(receipt.tokens);
  const exceededTokens = exceedsPerCallTokenLimit(receipt.tokens, protocol.limits);
  if (exceededTokens) authority(receipt.status === "token_limit", "receipt_token_limit_status");
  authority(Number.isSafeInteger(receipt.duration_ms) && receipt.duration_ms >= 0 && typeof receipt.timed_out === "boolean", "receipt_execution_shape");
  authority(receipt.exit_code === null || (Number.isSafeInteger(receipt.exit_code) && receipt.exit_code >= 0), "receipt_exit_code");
  authority(receipt.signal === null || typeof receipt.signal === "string", "receipt_signal");
  if (receipt.raw_response_base64 === null) {
    const noRaw = receipt.raw_response_digest === null && receipt.raw_response_bytes === null;
    authority(noRaw ? !["response_too_large", "token_limit"].includes(receipt.status)
      : ["response_too_large", "token_limit"].includes(receipt.status)
        && typeof receipt.raw_response_digest === "string"
        && Number.isSafeInteger(receipt.raw_response_bytes)
        && receipt.raw_response_bytes > protocol.limits.max_response_bytes, "receipt_raw_absence");
  } else {
    authority(typeof receipt.raw_response_base64 === "string" && /^[A-Za-z0-9+/]*={0,2}$/u.test(receipt.raw_response_base64), "receipt_raw_base64");
    const bytes = Buffer.from(receipt.raw_response_base64, "base64");
    authority(bytes.toString("base64") === receipt.raw_response_base64 && bytes.length === receipt.raw_response_bytes && rawDigest(bytes) === receipt.raw_response_digest, "receipt_raw_digest");
    authority(bytes.length <= protocol.limits.max_response_bytes, "receipt_raw_limit");
  }
  if (receipt.status === "completed") authority(receipt.runtime !== null && receipt.exit_code === 0 && receipt.signal === null && receipt.timed_out === false && receipt.raw_response_base64 !== null, "receipt_completed_execution");
  if (receipt.status === "timeout") authority(receipt.timed_out || receipt.duration_ms > protocol.limits.timeout_ms, "receipt_timeout_status");
  if (receipt.status === "response_too_large") authority(receipt.raw_response_base64 === null && receipt.raw_response_bytes > protocol.limits.max_response_bytes, "receipt_response_size_status");
  if (receipt.status === "token_limit") authority(exceededTokens, "receipt_token_limit_status");
  return receipt;
}

function classifySlot({ protocol, request, packet, receipt, slot, state }) {
  if (!receipt) return { state, response: null, reason: state === "ambiguous" || state === "reserved" ? "ambiguous_call" : state === "budget_blocked" ? "judge_budget_blocked" : "missing_receipt" };
  verifyReceipt({ protocol, request, packet, receipt, slot });
  if (receipt.status !== "completed") return { state: "unresolved_terminal", response: null, reason: receipt.status === "timeout" ? "judge_timeout" : receipt.status === "response_too_large" ? "judge_response_too_large" : receipt.status };
  try {
    return { state: "verified", response: parseJudgeResponse({ protocol, packet, rawResponseBytes: Buffer.from(receipt.raw_response_base64, "base64") }), reason: null };
  } catch (error) {
    if (!(error instanceof JudgeUnresolvedError)) throw error;
    return { state: "response_invalid", response: null, reason: error.code };
  }
}

/** Pure, deterministic resolution. The caller must supply receipts from the trusted external ledger. */
export function resolveJudgeResponses({ protocol, request, packet, receipts, slotStates = { A: "not_started", B: "not_started" } }) {
  verifyJudgeProtocol(protocol);
  authority(protocol.runtime_profile.authority_profile === "synthetic_only", "live_receipt_authority_unavailable");
  verifyRequest(protocol, packet, request);
  closed(receipts, SLOTS, "receipts_shape");
  closed(slotStates, SLOTS, "slot_states_shape");
  const classified = Object.fromEntries(SLOTS.map((slot) => [slot, classifySlot({ protocol, request, packet, receipt: receipts[slot], slot, state: slotStates[slot] })]));
  const both = classified.A.response && classified.B.response;
  const sessionsIsolated = !both || (
    receipts.A.runtime.session_id !== receipts.B.runtime.session_id &&
    receipts.A.runtime.process_id !== receipts.B.runtime.process_id
  );
  const criteria = protocol.criteria.map(({ criterion_id: criterionId }) => {
    if (!sessionsIsolated) return { criterion_id: criterionId, verdict: "abstain", reason_code: "session_not_isolated" };
    const left = classified.A.response?.criteria.find((item) => item.criterion_id === criterionId);
    const right = classified.B.response?.criteria.find((item) => item.criterion_id === criterionId);
    if (!left || !right) return { criterion_id: criterionId, verdict: "abstain", reason_code: classified.A.reason ?? classified.B.reason ?? "missing_receipt" };
    if (left.verdict === right.verdict && left.verdict !== "abstain") return { criterion_id: criterionId, verdict: left.verdict, reason_code: "two_slot_agreement" };
    return { criterion_id: criterionId, verdict: "abstain", reason_code: left.verdict !== "abstain" && right.verdict !== "abstain" ? "disagreement" : "judge_abstain" };
  });
  const body = {
    schema_version: "1.0.0", kind: "llm_judge_resolution", authority_profile: protocol.runtime_profile.authority_profile,
    protocol_digest: protocol.protocol_digest, request_digest: request.request_digest, packet_digest: canonicalDigest(packet),
    receipt_digests: { A: receipts.A?.receipt_digest ?? null, B: receipts.B?.receipt_digest ?? null },
    slot_states: { A: classified.A.state, B: classified.B.state },
    criteria, overall_status: criteria.every((item) => item.verdict !== "abstain") ? "resolved" : "unresolved",
  };
  return { ...body, resolution_digest: canonicalDigest(body) };
}

export function verifyJudgeResolution({ protocol, request, packet, receipts, resolution, slotStates = { A: "not_started", B: "not_started" } }) {
  const expected = resolveJudgeResponses({ protocol, request, packet, receipts, slotStates });
  authority(stableCanonicalJson(resolution) === stableCanonicalJson(expected), "resolution_rederivation");
  return expected;
}

function makeClaim(protocol, request, packet, slot) {
  const body = {
    schema_version: "1.0.0", kind: "llm_judge_claim", protocol_digest: protocol.protocol_digest,
    request_digest: request.request_digest, packet_digest: canonicalDigest(packet), slot,
  };
  return { ...body, claim_digest: canonicalDigest(body) };
}

function ensureExternalRoot(storeRoot, protocol, { create = false } = {}) {
  authority(typeof storeRoot === "string" && isAbsolute(storeRoot) && resolve(storeRoot) === storeRoot, "judge_store_root_absolute");
  const relativePath = relative(REPOSITORY_ROOT, storeRoot);
  authority(relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath), "judge_store_root_must_be_external");
  assertNoSymlinkPathSegments(storeRoot, "Judge external root", { allowMissingLeaf: create });
  if (create) mkdirSync(storeRoot, { recursive: true, mode: 0o700 });
  assertNoSymlinkPathSegments(storeRoot, "Judge external root");
  authority(statSync(storeRoot).isDirectory(), "judge_store_root_directory");
  return resolve(storeRoot, "judge", "v1", protocol.protocol_digest.slice(7));
}

function paths(root, request, slot) {
  const sample = resolve(root, "samples", String(request.private_binding.sample_index).padStart(6, "0"));
  return {
    sample,
    binding: resolve(sample, "request-binding.json"),
    claim: resolve(sample, `slot-${slot}.claim.json`),
    started: resolve(sample, `slot-${slot}.started.json`),
    receipt: resolve(sample, `slot-${slot}.receipt.json`),
    blocked: resolve(sample, `slot-${slot}.blocked.json`),
  };
}

function readIfPresent(path, label) {
  return existsSync(path) ? readJsonFileStrict(path, label, MAX_LEDGER_BYTES) : null;
}

function checkedSlot(root, protocol, request, packet, slot) {
  const location = paths(root, request, slot);
  const expectedClaim = makeClaim(protocol, request, packet, slot);
  const claim = readIfPresent(location.claim, `Judge ${slot} claim`);
  const started = readIfPresent(location.started, `Judge ${slot} start`);
  const receipt = readIfPresent(location.receipt, `Judge ${slot} receipt`);
  const blocked = readIfPresent(location.blocked, `Judge ${slot} block`);
  authority(!blocked || !claim, "blocked_slot_has_claim");
  if (claim) authority(stableCanonicalJson(claim) === stableCanonicalJson(expectedClaim), "stored_claim_binding");
  if (started) {
    authority(claim !== null, "start_without_claim");
    authority(stableCanonicalJson(started) === stableCanonicalJson({ schema_version: "1.0.0", kind: "llm_judge_started", claim_digest: claim.claim_digest }), "stored_start_binding");
  }
  if (receipt) {
    authority(claim !== null && started !== null, "receipt_without_start");
    verifyReceipt({ protocol, request, packet, receipt, slot });
  }
  if (blocked) {
    closed(blocked, ["schema_version", "kind", "request_digest", "slot", "reason_code", "block_digest"], "blocked_record_shape");
    const { block_digest: blockDigest, ...body } = blocked;
    authority(blockDigest === canonicalDigest(body) && blocked.schema_version === "1.0.0" && blocked.kind === "llm_judge_block" && blocked.request_digest === request.request_digest && blocked.slot === slot, "blocked_record_binding");
  }
  const state = receipt ? "response_saved" : started ? "ambiguous" : claim ? "reserved" : blocked ? "budget_blocked" : "not_started";
  return { claim, receipt, blocked, state, location };
}

function budgetSnapshot(root, protocol) {
  const samplesRoot = resolve(root, "samples");
  if (!existsSync(samplesRoot)) return { calls: 0, tokens: 0 };
  assertNoSymlinkPathSegments(samplesRoot, "Judge sample root");
  let calls = 0;
  let tokens = 0;
  for (const entry of readdirSync(samplesRoot, { withFileTypes: true })) {
    authority(entry.isDirectory() && /^[0-9]{6}$/u.test(entry.name), "judge_sample_directory");
    const sample = resolve(samplesRoot, entry.name);
    for (const slot of SLOTS) {
      const claim = readIfPresent(resolve(sample, `slot-${slot}.claim.json`), "Judge budget claim");
      if (!claim) continue;
      authority(claim.protocol_digest === protocol.protocol_digest, "judge_budget_protocol_binding");
      calls += 1;
      const receipt = readIfPresent(resolve(sample, `slot-${slot}.receipt.json`), "Judge budget receipt");
      if (!receipt) throw new JudgeUnresolvedError("previous_call_ambiguous_or_running");
      authority(receipt.claim_digest === claim.claim_digest && receipt.authority_profile === protocol.runtime_profile.authority_profile, "judge_budget_receipt_binding");
      const { receipt_digest: receiptDigest, ...receiptBody } = receipt;
      authority(receiptDigest === canonicalDigest(receiptBody), "judge_budget_receipt_digest");
      tokenUsage(receipt.tokens);
      authority(TERMINAL_STATUSES.has(receipt.status), "judge_budget_receipt_status");
      if (["auth_failed", "provider_limit", "token_limit"].includes(receipt.status))
        throw new JudgeUnresolvedError("judge_global_stop");
      if (receipt.tokens?.total === null || receipt.tokens?.total === undefined) {
        if (protocol.limits.unknown_token_policy === "stop_remaining") throw new JudgeUnresolvedError("token_usage_unknown");
        tokens += protocol.limits.max_input_tokens_per_call + protocol.limits.max_output_tokens_per_call;
        continue;
      }
      authority(Number.isSafeInteger(receipt.tokens.total) && receipt.tokens.total >= 0, "judge_budget_token_value");
      tokens += receipt.tokens.total;
    }
  }
  return { calls, tokens };
}

function withBudgetLock(root, action) {
  assertNoSymlinkPathSegments(root, "Judge ledger root", { allowMissingLeaf: true });
  mkdirSync(root, { recursive: true, mode: 0o700 });
  assertNoSymlinkPathSegments(root, "Judge ledger root");
  const lock = resolve(root, ".budget-lock");
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") throw new JudgeUnresolvedError("budget_locked");
    throw error;
  }
  try {
    return action();
  } finally {
    rmdirSync(lock);
  }
}

function reserveSlot(root, protocol, request, packet, slot) {
  return withBudgetLock(root, () => {
    assertQualificationRequest(root, protocol, request);
    const current = checkedSlot(root, protocol, request, packet, slot);
    if (current.claim || current.blocked) return false;
    const budget = budgetSnapshot(root, protocol);
    unresolved(budget.calls < protocol.limits.max_calls, "judge_call_limit");
    unresolved(budget.tokens + protocol.limits.max_input_tokens_per_call + protocol.limits.max_output_tokens_per_call <= protocol.limits.max_total_tokens, "judge_token_limit");
    const claim = makeClaim(protocol, request, packet, slot);
    const written = writeCanonicalJsonNoReplace({ outputPath: current.location.claim, artifact: claim, label: "Judge slot claim" });
    return written.created;
  });
}

function blockSlot(root, request, slot, reasonCode) {
  const location = paths(root, request, slot);
  const body = { schema_version: "1.0.0", kind: "llm_judge_block", request_digest: request.request_digest, slot, reason_code: reasonCode };
  writeCanonicalJsonNoReplace({ outputPath: location.blocked, artifact: { ...body, block_digest: canonicalDigest(body) }, label: "Judge slot block" });
}

function storeBindings(storeRoot, root, protocol, request, packet) {
  for (const artifact of [protocol, packet, request]) putContentAddressedJson({ storeRoot, artifact, digest: canonicalDigest(artifact), maximumBytes: 32 * 1024 * 1024 });
  const location = paths(root, request, "A");
  const body = { schema_version: "1.0.0", kind: "llm_judge_sample_binding", protocol_digest: protocol.protocol_digest, packet_digest: canonicalDigest(packet), request_digest: request.request_digest };
  writeCanonicalJsonNoReplace({ outputPath: location.binding, artifact: { ...body, binding_digest: canonicalDigest(body) }, label: "Judge sample binding" });
}

function verifyStoredBindings(storeRoot, root, protocol, request, packet) {
  const location = paths(root, request, "A");
  const binding = readIfPresent(location.binding, "Judge sample binding");
  authority(binding !== null, "missing_judge_sample_binding");
  const { binding_digest: bindingDigest, ...body } = binding;
  authority(bindingDigest === canonicalDigest(body) && body.schema_version === "1.0.0" && body.kind === "llm_judge_sample_binding" && body.protocol_digest === protocol.protocol_digest && body.packet_digest === canonicalDigest(packet) && body.request_digest === request.request_digest, "stored_sample_binding");
  for (const artifact of [protocol, packet, request]) {
    const stored = readContentAddressedJson({ storeRoot, digest: canonicalDigest(artifact), maximumBytes: 32 * 1024 * 1024 }).value;
    authority(stableCanonicalJson(stored) === stableCanonicalJson(artifact), "stored_content_binding");
  }
}

/** Reopen saved evidence and rederive the same result. This function never invokes an adapter. */
export function reopenJudgeResolution({ storeRoot, protocol, request, packet }) {
  verifyJudgeProtocol(protocol);
  authority(protocol.runtime_profile.authority_profile === "synthetic_only", "live_receipt_authority_unavailable");
  verifyRequest(protocol, packet, request);
  const root = ensureExternalRoot(storeRoot, protocol);
  verifyStoredBindings(storeRoot, root, protocol, request, packet);
  const slots = Object.fromEntries(SLOTS.map((slot) => [slot, checkedSlot(root, protocol, request, packet, slot)]));
  const receipts = { A: slots.A.receipt, B: slots.B.receipt };
  const slotStates = { A: slots.A.state, B: slots.B.state };
  const resolution = resolveJudgeResponses({ protocol, request, packet, receipts, slotStates });
  return { resolution, receipts, slot_states: slotStates };
}

/** Trusted caller supplies a native CLI adapter or a separately marked fake. Each slot can invoke at most once. */
export async function runJudgeSlots({ storeRoot, protocol, request, packet, adapter }) {
  verifyJudgeProtocol(protocol);
  verifyRequest(protocol, packet, request);
  // A caller-controlled function and metadata cannot establish a live model call.
  // Enable live execution only with an in-module native runner whose process,
  // configuration, and response capture are observed rather than asserted.
  authority(protocol.runtime_profile.authority_profile === "synthetic_only", "live_native_adapter_unavailable");
  authority(adapter && typeof adapter === "object" && typeof adapter.invoke === "function", "judge_adapter_missing");
  authority(adapter.kind === "fake_adapter", "judge_adapter_profile_mismatch");
  const root = ensureExternalRoot(storeRoot, protocol, { create: true });
  assertQualificationRequest(root, protocol, request);
  storeBindings(storeRoot, root, protocol, request, packet);
  for (const slot of SLOTS) {
    let current = checkedSlot(root, protocol, request, packet, slot);
    if (current.receipt) {
      if (["auth_failed", "provider_limit", "token_limit"].includes(current.receipt.status)) break;
      continue;
    }
    if (current.claim || current.blocked) break;
    try {
      if (!reserveSlot(root, protocol, request, packet, slot)) break;
    } catch (error) {
      if (!(error instanceof JudgeUnresolvedError)) throw error;
      if (error.code !== "budget_locked" && error.code !== "previous_call_ambiguous_or_running") blockSlot(root, request, slot, error.code);
      break;
    }
    current = checkedSlot(root, protocol, request, packet, slot);
    const started = { schema_version: "1.0.0", kind: "llm_judge_started", claim_digest: current.claim.claim_digest };
    writeCanonicalJsonNoReplace({ outputPath: current.location.started, artifact: started, label: "Judge slot start" });
    let result;
    let errorCode = null;
    try {
      result = await adapter.invoke({ protocol, packet, request, slot });
    } catch (error) {
      errorCode = ["AUTH_FAILED", "PROVIDER_LIMIT"].includes(error?.code) ? error.code : "TRANSPORT_ERROR";
    }
    const receipt = createReceipt({ protocol, request, packet, claim: current.claim, slot, result, errorCode });
    writeCanonicalJsonNoReplace({ outputPath: current.location.receipt, artifact: receipt, label: "Judge slot receipt" });
    putContentAddressedJson({ storeRoot, artifact: receipt, digest: canonicalDigest(receipt), maximumBytes: MAX_LEDGER_BYTES });
    if (["auth_failed", "provider_limit", "token_limit"].includes(receipt.status)) break;
  }
  const reopened = reopenJudgeResolution({ storeRoot, protocol, request, packet });
  putContentAddressedJson({ storeRoot, artifact: reopened.resolution, digest: canonicalDigest(reopened.resolution), maximumBytes: MAX_LEDGER_BYTES });
  return reopened;
}


function qualificationInventory(root, protocol) {
  const record = readIfPresent(resolve(root, "qualification-binding.json"), "Judge qualification binding");
  if (record === null) return null;
  closed(record, ["schema_version", "kind", "protocol_digest", "plan_digest", "requests", "binding_digest"], "qualification_binding_shape");
  const { binding_digest: bindingDigest, ...body } = record;
  authority(record.schema_version === "1.0.0" && record.kind === "llm_judge_qualification_binding"
    && record.protocol_digest === protocol.protocol_digest && bindingDigest === canonicalDigest(body), "qualification_binding_identity");
  digest(record.plan_digest, "qualification_plan_digest");
  authority(Array.isArray(record.requests) && record.requests.length === protocol.limits.max_samples, "qualification_inventory_size");
  const seen = new Set();
  for (const [index, item] of record.requests.entries()) {
    closed(item, ["sample_index", "request_digest"], "qualification_request_shape");
    digest(item.request_digest, "qualification_request_digest");
    authority(item.sample_index === index && !seen.has(item.request_digest), "qualification_request_inventory");
    seen.add(item.request_digest);
  }
  return record;
}

function assertQualificationRequest(root, protocol, request) {
  const record = qualificationInventory(root, protocol);
  if (record !== null) authority(record.requests[request.private_binding.sample_index]?.request_digest
    === request.request_digest, "qualification_request_not_frozen");
}

/** Uses the claim lock: a qualification label inventory cannot be sealed after a call. */
export function sealJudgeQualificationInventory({ storeRoot, protocol, planBody, requests }) {
  const planDigest = canonicalDigest(planBody);
  verifyJudgeProtocol(protocol);
  digest(planDigest, "qualification_plan_digest");
  const root = ensureExternalRoot(storeRoot, protocol, { create: true });
  const body = { schema_version: "1.0.0", kind: "llm_judge_qualification_binding",
    protocol_digest: protocol.protocol_digest, plan_digest: planDigest, requests };
  const record = { ...body, binding_digest: canonicalDigest(body) };
  // Validate before writing, including the complete unique contiguous inventory.
  authority(Array.isArray(requests) && requests.length === protocol.limits.max_samples, "qualification_inventory_size");
  const seen = new Set();
  for (const [index, item] of requests.entries()) {
    closed(item, ["sample_index", "request_digest"], "qualification_request_shape");
    digest(item.request_digest, "qualification_request_digest");
    authority(item.sample_index === index && !seen.has(item.request_digest), "qualification_request_inventory");
    seen.add(item.request_digest);
  }
  authority(Buffer.byteLength(stableCanonicalJson(record)) <= MAX_LEDGER_BYTES, "qualification_binding_too_large");
  authority(Buffer.byteLength(stableCanonicalJson(planBody)) <= 64 * 1024 * 1024, "qualification_plan_too_large");
  return withBudgetLock(root, () => {
    const previous = qualificationInventory(root, protocol);
    if (previous !== null) {
      authority(stableCanonicalJson(previous) === stableCanonicalJson(record), "qualification_already_frozen");
      const saved = readContentAddressedJson({ storeRoot, digest: planDigest, maximumBytes: 64 * 1024 * 1024 });
      authority(stableCanonicalJson(saved.value) === stableCanonicalJson(planBody), "qualification_plan_reopen");
      return structuredClone(previous);
    }
    const samplesRoot = resolve(root, "samples");
    assertNoSymlinkPathSegments(samplesRoot, "qualification samples", { allowMissingLeaf: true });
    authority(!existsSync(samplesRoot) || readdirSync(samplesRoot).length === 0, "qualification_must_precede_calls");
    putContentAddressedJson({ storeRoot, artifact: planBody, digest: planDigest, maximumBytes: 64 * 1024 * 1024 });
    writeCanonicalJsonNoReplace({ outputPath: resolve(root, "qualification-binding.json"),
      artifact: record, label: "Judge qualification binding" });
    return structuredClone(record);
  });
}

export function readJudgeQualificationInventory({ storeRoot, protocol }) {
  verifyJudgeProtocol(protocol);
  const record = qualificationInventory(ensureExternalRoot(storeRoot, protocol), protocol);
  authority(record !== null, "qualification_not_frozen");
  return structuredClone(record);
}
