import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { buildJudgePacket, createJudgeProtocol } from "./ask-benchmark-llm-judge.mjs";
import { inspectNativeJudgeCli, inspectNativeJudgeCapture } from "./ask-benchmark-judge-native-capture.mjs";

const d = value => canonicalDigest({ value });
const jsonl = rows => Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + "\n");
function fixture() {
  const protocol = createJudgeProtocol({ criteria: [{ criterion_id: "lease", rubric: "A lease is used once." }],
    instructionText: "Return one JSON response.", sourceDigest: d("source"), targetManifestDigest: d("targets"),
    runtimeProfile: { authority_profile: "synthetic_only", provider: "fake", model: "scripted",
      native_identity_digest: d("native"), runtime_config_digest: d("config"), observed_revision: "test",
      transport_kind: "fake_adapter", tools_disabled: true, fresh_process_per_slot: true, workspace_isolated: true, response_format_json: true },
    limits: { max_packet_bytes: 65536, max_response_bytes: 65536, timeout_ms: 1000, max_input_tokens_per_call: 100,
      max_output_tokens_per_call: 100, max_total_tokens: 1000, max_samples: 1, max_calls: 2, unknown_token_policy: "stop_remaining" } });
  const packet = buildJudgePacket({ protocol, sampleId: `sample-${"0".repeat(32)}`, task: "Review lease usage.",
    documents: [{ kind: "source", text: "A lease is used once." }], verifiedFacts: [], originalOutputBytes: Buffer.from("A lease is used once.") }).packet;
  const response = { schema_version: "1.0.0", sample_id: packet.sample_id, criteria: [{ criterion_id: "lease", verdict: "pass",
    reason_code: "satisfied", brief_rationale: "Synthetic shape test.", evidence_references: [{ document_id: "target-output",
      start_line: 1, end_line: 1, quote: "A lease is used once." }], examined_documents: [] }] };
  const text = JSON.stringify(response);
  const expected = { provider: "fake", cli_version: "0.157.1", model: "scripted", reasoning_effort: "medium", cwd: "/tmp/judge-workspace" };
  const events = [ { type: "thread.started", thread_id: "session-012345" }, { type: "turn.started" },
    { type: "item.started", item: { id: "reason-1", type: "reasoning", text: "" } },
    { type: "item.completed", item: { id: "reason-1", type: "reasoning", text: "Reviewing." } },
    { type: "item.completed", item: { id: "output-1", type: "agent_message", text } },
    { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 12 } } ];
  const session = [ { type: "session_meta", payload: { id: "session-012345", cli_version: expected.cli_version,
      model_provider: expected.provider, cwd: expected.cwd } },
    { type: "turn_context", payload: { turn_id: "turn-012345", model: expected.model, effort: "medium", cwd: expected.cwd,
      approval_policy: "never", sandbox_policy: { type: "read-only", network_access: false } } },
    { type: "event_msg", payload: { type: "task_started", turn_id: "turn-012345" } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text }] } },
    { type: "event_msg", payload: { type: "agent_message", message: text } },
    { type: "event_msg", payload: { type: "task_complete", turn_id: "turn-012345", last_agent_message: text } } ];
  const input = () => ({ protocol, packet, expected,
    processResult: { stdout: jsonl(events), status: 0, signal: null, error: null, workspace_descendants_detected: false },
    sessionBytes: jsonl(session), responseBytes: Buffer.from(text + "\n") });
  return { events, session, response, text, input };
}

test("synthetic native-shaped bytes close to one response without minting transport/isolation authority", () => {
  const f = fixture(), report = inspectNativeJudgeCapture(f.input());
  assert.equal(report.capture_shape_verified, true); assert.deepEqual(report.response, f.response);
  for (const key of ["capture_origin_verified", "tool_isolation_verified", "native_transport_authorized", "measurement_authorized"])
    assert.equal(report[key], false);
  assert.equal(report.usage.metrics.total_tokens.value, 22);
});

for (const type of ["command_execution", "mcp_tool_call", "web_search", "file_change", "new_unknown_tool"])
  test(`stdout ${type} is not a tool-free capture`, () => {
    const f = fixture(); f.events.splice(2, 0, { type: "item.completed", item: { id: "tool", type } });
    assert.throws(() => inspectNativeJudgeCapture(f.input()));
  });

for (const mutate of [
  f => f.events.splice(2, 0, { type: "turn.started" }),
  f => f.events.push({ type: "item.completed", item: { id: "late", type: "reasoning", text: "late" } }),
  f => f.events.splice(3, 1),
  f => f.events.splice(4, 0, structuredClone(f.events[3])),
  f => f.events[0].thread_id = "another-session",
  f => f.events.at(-1).error = { message: "failed" },
]) test("duplicate, incomplete, reordered or contradictory exec trace is rejected", () => {
  const f = fixture(); mutate(f); assert.throws(() => inspectNativeJudgeCapture(f.input()));
});

