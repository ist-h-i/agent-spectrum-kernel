import { createHash } from "node:crypto";
import { parseJsonRejectDuplicateKeys, stableCanonicalJson } from "./content-addressed-store.mjs";

// Only the native Codex exec JSONL transport is accepted. This is observation,
// not provider billing authority, host attestation, or permission to run a trial.
export const SUCCESSOR_USAGE_PARSER_REVISION = "codex-exec-jsonl-usage-v2";
const LEGACY_PARSER_REVISION = "codex-exec-jsonl-usage-v1";
const MAX_STREAM_BYTES = 20 * 1024 * 1024;
const METRICS = ["input_tokens", "output_tokens", "cached_tokens", "total_tokens"];
const REASONS = new Set(["process_incomplete", "stream_invalid", "turn_incomplete", "ambiguous_turn", "invalid_usage", "usage_field_unavailable"]);
const PROVIDER_REASONS = new Set(["subscription_usage_limit", "provider_rate_limit"]);
const PROVIDER_UNKNOWN_REASONS = new Set(["process_incomplete", "stream_invalid", "terminal_failure_unclassified"]);
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
const providerNotDetected = () => ({ status: "not_detected", reason: null });
const providerDetected = (reason) => ({ status: "detected", reason });
const providerUnknown = (reason) => ({ status: "unknown", reason });

function allUnknown(source_stdout, reason, providerStop = providerUnknown(
  reason === "process_incomplete" ? "process_incomplete" : "stream_invalid",
)) {
  return {
    schema_version: "1.1.0", parser_revision: SUCCESSOR_USAGE_PARSER_REVISION, source_stdout,
    provider_stop: providerStop,
    metrics: Object.fromEntries(METRICS.map((name) => [name, unknown(reason)])),
  };
}

function scalar(value) {
  return typeof value === "string" ? value : null;
}

/**
 * Codex exec currently does not guarantee a stable machine-readable error code
 * in every JSONL failure. Inspect only top-level terminal-error fields; never
 * scan agent message content. Detection is deliberately narrow and the raw
 * provider message is not persisted.
 */
