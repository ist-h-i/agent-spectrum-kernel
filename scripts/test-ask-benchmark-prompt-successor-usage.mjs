import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { captureSuccessorUsage, validateSuccessorUsage } from "./ask-benchmark-prompt-successor-usage.mjs";

function stream(usage = { input_tokens: 100, output_tokens: 20, cached_input_tokens: 80 }, extras = []) {
  return [
    { type: "thread.started", thread_id: "synthetic-thread" }, { type: "turn.started" },
    ...extras, { type: "turn.completed", usage },
  ].map((event) => JSON.stringify(event)).join("\n") + "\n";
}
function capture(stdout, overrides = {}) {
  return captureSuccessorUsage({ stdout, status: 0, signal: null, error: null, workspace_descendants_detected: false, ...overrides });
}
function allUnknown(value) {
  for (const metric of Object.values(value.metrics)) {
    assert.equal(metric.status, "unknown"); assert.equal(metric.value, null);
  }
}

test("captures bounded native JSONL usage, retaining cached tokens without double counting", () => {
  const stdout = stream(); const value = capture(stdout);
  assert.deepEqual(value.metrics.input_tokens, { status: "known", value: 100, reason: null });
  assert.equal(value.metrics.output_tokens.value, 20);
  assert.equal(value.metrics.cached_tokens.value, 80);
  assert.equal(value.metrics.total_tokens.value, 120);
  assert.deepEqual(value.source_stdout, { bytes: Buffer.byteLength(stdout), sha256: createHash("sha256").update(stdout).digest("hex") });
  assert.equal(value.schema_version, "1.1.0");
  assert.equal(value.parser_revision, "codex-exec-jsonl-usage-v2");
  assert.deepEqual(value.provider_stop, { status: "not_detected", reason: null });
  validateSuccessorUsage(value, { stdout: value.source_stdout });
  assert.equal(JSON.stringify(value).includes("synthetic-thread"), false, "no thread IDs or raw model text are persisted");
});

test("literal zero is observed, while an omitted cached count remains unknown", () => {
  const value = capture(stream({ input_tokens: 0, output_tokens: 0 }));
  assert.equal(value.metrics.total_tokens.value, 0);
  assert.deepEqual(value.metrics.cached_tokens, { status: "unknown", value: null, reason: "usage_field_unavailable" });
});

test("nonzero exit after a complete turn does not erase observed usage", () => {
  assert.equal(capture(stream(), { status: 7 }).metrics.total_tokens.value, 120);
});

for (const [name, override] of [
  ["timeout", { error: { code: "ETIMEDOUT" } }], ["signal", { signal: "SIGTERM", status: null }],
  ["truncated output", { error: { code: "ENOBUFS" } }], ["unknown exit", { status: null }],
  ["residual child", { workspace_descendants_detected: true }],
]) test(`${name} cannot use a completion-looking event as complete usage`, () => {
  const value = capture(stream(), override); allUnknown(value);
  assert.equal(value.metrics.total_tokens.reason, "process_incomplete");
});

for (const [name, stdout] of [
  ["empty stream", ""], ["partial JSON line", stream().slice(0, -3)], ["non-JSON output", `garbage\n${stream()}`],
  ["no terminal event", '{"type":"turn.started"}\n'],
  ["multiple turns", stream() + stream()],
  ["nested usage in model text", '{"type":"turn.started"}\n' + JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: stream() } }) + '\n'],
  ["failed turn", stream().replace('"turn.completed"', '"turn.failed"')],
  ["started after completion", stream() + '{"type":"turn.started"}\n'],
  ["usage before start", '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n'],
  ["duplicate keys", stream().replace('"input_tokens":100', '"input_tokens":100,"input_tokens":1')],
  ["negative input", stream({ input_tokens: -1, output_tokens: 1 })],
  ["fractional input", stream({ input_tokens: 1.5, output_tokens: 1 })],
  ["string output", stream({ input_tokens: 1, output_tokens: "1" })],
  ["missing output", stream({ input_tokens: 1 })],
  ["unsafe integer", stream({ input_tokens: Number.MAX_SAFE_INTEGER + 1, output_tokens: 0 })],
  ["total overflow", stream({ input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 })],
  ["cache exceeds input", stream({ input_tokens: 1, output_tokens: 1, cached_input_tokens: 2 })],
]) test(`does not manufacture zero or a total from ${name}`, () => allUnknown(capture(stdout)));

test("bounded unknown extensions are tolerated, but do not count reasoning twice", () => {
  const value = capture(stream({ input_tokens: 100, output_tokens: 20, cached_input_tokens: 80, reasoning_output_tokens: 10 }));
  assert.equal(value.metrics.total_tokens.value, 120);
});

