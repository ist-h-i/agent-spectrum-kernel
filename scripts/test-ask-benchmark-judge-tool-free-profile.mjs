import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  JUDGE_TOOL_FREE_BASE_INSTRUCTIONS, JUDGE_TOOL_FREE_CATALOG_SHA256, JUDGE_TOOL_FREE_CLI_SHA256,
  JUDGE_TOOL_FREE_CLI_VERSION, JUDGE_TOOL_FREE_MODEL, JUDGE_TOOL_FREE_STDIN,
  buildJudgeToolFreeOverrides, inspectJudgeToolFreeCatalog,
  inspectJudgeToolFreeRequest,
} from "./ask-benchmark-judge-tool-free-profile.mjs";
import { reopenJudgeToolFreeCapture } from "./ask-benchmark-judge-tool-free-reopen.mjs";

const catalogPath = resolve(import.meta.dirname, "../benchmarks/prompt-successor-judge-tool-free-catalog.json");
const captureEndpoint = "http://127.0.0.1:12345/v1";
const syntheticInput = [{ type: "message", id: "msg_synthetic", role: "user",
  content: [{ type: "input_text", text: JUDGE_TOOL_FREE_STDIN }] }];
const validBody = { model: "gpt-6.1-sol", reasoning: { effort: "medium" }, input: syntheticInput, tools: [] };
const encoded = value => Buffer.from(JSON.stringify(value));

test("fixed 0.157.1 catalog disables every model-owned tool route", () => {
  const catalog = inspectJudgeToolFreeCatalog(readFileSync(catalogPath));
  assert.equal(JUDGE_TOOL_FREE_CLI_VERSION, "0.157.1");
  assert.equal(JUDGE_TOOL_FREE_CLI_SHA256, "sha256:27ceb5f9b957b43a519efe4eaa3816a0bffb0a531a2c89af18840c0a3c016a7d");
  assert.equal(JUDGE_TOOL_FREE_CATALOG_SHA256, "sha256:2728439a226a7d37c38ff868ccc602d716aaa945bcca8bb0095e4b392157235d");
  assert.equal(JUDGE_TOOL_FREE_MODEL, "gpt-6.1-sol");
  assert.equal(catalog.models.length, 1);
  const model = catalog.models[0];
  assert.equal(model.shell_type, "disabled");
  assert.equal(model.base_instructions, JUDGE_TOOL_FREE_BASE_INSTRUCTIONS);
  assert.equal(model.apply_patch_tool_type, null);
  assert.equal(model.supports_search_tool, false);
  assert.deepEqual(model.experimental_supported_tools, []);
  assert.equal(model.tool_mode, "direct");
  assert.equal(model.multi_agent_version, "disabled");
  assert.equal(model.use_responses_lite, false);
  assert.deepEqual(model.input_modalities, ["text"]);
});

test("capture overrides are closed, use a local provider, and disable non-model tool sources", () => {
  const overrides = buildJudgeToolFreeOverrides({
    catalogPath: "/tmp/judge-catalog.json", instructionPath: "/tmp/judge-instruction.txt",
    captureBaseUrl: "http://127.0.0.1:12345/v1",
  });
  for (const value of [
    "model_catalog_json=\"/tmp/judge-catalog.json\"",
    "web_search=\"disabled\"",
    "mcp_servers={}",
    "tools.experimental_request_user_input.enabled=false",
    "tools.update_plan.enabled=false",
    "features.multi_agent=false",
    "features.code_mode=false",
    "features.view_image=false",
    "features.apps=false",
    "features.plugins=false",
    "model_providers.capture.requires_openai_auth=false",
    "model_providers.capture.request_max_retries=0",
  ]) assert.ok(overrides.includes(value), value);
  // 0.157.1 has features.view_image, but no tools.view_image config field.
  assert.equal(overrides.some(value => value.startsWith("tools.view_image=")), false);
  assert.equal(overrides.length, new Set(overrides.map(value => value.split("=")[0])).size);
  assert.throws(() => buildJudgeToolFreeOverrides({
    catalogPath: "/tmp/judge-catalog.json", instructionPath: "/tmp/judge-instruction.txt",
    captureBaseUrl: "https://api.openai.com/v1",
  }));
  assert.throws(() => buildJudgeToolFreeOverrides({
    catalogPath: "../catalog.json", instructionPath: "/tmp/judge-instruction.txt",
    captureBaseUrl: "http://127.0.0.1:12345/v1",
  }));
});