for (const mutate of [
  f => f.session.splice(3, 0, { type: "response_item", payload: { type: "function_call", name: "shell" } }),
  f => f.session.splice(3, 0, { type: "event_msg", payload: { type: "exec_command_begin" } }),
  f => f.session.splice(3, 0, { type: "new_unrecognized_type", payload: {} }),
  f => f.session[1].payload.model = "different-model",
  f => f.session[1].payload.approval_policy = "on-request",
  f => f.session[1].payload.sandbox_policy.network_access = true,
  f => f.session[1].payload.sandbox_policy.type = "workspace-write",
  f => f.session[1].payload.effort = "high",
  f => f.session[0].payload.cli_version = "0.1.0",
  f => f.session[0].payload.cwd = "/tmp/other",
  f => f.session[4].payload.message = "different response",
  f => f.session[3].payload.content[0].text = "different response",
  f => f.session.at(-1).payload.turn_id = "different-turn",
  f => f.session.at(-1).payload.last_agent_message = "different response",
  f => f.session.splice(2, 1),
  f => f.session.push(structuredClone(f.session[1])),
]) test("session tools, drift and incomplete causal markers are rejected", () => {
  const f = fixture(); mutate(f); assert.throws(() => inspectNativeJudgeCapture(f.input()));
});

test("unknown tokens remain unknown; matching JSON shape is not zero usage", () => {
  const f = fixture(); delete f.events.at(-1).usage;
  const report = inspectNativeJudgeCapture(f.input());
  assert.equal(report.usage.metrics.total_tokens.status, "unknown"); assert.equal(report.usage.metrics.total_tokens.value, null);
});

test("bad UTF-8, duplicate keys and different output bytes are rejected", () => {
  const f = fixture();
  for (const field of ["sessionBytes", "responseBytes"])
    assert.throws(() => inspectNativeJudgeCapture({ ...f.input(), [field]: Buffer.from([0xff]) }));
  assert.throws(() => inspectNativeJudgeCapture({ ...f.input(), responseBytes: Buffer.from("{}") }));
  const input = f.input(); input.processResult.stdout = Buffer.from('{"type":"thread.started","type":"turn.started"}\n');
  assert.throws(() => inspectNativeJudgeCapture(input));
});

test("nonzero exit, timeout, unknown or residual process state cannot close a capture", () => {
  const f = fixture();
  for (const override of [{ status: 1 }, { signal: "SIGKILL" }, { error: new Error("timeout") },
    { workspace_descendants_detected: true }, { workspace_descendants_detected: undefined }]) {
    const input = f.input(); Object.assign(input.processResult, override);
    assert.throws(() => inspectNativeJudgeCapture(input));
  }
});

test("model-free inspector runs only version/help with an empty credential-free home", t => {
  const directory = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-native-inspect-fake-")));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = resolve(directory, "fake-codex"), source = resolve(directory, "fake.c");
  writeFileSync(source, `#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(int argc, char **argv) {\n
    if (getenv("OPENAI_API_KEY") || getenv("CODEX_AUTH_TOKEN") || !getenv("CODEX_HOME")) return 40;
    if (getchar() != EOF) return 41;
    if (argc == 2 && strcmp(argv[1], "--version") == 0) { puts("codex-cli 0.157.1"); return 0; }
    if (argc == 3 && strcmp(argv[1], "exec") == 0 && strcmp(argv[2], "--help") == 0) {
      puts("--json --model --sandbox --output-schema --output-last-message --skip-git-repo-check"); return 0; }
    return 42; }\n`);
  const compile = spawnSync("cc", [source, "-o", executable], { encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr ?? String(compile.error));
  const expectedSha256 = `sha256:${createHash("sha256").update(readFileSync(executable)).digest("hex")}`;
  const report = inspectNativeJudgeCli({ executable, expectedSha256, expectedVersion: "0.157.1" });
  assert.equal(report.credential_source, "none"); assert.equal(report.native_transport_authorized, false);
  assert.equal(report.tool_isolation_verified, false);
  assert.deepEqual(report.commands.map(row => row.argv), [["--version"], ["exec", "--help"]]);
  assert.equal(Object.values(report.advertised_flags).every(Boolean), true);
  assert.throws(() => inspectNativeJudgeCli({ executable, expectedSha256: d("bad"), expectedVersion: "0.157.1" }));
  assert.throws(() => inspectNativeJudgeCli({ executable, expectedSha256, expectedVersion: "0.157.2" }));
});

for (const [name, mutate] of [
  ["assistant output before the turn starts", f => { const [message] = f.session.splice(3, 1); f.session.splice(2, 0, message); }],
  ["missing assistant response item", f => f.session.splice(3, 1)],
  ["duplicate assistant response item", f => f.session.splice(4, 0, structuredClone(f.session[3]))],
  ["turn context after the assistant output", f => { const [context] = f.session.splice(1, 1); f.session.splice(4, 0, context); }],
]) test(`capture rejects ${name}`, () => {
  const f = fixture(); mutate(f);
  assert.throws(() => inspectNativeJudgeCapture(f.input()));
});


test("response item and message event may arrive in either order within the same turn", () => {
  const f = fixture();
  [f.session[3], f.session[4]] = [f.session[4], f.session[3]];
  assert.equal(inspectNativeJudgeCapture(f.input()).capture_shape_verified, true);
});