test("top-level subscription usage-limit failure is typed without persisting provider text", () => {
  const stdout = [
    JSON.stringify({ type: "thread.started", thread_id: "private-thread" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({ type: "error", message: "You've hit your usage limit. Try again later." }),
    JSON.stringify({ type: "turn.failed", error: { message: "private provider detail" } }),
    "",
  ].join("\n");
  const value = capture(stdout, { status: 1 });
  allUnknown(value);
  assert.deepEqual(value.provider_stop, { status: "detected", reason: "subscription_usage_limit" });
  assert.equal(JSON.stringify(value).includes("usage limit"), false);
  assert.equal(JSON.stringify(value).includes("private provider detail"), false);
  validateSuccessorUsage(value, { stdout: value.source_stdout });
});

test("top-level provider rate-limit failure is typed, while unrelated local budget failure stays unknown", () => {
  const rate = [
    '{"type":"turn.started"}',
    '{"type":"turn.failed","error":{"code":"rate_limit_exceeded","message":"Too many requests"}}',
    "",
  ].join("\n");
  assert.deepEqual(capture(rate, { status: 1 }).provider_stop, { status: "detected", reason: "provider_rate_limit" });
  const local = [
    '{"type":"turn.started"}',
    '{"type":"error","message":"shared rollout token budget exhausted"}',
    '{"type":"turn.failed","error":{"message":"shared rollout token budget exhausted"}}',
    "",
  ].join("\n");
  assert.deepEqual(capture(local, { status: 1 }).provider_stop, { status: "unknown", reason: "terminal_failure_unclassified" });
});

test("agent message text cannot manufacture provider-limit evidence", () => {
  const stdout = [
    '{"type":"turn.started"}',
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "You've hit your usage limit" } }),
    '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1,"cached_input_tokens":0}}',
    "",
  ].join("\n");
  assert.deepEqual(capture(stdout).provider_stop, { status: "not_detected", reason: null });
});

test("legacy v1 usage receipts remain semantically valid", () => {
  const current = capture(stream());
  const legacy = {
    schema_version: "1.0.0",
    parser_revision: "codex-exec-jsonl-usage-v1",
    source_stdout: current.source_stdout,
    metrics: current.metrics,
  };
  assert.equal(validateSuccessorUsage(legacy, { stdout: current.source_stdout }), legacy);
});

test("validator rejects forged totals, source changes, extra fields and typed-unknown values", () => {
  const original = capture(stream());
  for (const change of [
    (v) => { v.metrics.total_tokens.value = 1; },
    (v) => { v.metrics.cached_tokens.value = 101; },
    (v) => { v.source_stdout.sha256 = "f".repeat(64); },
    (v) => { v.metrics.input_tokens.status = "unknown"; },
    (v) => { v.metrics.output_tokens.reason = "usage_field_unavailable"; },
    (v) => { v.authorized = true; },
  ]) {
    const value = structuredClone(original); change(value);
    assert.throws(() => validateSuccessorUsage(value, { stdout: original.source_stdout }));
  }
});

test("missing process output is typed unknown and legacy result absence is not zero", () => {
  allUnknown(captureSuccessorUsage(null));
});

for (const [name, raw] of [
  ["invalid UTF-8 inside a JSON string", Buffer.concat([Buffer.from('{"type":"turn.started"}\n{"type":"item.completed","item":{"text":"'), Buffer.from([0xff]), Buffer.from('"}}\n{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":20}}\n')])],
  ["truncated multibyte sequence", Buffer.concat([Buffer.from(stream()), Buffer.from([0xe3, 0x81])])],
]) test(`original bytes reject ${name} without changing their identity`, () => {
  const value = capture(raw); allUnknown(value);
  assert.equal(value.metrics.total_tokens.reason, "stream_invalid");
  assert.deepEqual(value.source_stdout, { bytes: raw.length, sha256: createHash("sha256").update(raw).digest("hex") });
  validateSuccessorUsage(value, { stdout: value.source_stdout });
});

test("valid non-ASCII process bytes retain exact identity and observable usage", () => {
  const raw = Buffer.from(stream(undefined, [{ type: "item.completed", item: { type: "agent_message", text: "日本語・é・😀・�" } }]));
  const value = capture(raw);
  assert.equal(value.metrics.total_tokens.value, 120);
  assert.deepEqual(value.source_stdout, { bytes: raw.length, sha256: createHash("sha256").update(raw).digest("hex") });
});