test("outbound request inspection requires exactly one tool-free loopback Responses POST", () => {
  const request = {
    method: "POST", path: "/v1/responses",
    headers: { "content-type": "application/json", host: "127.0.0.1:12345" },
    remote_address: "127.0.0.1", local_address: "127.0.0.1", local_port: 12345,
    body: encoded(validBody),
  };
  const summary = inspectJudgeToolFreeRequest([request], captureEndpoint);
  assert.equal(summary.tool_count, 0);
  assert.equal(summary.model, "gpt-6.1-sol");
  assert.equal(summary.reasoning_effort, "medium");
  assert.equal(inspectJudgeToolFreeRequest([{ ...request, body: encoded({ ...validBody,
    input: [{ type: "message", role: "developer",
      content: [{ type: "input_text", text: "synthetic context" }] }, ...syntheticInput],
  }) }], captureEndpoint).tool_count, 0);
  for (const change of [
    { ...request, body: encoded({ ...validBody, tools: [{ type: "function", name: "shell" }] }) },
    { ...request, body: encoded({ ...validBody, input: [...syntheticInput, { type: "additional_tools", tools: [] }] }) },
    { ...request, body: encoded({ ...validBody, input: [...syntheticInput,
      { type: "function_call_output", call_id: "call_1", output: "synthetic result" }] }) },
    { ...request, body: encoded({ ...validBody, input: [...syntheticInput,
      { type: "unexpected_tool_result", output: "synthetic result" }] }) },
    { ...request, body: encoded({ ...validBody, input: [...syntheticInput,
      { role: "tool", content: "synthetic result" }] }) },
    { ...request, body: encoded({ ...validBody, input: [{ ...syntheticInput[0],
      content: [...syntheticInput[0].content, { output: "tool result" }] }] }) },
    { ...request, body: encoded({ ...validBody, input: [...syntheticInput,
      { type: "message", role: "assistant", content: [], tool_calls: [{ function: { name: "shell" } }] }] }) },
    { ...request, body: encoded({ ...validBody, input: [...syntheticInput, null] }) },
    { ...request, body: encoded({ ...validBody, input: [] }) },
    { ...request, body: encoded({ ...validBody, model: "other" }) },
    { ...request, headers: { authorization: "Bearer unexpected" } },
    { ...request, path: "/v1/models" },
    { ...request, method: "GET" },
    { ...request, remote_address: "198.51.100.1" },
    { ...request, local_address: "198.51.100.1" },
    { ...request, local_port: 443 },
    { ...request, headers: { ...request.headers, host: "api.openai.com" } },
    { ...request, body: encoded({ ...validBody, reasoning: { effort: "high" } }) },
    { ...request, body: encoded({ ...validBody, reasoning: undefined }) },
    { ...request, body: Buffer.from('{"model":"gpt-6.1-sol","tools":[],"tools":[]}') },
  ]) assert.throws(() => inspectJudgeToolFreeRequest([change], captureEndpoint));
  assert.throws(() => inspectJudgeToolFreeRequest([], captureEndpoint));
  assert.throws(() => inspectJudgeToolFreeRequest([request, request], captureEndpoint));
  assert.throws(() => inspectJudgeToolFreeRequest([request], "https://api.openai.com/v1"));
});

