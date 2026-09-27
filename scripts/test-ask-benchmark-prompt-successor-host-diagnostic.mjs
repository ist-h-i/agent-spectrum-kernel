import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSuccessorExecSessionEvidence } from "./ask-benchmark-prompt-successor-host-diagnostic.mjs";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const turn = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const cwd = "/tmp/issue291-diagnostic-synthetic-workspace";
const privateRoot = "/tmp/issue291-diagnostic-synthetic-private";
const source = { scope: { source: { runtime_identity_digest: `sha256:${"a".repeat(64)}` } } };
const runtime = { cli_version: "0.157.1", model: "synthetic-model-not-a-service",
  reasoning_effort: "medium", approval_policy: "never", sandbox: "workspace-write", provider_network: "provider_only" };
const eventRows = [
  { type: "thread.started", thread_id: id },
  { type: "turn.started" },
  { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
];
const sessionRows = [
  { type: "session_meta", payload: { id, model_provider: "openai", cli_version: runtime.cli_version, cwd } },
  { type: "turn_context", payload: { turn_id: turn, cwd, model: runtime.model,
    effort: "medium", approval_policy: "never",
    sandbox_policy: { type: "workspace-write", network_access: false },
    permission_profile: { type: "managed", network: "restricted", file_system: { type: "restricted",
      entries: [{ path: { type: "path", path: privateRoot }, access: "deny" }] } },
    active_permission_profile: { id: "ask_issue291" } } },
];
const bytes = rows => Buffer.from(`${rows.map(row => JSON.stringify(row)).join("\n")}\n`);
const input = (events = eventRows, session = sessionRows) => ({
  stdout: bytes(events), session: bytes(session), source, runtime, cwd, privateRoot,
});

test("CLI JSONL and session context prove one completed diagnostic turn and effective policy", () => {
  const proof = parseSuccessorExecSessionEvidence(input());
  assert.equal(proof.provider, "openai");
  assert.equal(proof.model, runtime.model);
  assert.equal(proof.reasoning_effort, "medium");
  assert.equal(proof.approval_policy, "never");
  assert.equal(proof.sandbox, "workspace-write");
  assert.equal(proof.agent_network, "disabled");
  assert.equal(proof.active_permission_profile, "ask_issue291");
  assert.equal(proof.turn_started_count, 1);
  assert.equal(proof.turn_completed_count, 1);
});

test("diagnostic rejects missing, failed, duplicated and mismatched exec events", () => {
  for (const events of [
    eventRows.slice(0, 2),
    [...eventRows, { type: "turn.failed" }],
    [...eventRows, { type: "turn.completed" }],
    [eventRows[0], eventRows[1], { type: "item.completed", item: { type: "command_execution" } }, eventRows[2]],
    [{ ...eventRows[0], thread_id: "wrong" }, ...eventRows.slice(1)],
  ]) assert.throws(() => parseSuccessorExecSessionEvidence(input(events)));
});

test("diagnostic accepts message items and rejects every tool or unknown item", () => {
  const message = [eventRows[0], eventRows[1],
    { type: "item.completed", item: { type: "reasoning" } },
    { type: "item.completed", item: { type: "agent_message", text: "diagnostic only" } }, eventRows[2]];
  assert.equal(parseSuccessorExecSessionEvidence(input(message)).turn_completed_count, 1);
  for (const itemType of ["command_execution", "tool_call", "mcp_tool_call", "web_search",
    "file_change", "image_generation", "unknown_future_item"]) {
    for (const eventType of ["item.started", "item.updated", "item.completed"]) {
      const events = [eventRows[0], eventRows[1], { type: eventType, item: { type: itemType } }, eventRows[2]];
      assert.throws(() => parseSuccessorExecSessionEvidence(input(events)), `${eventType} ${itemType}`);
    }
  }
  assert.throws(() => parseSuccessorExecSessionEvidence(input([
    eventRows[0], eventRows[1], { type: "unknown.future", item: { type: "agent_message" } }, eventRows[2],
  ])), "unknown exec event");
});

test("diagnostic session rows cannot contradict the tool-free exec JSONL", () => {
  const ordinaryRows = [...sessionRows,
    { type: "event_msg", payload: { type: "task_started", turn_id: turn } },
    { type: "event_msg", payload: { type: "user_message" } },
    { type: "response_item", payload: { type: "reasoning" } },
    { type: "response_item", payload: { type: "message", role: "assistant" } },
    { type: "event_msg", payload: { type: "token_count" } },
    { type: "event_msg", payload: { type: "task_complete", turn_id: turn, error: null } }];
  assert.equal(parseSuccessorExecSessionEvidence(input(eventRows, ordinaryRows)).model, runtime.model);
  for (const payloadType of ["function_call", "function_call_output", "custom_tool_call",
    "web_search_call", "file_search_call", "unknown_future_item"]) {
    assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, [
      ...ordinaryRows, { type: "response_item", payload: { type: payloadType, name: "functions.exec_command" } },
    ])), `session ${payloadType}`);
  }
  assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, [
    ...ordinaryRows, { type: "event_msg", payload: { type: "item_completed", item: { type: "CommandExecution" } } },
  ])), "session tool completion");
  assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, [
    ...ordinaryRows, { type: "response_item", payload: { type: "message", role: "tool" } },
  ])), "tool role message");
  for (const payload of [
    { type: "task_complete", turn_id: turn, error: { message: "failed" } },
    { type: "task_complete", turn_id: "other", error: null },
    { type: "item_completed", item: { type: "CommandExecution" } },
    { type: "unknown_future_event" },
  ]) assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, [
    ...sessionRows, { type: "event_msg", payload },
  ])), `session ${payload.type}`);
  assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, [
    ...ordinaryRows, { type: "unknown_future_row", payload: {} },
  ])), "unknown session row");
});

