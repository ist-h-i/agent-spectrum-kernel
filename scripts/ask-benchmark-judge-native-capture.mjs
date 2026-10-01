import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys,
  readStableBytes } from "./content-addressed-store.mjs";
import { JudgeAuthorityError, JudgeUnresolvedError, parseJudgeResponse, verifyJudgeProtocol } from "./ask-benchmark-llm-judge.mjs";
import { captureSuccessorUsage } from "./ask-benchmark-prompt-successor-usage.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function check(ok, code) { if (!ok) throw new JudgeAuthorityError(`native_capture_${code}`); }
function exactText(bytes, limit = MAX_BYTES) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= limit, "byte_size");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new JudgeAuthorityError("native_capture_invalid_utf8"); }
  check(Buffer.from(text).equals(bytes), "utf8_roundtrip");
  return text;
}
function lines(bytes) {
  const text = exactText(bytes);
  check(text.endsWith("\n"), "incomplete_jsonl");
  const rows = text.slice(0, -1).split("\n");
  check(rows.length <= 20000 && rows.every(row => row.length > 0), "line_count");
  return rows.map(row => parseJsonRejectDuplicateKeys(row, "native Judge capture"));
}
function closedExpected(expected) {
  check(expected && typeof expected === "object" && !Array.isArray(expected)
    && Object.keys(expected).sort().join("|") === ["cli_version", "cwd", "model", "provider", "reasoning_effort"].join("|"), "expected_fields");
  check(Object.values(expected).every(value => typeof value === "string" && value.length > 0), "expected_values");
  check(isAbsolute(expected.cwd) && resolve(expected.cwd) === expected.cwd, "cwd");
}

/** Model-free interface inspection. It neither loads credentials nor creates a live adapter. */
export function inspectNativeJudgeCli({ executable, expectedSha256, expectedVersion }) {
  check(typeof executable === "string" && isAbsolute(executable) && resolve(executable) === executable, "executable_path");
  check(/^sha256:[a-f0-9]{64}$/u.test(expectedSha256 ?? "") && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/u.test(expectedVersion ?? ""), "expected_identity");
  assertNoSymlinkPathSegments(executable, "native Judge executable");
  const stat = lstatSync(executable);
  check(stat.isFile() && (stat.mode & 0o111) !== 0, "executable_file");
  const binary = readStableBytes(executable, "native Judge executable", 256 * 1024 * 1024);
  const magic = binary.subarray(0, 4).toString("hex");
  check(["7f454c46", "cffaedfe", "cefaedfe", "feedfacf", "feedface", "cafebabe", "bebafeca", "cafebabf"].includes(magic), "native_binary_required");
  check(hash(binary) === expectedSha256, "binary_digest");
  const home = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-judge-interface-")));
  const codexHome = resolve(home, "codex"); mkdirSync(codexHome, { mode: 0o700 });
  try {
    const commands = [["--version"], ["exec", "--help"]];
    const outputs = commands.map(argv => {
      check(hash(readStableBytes(executable, "native Judge executable", 256 * 1024 * 1024)) === expectedSha256, "binary_drift");
      const result = spawnSync(executable, argv, { cwd: home,
        env: { HOME: home, CODEX_HOME: codexHome, XDG_CONFIG_HOME: codexHome, PATH: "/usr/bin:/bin", LANG: "C.UTF-8", NO_COLOR: "1" },
        timeout: 10000, maxBuffer: 1024 * 1024, killSignal: "SIGKILL", shell: false, input: Buffer.alloc(0) });
      check(!result.error && result.status === 0 && result.signal === null, "interface_command_failed");
      check(hash(readStableBytes(executable, "native Judge executable", 256 * 1024 * 1024)) === expectedSha256, "binary_drift");
      return { argv, stdout: exactText(result.stdout, 1024 * 1024),
        stdout_digest: hash(result.stdout), stderr_digest: hash(result.stderr ?? Buffer.alloc(0)) };
    });
    check(outputs[0].stdout.trim() === `codex-cli ${expectedVersion}`, "version_mismatch");
    const flags = ["--json", "--model", "--sandbox", "--output-schema", "--output-last-message", "--skip-git-repo-check"];
    if (expectedVersion === "0.157.1") flags.push("--ignore-user-config", "--ignore-rules", "--strict-config");
    const advertised = Object.fromEntries(flags.map(flag => [flag, new RegExp(`${flag}(?:[\\s,=]|$)`, "u").test(outputs[1].stdout)]));
    const body = { schema_version: "1.0.0", kind: "llm_judge_native_interface_inspection",
      executable_digest: expectedSha256, cli_version: expectedVersion, advertised_flags: advertised,
      commands: outputs.map(({ argv, stdout_digest, stderr_digest }) => ({ argv, stdout_digest, stderr_digest })),
      command_scope: "version_and_help_only", credential_source: "none",
      tool_isolation_verified: false, native_transport_authorized: false, measurement_authorized: false };
    return { ...body, inspection_digest: canonicalDigest(body) };
  } finally { rmSync(home, { recursive: true, force: true }); }
}

/**
 * Validates captured bytes, NOT their origin. A caller-supplied trace cannot mint
 * a native receipt, prove tools were disabled, or authorize a provider call.
 */
