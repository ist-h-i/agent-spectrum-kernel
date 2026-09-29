import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";

export const JUDGE_TOOL_FREE_CLI_VERSION = "0.157.1";
// Observed @openai/codex-darwin-arm64 native image for codex-cli 0.157.1.
// This candidate is intentionally host-specific until another image is reviewed.
export const JUDGE_TOOL_FREE_CLI_SHA256 = "sha256:27ceb5f9b957b43a519efe4eaa3816a0bffb0a531a2c89af18840c0a3c016a7d";
export const JUDGE_TOOL_FREE_MODEL = "gpt-6-sol";
export const JUDGE_TOOL_FREE_CATALOG_SHA256 = "sha256:7550345ec820ed7dbd27ad017f53e691828c28b857152c35b064952a7c349e1b";

const sha256 = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function check(ok, message) {
  if (!ok) throw new Error(`JUDGE_TOOL_FREE_PROFILE_INVALID: ${message}`);
}
function absolute(path) {
  check(typeof path === "string" && isAbsolute(path) && resolve(path) === path && !path.includes("\0"), "absolute path required");
  return path;
}
function toml(value) { return JSON.stringify(value); }

/** The checked-in catalog is the complete, static model metadata for this profile. */
export function inspectJudgeToolFreeCatalog(bytes) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === JUDGE_TOOL_FREE_CATALOG_SHA256, "catalog bytes changed");
  const catalog = parseJsonRejectDuplicateKeys(bytes, "tool-free Judge catalog");
  check(Array.isArray(catalog.models) && catalog.models.length === 1, "one catalog model required");
  const model = catalog.models[0];
  check(model.slug === JUDGE_TOOL_FREE_MODEL && model.shell_type === "disabled"
    && model.apply_patch_tool_type === null && model.supports_search_tool === false
    && Array.isArray(model.experimental_supported_tools) && model.experimental_supported_tools.length === 0
    && model.tool_mode === "direct" && model.multi_agent_version === "disabled"
    && model.use_responses_lite === false && JSON.stringify(model.input_modalities) === '["text"]'
    && model.include_skills_usage_instructions === false
    && model.include_plugin_usage_instructions === false
    && model.include_apps_usage_instructions === false, "tool-free model metadata");
  return catalog;
}

/**
 * Fixed public -c profile for exact CLI 0.157.1. The local provider is accepted
 * only by the request-capture probe; the production profile has no provider
 * override and still needs separate credential/host qualification.
 */
export function buildJudgeToolFreeOverrides({ catalogPath, instructionPath, captureBaseUrl = null }) {
  const settings = [
    ["model", toml(JUDGE_TOOL_FREE_MODEL)],
    ["model_catalog_json", toml(absolute(catalogPath))],
    ["model_instructions_file", toml(absolute(instructionPath))],
    ["model_reasoning_effort", toml("medium")],
    ["approval_policy", toml("never")],
    ["sandbox_mode", toml("read-only")],
    ["web_search", toml("disabled")],
    ["mcp_servers", "{}"],
    ["project_doc_max_bytes", "0"],
    ["check_for_update_on_startup", "false"],
    ["include_apps_instructions", "false"],
    ["include_collaboration_mode_instructions", "false"],
    ["include_environment_context", "false"],
    ["analytics.enabled", "false"],
    ["feedback.enabled", "false"],
    ["agents.enabled", "false"],
    ["tools.experimental_request_user_input.enabled", "false"],
    ["tools.update_plan.enabled", "false"],
  ];
  for (const feature of [
    "shell_tool", "unified_exec", "code_mode", "code_mode_only",
    "view_image", "multi_agent", "multi_agent_v2", "apps", "enable_mcp_apps",
    "plugins", "remote_plugin", "recommended_plugins", "tool_suggest",
    "standalone_web_search", "mcp_2026_07_28", "image_generation",
    "browser_use", "computer_use", "sleep_tool", "current_time_reminder",
    "send_message_to_user_async", "goals", "memories", "deferred_executor",
    "request_permissions_tool", "token_budget", "artifact",
  ]) settings.push([`features.${feature}`, "false"]);
  if (captureBaseUrl !== null) {
    const url = new URL(captureBaseUrl);
    check(url.protocol === "http:" && url.hostname === "127.0.0.1"
      && /^\d+$/u.test(url.port) && url.pathname === "/v1"
      && !url.username && !url.password && !url.search && !url.hash,
    "capture provider must be 127.0.0.1 /v1");
    settings.push(
      ["model_provider", toml("capture")],
      ["model_providers.capture.name", toml("capture")],
      ["model_providers.capture.base_url", toml(url.href.replace(/\/$/u, ""))],
      ["model_providers.capture.wire_api", toml("responses")],
      ["model_providers.capture.requires_openai_auth", "false"],
      ["model_providers.capture.request_max_retries", "0"],
      ["model_providers.capture.stream_max_retries", "0"],
      ["model_providers.capture.supports_websockets", "false"],
    );
  }
  return settings.map(([key, value]) => `${key}=${value}`);
}

