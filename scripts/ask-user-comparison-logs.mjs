import assert from "node:assert/strict";

export const VERIFICATION_STREAM_BYTE_LIMIT = 10 * 1024 * 1024;
export const VERIFICATION_VIEW_BYTE_LIMIT = 16 * 1024 * 1024;

// Never cut inside a UTF-8 sequence: decoding a sliced buffer could add replacement
// characters whose encoding exceeds the nominal bound or changes saved evidence.
function utf8Prefix(value, limit) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= limit) return value;
  let end = limit;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString("utf8");
}

/** Bounded log storage/views only. Process exit and structured grading stay owned
 * by the controller; a truncated review view is not a failed test execution. */
export function boundedVerificationLogs(stdout, stderr, {
  sanitize = value => value,
  streamLimit = VERIFICATION_STREAM_BYTE_LIMIT,
  viewLimit = VERIFICATION_VIEW_BYTE_LIMIT,
  captureTruncated = false,
} = {}) {
  assert.equal(typeof sanitize, "function", "log sanitizer must be a function");
  assert.ok(Number.isSafeInteger(streamLimit) && streamLimit >= 0 && streamLimit <= VERIFICATION_STREAM_BYTE_LIMIT,
    "verification stream bound must be 0–10 MiB");
  assert.ok(Number.isSafeInteger(viewLimit) && viewLimit >= 0 && viewLimit <= VERIFICATION_VIEW_BYTE_LIMIT,
    "verification view bound must be 0–16 MiB");
  assert.ok(typeof captureTruncated === "boolean" || (captureTruncated && typeof captureTruncated === "object"
    && !Array.isArray(captureTruncated) && Object.keys(captureTruncated).every(key => ["stdout", "stderr"].includes(key))
    && Object.values(captureTruncated).every(value => typeof value === "boolean")), "invalid capture truncation evidence");

  const saveStream = (input, name) => {
    assert.ok(input == null || typeof input === "string" || Buffer.isBuffer(input), "verification logs must be strings or buffers");
    const captured = Buffer.isBuffer(input) ? input : Buffer.from(input ?? "", "utf8");
    const decoded = captured.toString("utf8");
    const redacted = sanitize(decoded);
    assert.equal(typeof redacted, "string", "log sanitizer must return a string");
    const saved = utf8Prefix(redacted, streamLimit);
    const metadata = {
      captured_bytes: captured.length,
      redacted_bytes: Buffer.byteLength(redacted, "utf8"),
      saved_bytes: Buffer.byteLength(saved, "utf8"),
      // The runner's aggregate outputLimited flag proves at least one stream
      // was cut, but cannot establish which one. Do not invent that detail.
      capture_truncated: typeof captureTruncated === "boolean" ? (captureTruncated ? null : false) : captureTruncated[name] ?? false,
      capture_truncation_unknown: captureTruncated === true,
      redacted: redacted !== decoded,
      saved_truncated: saved !== redacted,
      encoding_loss: !Buffer.from(decoded, "utf8").equals(captured),
    };
    metadata.truncated = metadata.capture_truncated === true || metadata.capture_truncation_unknown || metadata.saved_truncated || metadata.encoding_loss;
    return { saved, metadata };
  };
  const out = saveStream(stdout, "stdout"), err = saveStream(stderr, "stderr");
  const fullEvidence = !out.metadata.truncated && !err.metadata.truncated;
  const combined = `${out.saved}\n${err.saved}`;
  const viewTruncated = Buffer.byteLength(combined, "utf8") > viewLimit;
  const marker = `\n[verification review view truncated; ${fullEvidence
    ? "complete bounded stdout/stderr artifacts are available" : "stream evidence is incomplete"}]\n`;
  const footer = viewTruncated ? utf8Prefix(marker, viewLimit) : "";
  const view = viewTruncated
    ? utf8Prefix(combined, viewLimit - Buffer.byteLength(footer, "utf8")) + footer : combined;
  return { stdout: out.saved, stderr: err.saved, view, metadata: {
    format: "ask_bounded_verification_logs_v1",
    stream_limit_bytes: streamLimit,
    view_limit_bytes: viewLimit,
    capture_truncated: typeof captureTruncated === "boolean" ? captureTruncated : Object.values(captureTruncated).some(Boolean),
    stdout: out.metadata,
    stderr: err.metadata,
    view: { source_bytes: Buffer.byteLength(combined, "utf8"), saved_bytes: Buffer.byteLength(view, "utf8"), truncated: viewTruncated },
    full_evidence_available: fullEvidence,
  } };
}
