import { spawn } from "node:child_process";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";

const MAX_STREAM = 20 * 1024 * 1024;
// No authority is minted here. Native A/B and host bootstrap own their separate
// durable claims and permissions before calling this shared low-level observer.
function groupPresent(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return false;
  try { process.kill(-pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}
function stopGroup(pid) {
  try { process.kill(-pid, "SIGKILL"); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}

function eventFailure(line, streamProtocol) {
  try {
    const event = parseJsonRejectDuplicateKeys(line, "native exec event");
    const permitted = streamProtocol === "control" ? event.type === "host_control_result"
      : ["thread.started", "turn.started", "turn.completed", "turn.failed", "error"].includes(event.type)
        || (["item.started", "item.updated", "item.completed"].includes(event.type)
          && ["agent_message", "reasoning"].includes(event.item?.type));
    return permitted ? null : "tool_or_unknown_event";
  } catch { return "invalid_event_stream"; }
}

/** Read-only framing/event check, also used when raw process evidence reopens. */
export function judgeProcessStreamFailure(bytes, streamProtocol = "codex") {
  if (!["codex", "control"].includes(streamProtocol)) throw new Error("invalid stream protocol");
  if (!Buffer.isBuffer(bytes)) return "invalid_event_stream";
  if (bytes.length > MAX_STREAM) return "output_limit";
  let start = 0, newline;
  while ((newline = bytes.indexOf(10, start)) !== -1) {
    const failure = eventFailure(bytes.subarray(start, newline), streamProtocol);
    if (failure !== null) return failure;
    start = newline + 1;
  }
  // Match the native JSONL contract: no unterminated or unexamined final frame.
  return start === bytes.length ? null : "incomplete_event_stream";
}

/** One process, bounded streams, no inherited environment or hidden retry. */
export async function captureJudgeProcess({ executable, argv, cwd, env, input, timeoutMs, streamProtocol = "codex" }) {
  if (!["codex", "control"].includes(streamProtocol)) throw new Error("invalid stream protocol");
  const start = performance.now();
  let pid = null, cause = null, residual = false, killError = null;
  const chunks = { stdout: [], stderr: [] }, lengths = { stdout: 0, stderr: 0 };
  const truncated = { stdout: false, stderr: false };
  let carry = Buffer.alloc(0);
  return await new Promise(resolveResult => {
    let finished = false, graceTimer = null;
    const finish = (status, signal) => {
      if (finished) return;
      finished = true; clearTimeout(timer); clearTimeout(graceTimer);
      resolveResult({ pid, status, signal, cause, kill_error: killError, residual_detected: residual,
        duration_ms: Math.ceil(performance.now() - start), truncated,
        stdout: Buffer.concat(chunks.stdout), stderr: Buffer.concat(chunks.stderr) });
    };
    const child = spawn(executable, argv, { cwd, env, shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    pid = child.pid ?? null;
    const stop = reason => {
      cause ??= reason;
      if (pid !== null) try { stopGroup(pid); } catch (error) { killError = error.code ?? "kill_failed"; }
      graceTimer ??= setTimeout(() => {
        residual = true; killError ??= "termination_unconfirmed";
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref();
        finish(null, null);
      }, 1500);
    };
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    child.on("error", error => { cause ??= error.code ?? "spawn_failed"; });
    // Even a zero-exit child can close stdin before receiving the whole packet.
    // A completion-looking response cannot override a failed input write.
    child.stdin.on("error", () => stop("stdin_error"));
    for (const name of ["stdout", "stderr"]) child[name].on("data", chunk => {
      const remaining = MAX_STREAM - lengths[name];
      if (remaining > 0) { const kept = chunk.subarray(0, remaining); chunks[name].push(kept); lengths[name] += kept.length; }
      if (chunk.length > remaining) { truncated[name] = true; stop("output_limit"); return; }
      if (name !== "stdout") return;
      carry = Buffer.concat([carry, chunk]);
      let newline;
      while ((newline = carry.indexOf(10)) !== -1) {
        const line = carry.subarray(0, newline); carry = carry.subarray(newline + 1);
        const failure = eventFailure(line, streamProtocol);
        if (failure !== null) stop(failure);
      }
    });
    child.stdout.once("end", () => {
      if (carry.length > 0) stop("incomplete_event_stream");
    });
    child.once("exit", () => {
      // Descendants that still hold pipes must not keep this promise alive.
      if (pid !== null) try { if (groupPresent(pid)) { residual = true; stop("residual_process_group"); } }
      catch (error) { killError = error.code ?? "group_state_unknown"; }
    });
    child.once("close", finish);
    child.stdin.end(input);
  });
}
