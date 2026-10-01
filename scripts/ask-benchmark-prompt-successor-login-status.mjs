import { spawnSync } from "node:child_process";

const LOGIN_STATUS = "Logged in using ChatGPT";
const MAX_STATUS_BYTES = 16 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * The two streams together must contain exactly one known status line. No
 * process output is returned to callers or included in an error message.
 */
export function isSuccessorChatGptLoginStatusResult(result) {
  if (!result || result.error != null || result.signal != null || result.status !== 0
    || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)
    || result.stdout.length + result.stderr.length > MAX_STATUS_BYTES) return false;
  try {
    const stdout = decoder.decode(result.stdout);
    const stderr = decoder.decode(result.stderr);
    const oneLine = value => value === LOGIN_STATUS || value === `${LOGIN_STATUS}\n`
      || value === `${LOGIN_STATUS}\r\n`;
    return (oneLine(stdout) && stderr === "") || (stdout === "" && oneLine(stderr));
  } catch {
    return false;
  }
}

/** Read-only native CLI probe; never logs in, logs out, or exposes raw status. */
export function probeSuccessorChatGptLoginStatus(executable, { cwd, env } = {}) {
  const result = spawnSync(executable, ["login", "status"], {
    cwd, env, timeout: 15000, maxBuffer: MAX_STATUS_BYTES, encoding: null,
  });
  return isSuccessorChatGptLoginStatusResult(result) ? LOGIN_STATUS : null;
}