function classifyProviderStop(event) {
  const error = event?.error && typeof event.error === "object" && !Array.isArray(event.error) ? event.error : null;
  const typed = [
    scalar(event?.codex_error_info), scalar(error?.codex_error_info),
    scalar(event?.code), scalar(error?.code), scalar(event?.error_code), scalar(error?.error_code),
  ].filter(Boolean).map((value) => value.toLowerCase());
  if (typed.some((value) => ["usage_limit_exceeded", "usage_limit_reached", "quota_exceeded"].includes(value))) {
    return providerDetected("subscription_usage_limit");
  }
  if (typed.some((value) => ["rate_limit_exceeded", "rate_limited", "too_many_requests"].includes(value))) {
    return providerDetected("provider_rate_limit");
  }
  const message = [scalar(event?.message), scalar(error?.message)].filter(Boolean).join(" ");
  if (/\b(?:you(?:'ve| have) hit your usage limit|usage limit (?:has been )?(?:exceeded|reached))\b/iu.test(message)) {
    return providerDetected("subscription_usage_limit");
  }
  if (/\b(?:rate limit (?:has been )?exceeded|too many requests)\b/iu.test(message)) {
    return providerDetected("provider_rate_limit");
  }
  return providerUnknown("terminal_failure_unclassified");
}

function combineProviderStop(current, next) {
  if (current.status === "not_detected") return next;
  if (next.status === "not_detected") return current;
  if (current.status === "detected" && next.status === "unknown") return current;
  if (current.status === "unknown" && next.status === "detected") return next;
  if (current.status === "detected" && next.status === "detected" && current.reason === next.reason) return current;
  return providerUnknown("terminal_failure_unclassified");
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
  if (!text.endsWith("\n")) return allUnknown(source, "stream_invalid");
  let starts = 0; let completions = 0; let threads = 0; let usage;
  let terminalFailure = false;
  let providerStop = providerNotDetected();
  try {
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const event = parseJsonRejectDuplicateKeys(line, "Codex usage event");
      if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.type !== "string") return allUnknown(source, "stream_invalid");
      if (event.type === "thread.started") {
        if (++threads > 1 || starts || completions || terminalFailure) return allUnknown(source, "ambiguous_turn");
      } else if (event.type === "turn.started") {
        if (++starts > 1 || completions || terminalFailure) return allUnknown(source, "ambiguous_turn");
      } else if (event.type === "turn.completed") {
        if (starts !== 1 || ++completions !== 1 || terminalFailure) return allUnknown(source, "ambiguous_turn");
        usage = event.usage;
      } else if (event.type === "turn.failed" || event.type === "error") {
        if (completions) return allUnknown(source, "ambiguous_turn");
        terminalFailure = true;
        providerStop = combineProviderStop(providerStop, classifyProviderStop(event));
      } else if (completions || terminalFailure) {
        return allUnknown(source, "ambiguous_turn");
      }
    }
  } catch { return allUnknown(source, "stream_invalid"); }
  if (terminalFailure) return allUnknown(source, "turn_incomplete", providerStop.status === "not_detected" ? providerUnknown("terminal_failure_unclassified") : providerStop);
  if (starts !== 1 || completions !== 1) return allUnknown(source, "turn_incomplete", providerUnknown("terminal_failure_unclassified"));
  if (!usage || typeof usage !== "object" || Array.isArray(usage) || !count(usage.input_tokens) || !count(usage.output_tokens)) return allUnknown(source, "invalid_usage", providerNotDetected());
  const total = usage.input_tokens + usage.output_tokens;
  if (!count(total) || (usage.cached_input_tokens !== undefined && (!count(usage.cached_input_tokens) || usage.cached_input_tokens > usage.input_tokens))) {
    return allUnknown(source, "invalid_usage", providerNotDetected());
  }
  return {
    schema_version: "1.1.0", parser_revision: SUCCESSOR_USAGE_PARSER_REVISION, source_stdout: source,
    provider_stop: providerNotDetected(),
    metrics: {
      input_tokens: known(usage.input_tokens), output_tokens: known(usage.output_tokens),
      cached_tokens: usage.cached_input_tokens === undefined ? unknown("usage_field_unavailable") : known(usage.cached_input_tokens),
      total_tokens: known(total),
    },
  };
}

function validateMetrics(value) {
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
}

/** Semantic validation supplements the result schema and terminal commit hash. */
export function validateSuccessorUsage(value, { stdout } = {}) {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "receipt");
  const legacy = value.schema_version === "1.0.0" && value.parser_revision === LEGACY_PARSER_REVISION;
  const current = value.schema_version === "1.1.0" && value.parser_revision === SUCCESSOR_USAGE_PARSER_REVISION;
  requireThat(legacy || current, "version");
  closed(value, current
    ? ["schema_version", "parser_revision", "source_stdout", "provider_stop", "metrics"]
    : ["schema_version", "parser_revision", "source_stdout", "metrics"], "receipt");
  closed(value.source_stdout, ["bytes", "sha256"], "stdout");
  requireThat(count(value.source_stdout.bytes) && /^[a-f0-9]{64}$/u.test(value.source_stdout.sha256), "stdout identity");
  if (stdout !== undefined) requireThat(stableCanonicalJson(value.source_stdout) === stableCanonicalJson(stdout), "stdout binding");
  if (current) {
    closed(value.provider_stop, ["status", "reason"], "provider stop");
    const p = value.provider_stop;
    requireThat(
      (p.status === "not_detected" && p.reason === null)
      || (p.status === "detected" && PROVIDER_REASONS.has(p.reason))
      || (p.status === "unknown" && PROVIDER_UNKNOWN_REASONS.has(p.reason)),
      "provider stop classification",
    );
  }
  validateMetrics(value);
  return value;
}
