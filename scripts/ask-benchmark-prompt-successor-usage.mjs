import { createHash } from "node:crypto";
import { parseJsonRejectDuplicateKeys, stableCanonicalJson } from "./content-addressed-store.mjs";

// Only the native Codex exec JSONL transport is accepted. This is observation,
// not provider billing authority, host attestation, or permission to run a trial.
export const SUCCESSOR_USAGE_PARSER_REVISION = "codex-exec-jsonl-usage-v1";
const MAX_STREAM_BYTES = 20 * 1024 * 1024;
const METRICS = ["input_tokens", "output_tokens", "cached_tokens", "total_tokens"];
const REASONS = new Set(["process_incomplete", "stream_invalid", "turn_incomplete", "ambiguous_turn", "invalid_usage", "usage_field_unavailable"]);
const known = (value) => ({ status: "known", value, reason: null });
const unknown = (reason) => ({ status: "unknown", value: null, reason });
const count = (value) => Number.isSafeInteger(value) && value >= 0;
function requireThat(condition, label) {
  if (!condition) throw new Error(`invalid successor usage: ${label}`);
}
function closed(value, keys, label) {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), label);
  requireThat(stableCanonicalJson(Object.keys(value).sort()) === stableCanonicalJson([...keys].sort()), `${label} keys`);
}
function allUnknown(source_stdout, reason) {
  return { schema_version: "1.0.0", parser_revision: SUCCESSOR_USAGE_PARSER_REVISION, source_stdout,
    metrics: Object.fromEntries(METRICS.map((name) => [name, unknown(reason)])) };
}

/** Capture at the runner boundary, before stdout is reduced to its digest. */
export function captureSuccessorUsage(processResult) {
  const stream = processResult?.stdout ?? "";
  const bytes = Buffer.from(stream);
  const source = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  if (!processResult || !Number.isInteger(processResult.status) || processResult.error || processResult.signal || processResult.workspace_descendants_detected) {
    return allUnknown(source, "process_incomplete");
  }
  if (bytes.length === 0 || bytes.length > MAX_STREAM_BYTES) return allUnknown(source, "stream_invalid");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return allUnknown(source, "stream_invalid"); }
  // A cut-off last line is not a complete transport, even when its visible
  // prefix happens to contain a usable-looking usage object.
  if (!text.endsWith("\n")) return allUnknown(source, "stream_invalid");
  let starts = 0; let completions = 0; let threads = 0; let usage;
  try {
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const event = parseJsonRejectDuplicateKeys(line, "Codex usage event");
      if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.type !== "string") return allUnknown(source, "stream_invalid");
      if (event.type === "thread.started") {
        if (++threads > 1 || starts || completions) return allUnknown(source, "ambiguous_turn");
      } else if (event.type === "turn.started") {
        if (++starts > 1 || completions) return allUnknown(source, "ambiguous_turn");
      } else if (event.type === "turn.completed") {
        if (starts !== 1 || ++completions !== 1) return allUnknown(source, "ambiguous_turn");
        usage = event.usage;
      } else if (event.type === "turn.failed" || event.type === "error") {
        return allUnknown(source, "turn_incomplete");
      } else if (completions) {
        return allUnknown(source, "ambiguous_turn");
      }
    }
  } catch { return allUnknown(source, "stream_invalid"); }
  if (starts !== 1 || completions !== 1) return allUnknown(source, "turn_incomplete");
  if (!usage || typeof usage !== "object" || Array.isArray(usage) || !count(usage.input_tokens) || !count(usage.output_tokens)) return allUnknown(source, "invalid_usage");
  const total = usage.input_tokens + usage.output_tokens;
  if (!count(total) || (usage.cached_input_tokens !== undefined && (!count(usage.cached_input_tokens) || usage.cached_input_tokens > usage.input_tokens))) return allUnknown(source, "invalid_usage");
  // Cached input is a subset of input, and reasoning is a subset of output.
  // Neither is added again to the operational total.
  return { schema_version: "1.0.0", parser_revision: SUCCESSOR_USAGE_PARSER_REVISION, source_stdout: source, metrics: {
    input_tokens: known(usage.input_tokens), output_tokens: known(usage.output_tokens),
    cached_tokens: usage.cached_input_tokens === undefined ? unknown("usage_field_unavailable") : known(usage.cached_input_tokens),
    total_tokens: known(total),
  } };
}

/** Semantic validation supplements the result schema and terminal commit hash. */
export function validateSuccessorUsage(value, { stdout } = {}) {
  closed(value, ["schema_version", "parser_revision", "source_stdout", "metrics"], "receipt");
  requireThat(value.schema_version === "1.0.0" && value.parser_revision === SUCCESSOR_USAGE_PARSER_REVISION, "version");
  closed(value.source_stdout, ["bytes", "sha256"], "stdout");
  requireThat(count(value.source_stdout.bytes) && /^[a-f0-9]{64}$/u.test(value.source_stdout.sha256), "stdout identity");
  if (stdout !== undefined) requireThat(stableCanonicalJson(value.source_stdout) === stableCanonicalJson(stdout), "stdout binding");
  closed(value.metrics, METRICS, "metrics");
  for (const metric of Object.values(value.metrics)) {
    closed(metric, ["status", "value", "reason"], "metric");
    requireThat(metric.status === "known" ? count(metric.value) && metric.reason === null
      : metric.status === "unknown" && metric.value === null && REASONS.has(metric.reason), "typed metric");
  }
  const { input_tokens: input, output_tokens: output, cached_tokens: cached, total_tokens: total } = value.metrics;
  if (total.status === "known") {
    requireThat(value.source_stdout.bytes > 0 && value.source_stdout.bytes <= MAX_STREAM_BYTES, "observed stream size");
    requireThat(input.status === "known" && output.status === "known" && count(input.value + output.value) && total.value === input.value + output.value, "total");
    requireThat(cached.status === "known" ? cached.value <= input.value : cached.reason === "usage_field_unavailable", "cached subset");
  } else {
    requireThat(Object.values(value.metrics).every((metric) => metric.status === "unknown" && metric.reason === total.reason) && total.reason !== "usage_field_unavailable", "unknown total");
  }
  return value;
}
