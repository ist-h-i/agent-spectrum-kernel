import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  JUDGE_TOOL_FREE_CLI_VERSION, JUDGE_TOOL_FREE_MODEL,
  buildJudgeToolFreeOverrides, inspectJudgeToolFreeCatalog,
  inspectJudgeToolFreeRequest,
} from "./ask-benchmark-judge-tool-free-profile.mjs";

const catalogPath = resolve(import.meta.dirname, "../benchmarks/prompt-successor-judge-tool-free-catalog.json");

test("fixed 0.157.1 catalog disables every model-owned tool route", () => {
  const catalog = inspectJudgeToolFreeCatalog(readFileSync(catalogPath));
  assert.equal(JUDGE_TOOL_FREE_CLI_VERSION, "0.157.1");
  assert.equal(JUDGE_TOOL_FREE_MODEL, "gpt-6-sol");
  assert.equal(catalog.models.length, 1);
  const model = catalog.models[0];
  assert.equal(model.shell_type, "disabled");
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
    method: "POST", path: "/v1/responses", headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify({ model: "gpt-6-sol", input: [{ role: "user", content: "synthetic capture" }], tools: [] })),
  };
  const summary = inspectJudgeToolFreeRequest([request]);
  assert.equal(summary.tool_count, 0);
  assert.equal(summary.model, "gpt-6-sol");
  for (const change of [
    { ...request, body: Buffer.from(JSON.stringify({ model: "gpt-6-sol", input: [], tools: [{ type: "function", name: "shell" }] })) },
    { ...request, body: Buffer.from(JSON.stringify({ model: "gpt-6-sol", input: [{ type: "additional_tools", tools: [] }], tools: [] })) },
    { ...request, body: Buffer.from(JSON.stringify({ model: "other", input: [], tools: [] })) },
    { ...request, headers: { authorization: "Bearer unexpected" } },
    { ...request, path: "/v1/models" },
    { ...request, method: "GET" },
    { ...request, body: Buffer.from('{"model":"gpt-6-sol","tools":[],"tools":[]}') },
  ]) assert.throws(() => inspectJudgeToolFreeRequest([change]));
  assert.throws(() => inspectJudgeToolFreeRequest([]));
  assert.throws(() => inspectJudgeToolFreeRequest([request, request]));
});