function inputHasUnsupportedPart(value) {
  if (Array.isArray(value)) return value.some(inputHasUnsupportedPart);
  if (value === null || typeof value !== "object") return false;
  if (["additional_tools", "tool_definitions", "mcp_servers", "call_id", "tool_call_id",
    "recipient", "namespace", "tool_name", "function_name"]
    .some(key => Object.hasOwn(value, key))) return true;
  if (Object.hasOwn(value, "role")
    && !["user", "developer", "system", "assistant"].includes(value.role)) return true;
  if (Object.hasOwn(value, "type")
    && !["message", "input_text", "text", "reasoning"].includes(value.type)) return true;
  return Object.values(value).some(inputHasUnsupportedPart);
}

/** Inspect the raw outbound request, not Codex's tool-event transcript. */
export function inspectJudgeToolFreeRequest(requests, expectedEndpoint) {
  check(Array.isArray(requests) && requests.length === 1, "exactly one outbound request required");
  const endpoint = new URL(expectedEndpoint);
  check(endpoint.protocol === "http:" && endpoint.hostname === "127.0.0.1"
    && /^\d+$/u.test(endpoint.port) && endpoint.pathname === "/v1"
    && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash,
  "fixed loopback destination");
  const request = requests[0];
  check(request?.method === "POST" && request.path === "/v1/responses", "Responses endpoint");
  check(request.remote_address === "127.0.0.1" || request.remote_address === "::ffff:127.0.0.1", "loopback peer");
  check(request.local_address === "127.0.0.1" && request.local_port === Number(endpoint.port)
    && request.headers?.host === `127.0.0.1:${endpoint.port}`, "actual loopback destination");
  check(Buffer.isBuffer(request.body) && request.body.length > 0 && request.body.length <= 4 * 1024 * 1024, "bounded request body");
  check(!Object.keys(request.headers ?? {}).some(key => key.toLowerCase() === "authorization"), "capture must not receive credentials");
  const body = parseJsonRejectDuplicateKeys(request.body, "outbound Responses request");
  check(body.model === JUDGE_TOOL_FREE_MODEL, "model identity");
  check(body.reasoning?.effort === "medium", "outbound reasoning effort");
  check(Array.isArray(body.input) && body.input.length > 0, "one synthetic request input");
  check(!Object.hasOwn(body, "tools") || (Array.isArray(body.tools) && body.tools.length === 0), "model-visible tools");
  check(!inputHasUnsupportedPart(body.input), "tool or unsupported content in request input");
  return {
    schema_version: "1.0.0", kind: "judge_tool_free_request_capture",
    cli_version: JUDGE_TOOL_FREE_CLI_VERSION, model: body.model,
    reasoning_effort: body.reasoning.effort,
    endpoint: `${endpoint.origin}${request.path}`, request_count: 1, tool_count: 0,
    authorization_header_present: false,
    request_sha256: sha256(request.body),
  };
}