test("saved HTTP bytes and non-secret metadata reopen to the same request inspection", () => {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-judge-tool-free-reopen-")));
  const saveJson = (name, value) => writeFileSync(resolve(root, name), JSON.stringify(value) + "\n");
  const body = encoded(validBody);
  const digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
  const request = { method: "POST", path: "/v1/responses", remote_address: "127.0.0.1",
    local_address: "127.0.0.1", local_port: 12345,
    headers: { "content-type": "", host: "127.0.0.1:12345" }, body };
  try {
    mkdirSync(resolve(root, "workspace"));
    writeFileSync(resolve(root, "model-catalog.json"), readFileSync(catalogPath));
    const validPrecall = { kind: "judge_tool_free_capture_precall",
      cli_version: JUDGE_TOOL_FREE_CLI_VERSION, executable_digest: JUDGE_TOOL_FREE_CLI_SHA256,
      catalog_digest: JUDGE_TOOL_FREE_CATALOG_SHA256, cwd: resolve(root, "workspace"),
      executable: resolve(root, "codex-0.157.1-native"),
      credential_source: "none", benchmark_input: false, private_evaluator_path_supplied: false,
      workspace_initial_files: [], codex_home_initial_files: [], local_endpoint: captureEndpoint };
    saveJson("precall.json", validPrecall);
    const metadata = { kind: "judge_tool_free_http_request", method: request.method,
      path: request.path, remote_address: request.remote_address,
      local_address: request.local_address, local_port: request.local_port,
      host_header: request.headers.host,
      header_names: ["content-type", "host"], body_sha256: digest };
    const metadataBytes = Buffer.from(JSON.stringify(metadata) + "\n");
    const validResult = { kind: "judge_tool_free_capture_result",
      cli_version: JUDGE_TOOL_FREE_CLI_VERSION, executable_digest: JUDGE_TOOL_FREE_CLI_SHA256,
      catalog_digest: JUDGE_TOOL_FREE_CATALOG_SHA256, loopback_request_count: 1,
      request_evidence: [{ body_sha256: digest,
        metadata_sha256: `sha256:${createHash("sha256").update(metadataBytes).digest("hex")}` }],
      cli_exit_code: 1, cli_signal: null, cli_cause: null, workspace_final_files: [],
      credential_source: "none", benchmark_workspace_as_child_cwd: false,
      codex_home_initial_files: [],
      private_evaluator_path_supplied: false,
      inspection: inspectJudgeToolFreeRequest([request], captureEndpoint), failure: null };
    saveJson("result.json", validResult);
    writeFileSync(resolve(root, "request-1.bin"), body);
    writeFileSync(resolve(root, "request-1.json"), metadataBytes);
    assert.equal(reopenJudgeToolFreeCapture(root).captured_request_verified, true);
    for (const field of ["workspace_initial_files", "codex_home_initial_files"]) {
      saveJson("precall.json", { ...validPrecall, [field]: ["unexpected"] });
      assert.throws(() => reopenJudgeToolFreeCapture(root));
      saveJson("precall.json", validPrecall);
    }
    saveJson("result.json", { ...validResult, codex_home_initial_files: ["unexpected"] });
    assert.throws(() => reopenJudgeToolFreeCapture(root));
    saveJson("result.json", validResult);
    saveJson("result.json", { ...validResult, cli_exit_code: 0, cli_signal: "SIGKILL",
      cli_cause: "timeout", workspace_final_files: ["unexpected"] });
    assert.throws(() => reopenJudgeToolFreeCapture(root));
    saveJson("result.json", validResult);
    writeFileSync(resolve(root, "workspace/unexpected"), "unexpected");
    assert.throws(() => reopenJudgeToolFreeCapture(root));
    rmSync(resolve(root, "workspace/unexpected"));
    saveJson("request-1.json", { kind: "judge_tool_free_http_request", method: "GET",
      path: request.path, remote_address: request.remote_address,
      header_names: ["content-type"], body_sha256: digest });
    assert.throws(() => reopenJudgeToolFreeCapture(root));
    saveJson("request-1.json", { kind: "judge_tool_free_http_request", method: request.method,
      path: request.path, remote_address: request.remote_address,
      header_names: ["authorization", "content-type"], body_sha256: digest });
    assert.throws(() => reopenJudgeToolFreeCapture(root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