export function inspectNativeJudgeCapture({ protocol, packet, processResult, sessionBytes, responseBytes, expected, responseMode = "strict" }) {
  verifyJudgeProtocol(protocol); closedExpected(expected);
  check(["strict", "record_invalid"].includes(responseMode), "response_mode");
  check(expected.provider === protocol.runtime_profile.provider && expected.model === protocol.runtime_profile.model, "protocol_runtime");
  check(processResult?.status === 0 && processResult.signal === null && !processResult.error
    && processResult.workspace_descendants_detected === false, "incomplete_process");
  const events = lines(processResult.stdout), session = lines(sessionBytes);
  check(events.length >= 4 && events[0]?.type === "thread.started" && events[1]?.type === "turn.started"
    && events.at(-1)?.type === "turn.completed", "event_order");
  check(events.filter(row => row.type === "thread.started").length === 1
    && events.filter(row => row.type === "turn.started").length === 1
    && events.filter(row => row.type === "turn.completed").length === 1, "one_turn");
  check(events.every(row => row.error == null), "event_error");
  const items = new Map();
  for (const row of events.slice(2, -1)) {
    check(["item.started", "item.updated", "item.completed"].includes(row.type)
      && ["agent_message", "reasoning"].includes(row.item?.type), "tool_or_unknown_event");
    const item = row.item, previous = items.get(item.id);
    check(typeof item.id === "string" && item.id.length > 0 && item.error == null
      && (!previous || (previous.type === item.type && previous.event !== "item.completed"))
      && (!previous || row.type !== "item.started"), "item_lifecycle");
    items.set(item.id, { type: item.type, event: row.type });
  }
  check([...items.values()].every(item => item.event === "item.completed"), "incomplete_items");
  check([...items.values()].filter(item => item.type === "agent_message").length === 1, "message_inventory");
  const finalItems = events.filter(row => row.type === "item.completed" && row.item?.type === "agent_message");
  check(finalItems.length === 1 && typeof finalItems[0].item.text === "string", "final_message");
  const finalText = finalItems[0].item.text;
  const responseText = exactText(responseBytes, protocol.limits.max_response_bytes);
  check(responseText === finalText || responseText === `${finalText}\n`, "response_bytes_mismatch");

  const metas = session.filter(row => row.type === "session_meta");
  const contexts = session.filter(row => row.type === "turn_context");
  check(session[0]?.type === "session_meta" && metas.length === 1 && contexts.length === 1, "session_context");
  const meta = metas[0].payload, context = contexts[0].payload;
  check(meta?.model_provider === expected.provider && meta.cli_version === expected.cli_version
    && meta.cwd === expected.cwd && context?.cwd === expected.cwd && context.model === expected.model
    && context.effort === expected.reasoning_effort, "session_runtime_mismatch");
  check(typeof meta.id === "string" && meta.id.length >= 10 && events[0].thread_id === meta.id
    && typeof context.turn_id === "string" && context.turn_id.length >= 10, "session_identity");
  check(context.approval_policy === "never" && context.sandbox_policy?.type === "read-only"
    && context.sandbox_policy.network_access === false, "session_policy");
  const contextIndex = session.indexOf(contexts[0]);
  let start = -1, complete = -1, finalMessages = 0, finalResponseItems = 0;
  for (const [index, row] of session.entries()) {
    if (["session_meta", "turn_context"].includes(row.type)) continue;
    const value = row.payload;
    if (row.type === "response_item") {
      if (value?.type === "reasoning") { check(complete === -1, "late_reasoning"); continue; }
      check(value?.type === "message" && ["user", "assistant"].includes(value.role), "session_tool_or_unknown");
      check(complete === -1, "late_message");
      if (value.role === "assistant") {
        // A matching string outside this turn is not its response evidence.
        check(start !== -1 && contextIndex < index && ++finalResponseItems === 1, "session_response_order");
        check(Array.isArray(value.content) && value.content.length === 1
          && value.content[0]?.type === "output_text" && value.content[0].text === finalText, "session_response_mismatch");
      }
      continue;
    }
    check(row.type === "event_msg" && typeof value?.type === "string", "session_tool_or_unknown");
    if (["task_started", "turn_started"].includes(value.type)) {
      check(start === -1 && complete === -1 && value.turn_id === context.turn_id && value.error == null, "session_start"); start = index;
    } else if (["task_complete", "turn_complete"].includes(value.type)) {
      check(start !== -1 && complete === -1 && value.turn_id === context.turn_id && value.error == null
        && (value.last_agent_message === undefined || value.last_agent_message === finalText), "session_complete"); complete = index;
    } else if (value.type === "agent_message") {
      check(start !== -1 && complete === -1 && contextIndex < index
        && value.message === finalText && ++finalMessages === 1, "session_final_message");
    } else if (["agent_reasoning", "agent_reasoning_raw_content", "user_message"].includes(value.type)) {
      check(complete === -1, "late_message");
    } else check(value.type === "token_count", "session_tool_or_unknown");
  }
  check(start >= 0 && complete > start && finalMessages === 1 && finalResponseItems === 1
    && contextIndex < complete, "session_completion_missing");
  let response = null, responseError = null;
  try { response = parseJudgeResponse({ protocol, packet, rawResponseBytes: responseBytes }); }
  catch (error) {
    if (responseMode !== "record_invalid" || !(error instanceof JudgeUnresolvedError)) throw error;
    responseError = error.code;
  }
  const usage = captureSuccessorUsage(processResult);
  const body = { schema_version: "1.0.0", kind: "llm_judge_native_capture_inspection",
    protocol_digest: protocol.protocol_digest, packet_digest: canonicalDigest(packet), expected_context_digest: canonicalDigest(expected),
    stdout_digest: hash(processResult.stdout), session_digest: hash(sessionBytes), response_digest: hash(responseBytes),
    session_id_digest: canonicalDigest({ session_id: meta.id }), turn_id_digest: canonicalDigest({ turn_id: context.turn_id }),
    response, ...(responseMode === "record_invalid" ? { response_error: responseError } : {}), usage, capture_shape_verified: true, observed_tool_events: 0,
    capture_origin_verified: false, tool_isolation_verified: false,
    native_transport_authorized: false, measurement_authorized: false };
  return { ...body, inspection_digest: canonicalDigest(body) };
}