test("diagnostic rejects provider, model, effort, sandbox, network, approval and profile drift", () => {
  const mutation = [
    [0, "model_provider", "other"], [0, "cli_version", "0.0.0"],
    [1, "model", "other"], [1, "effort", "high"], [1, "approval_policy", "on-request"],
  ];
  for (const [index, key, value] of mutation) {
    const rows = structuredClone(sessionRows);
    rows[index].payload[key] = value;
    assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, rows)), `${key} drift must fail`);
  }
  for (const [path, value] of [
    ["sandbox_policy", { type: "danger-full-access", network_access: false }],
    ["sandbox_policy", { type: "workspace-write", network_access: true }],
    ["permission_profile", { type: "none" }],
    ["active_permission_profile", { id: "other" }],
  ]) {
    const rows = structuredClone(sessionRows);
    rows[1].payload[path] = value;
    assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, rows)), `${path} drift must fail`);
  }
  assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, sessionRows.slice(0, 1))));
  assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, [...sessionRows, sessionRows[1]])));
  for (const entries of [[],
    [{ path: { type: "path", path: "/tmp/other" }, access: "deny" }],
    [{ path: { type: "path", path: privateRoot }, access: "read" }],
    Array(2).fill({ path: { type: "path", path: privateRoot }, access: "deny" })]) {
    const rows = structuredClone(sessionRows);
    rows[1].payload.permission_profile.file_system.entries = entries;
    assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, rows)), "exactly one private deny entry required");
  }
  const network = structuredClone(sessionRows);
  network[1].payload.permission_profile.network = "open";
  assert.throws(() => parseSuccessorExecSessionEvidence(input(eventRows, network)));
  const noActiveId = structuredClone(sessionRows);
  delete noActiveId[1].payload.active_permission_profile;
  assert.equal(parseSuccessorExecSessionEvidence(input(eventRows, noActiveId)).active_permission_profile, null);
});
