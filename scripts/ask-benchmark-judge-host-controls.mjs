import { dirname, isAbsolute, resolve } from "node:path";
import { canonicalDigest, parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";

export const JUDGE_HOST_POLICY_REVISION = "seatbelt-loopback-bootstrap-v1";
export const JUDGE_HOST_SANDBOX = "/usr/bin/sandbox-exec";
export const CONTROL_IDS = Object.freeze([
  "read_allowed", "write_allowed", "read_protected", "read_forbidden",
  "write_protected", "write_auth_link", "replace_protected", "unlink_protected",
  "connect_allowed", "connect_forbidden",
]);
const allowed = new Set(["read_allowed", "write_allowed", "read_protected", "connect_allowed"]);
function check(ok, message) { if (!ok) throw new Error(`JUDGE_HOST_CONTROL_INVALID: ${message}`); }
function path(value) {
  check(typeof value === "string" && isAbsolute(value) && resolve(value) === value
    && !/[\x00-\x1f\x7f]/u.test(value), "canonical path");
  return value;
}
function quoted(value) { return JSON.stringify(path(value)); }

/** Whole-child policy; not Codex's model-command sandbox. No arbitrary policy text is accepted. */
export function judgeHostControlPolicy(root, port) {
  path(root);
  check(Number.isSafeInteger(port) && port > 0 && port <= 65535, "loopback port");
  const p = name => quoted(resolve(root, name));
  const literals = ["codex-native", "control-native", "model-catalog.json", "instruction.txt",
    "response-schema.json", "allowed-read.txt", "protected-canary.txt"];
  const ancestors = new Set(["/usr", "/System", "/System/Library"]);
  for (let next = root; ; next = dirname(next)) { ancestors.add(next); if (next === "/") break; }
  const metadata = [...ancestors].map(value => `(literal ${quoted(value)})`).join(" ");
  // Dynamic linker/system library reads are not user-data access. Additions need
  // review; this candidate has no broad /System or user-HOME read fallback.
  return `(version 1)
(deny default)
(allow process-exec (literal ${p("codex-native")}) (literal ${p("control-native")}))
(allow process-fork)
(allow signal (target same-sandbox))
(allow process-info* (target same-sandbox))
(allow sysctl-read)
(allow file-read-metadata ${metadata} (subpath "/usr/lib") (subpath "/System/Library/dyld") (subpath ${quoted(root)}))
(allow file-read-data
  (subpath "/usr/lib") (subpath "/System/Library/dyld")
  (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom")
  ${literals.map(name => `(literal ${p(name)})`).join("\n  ")}
  (subpath ${p("home")}) (subpath ${p("scratch")}) (subpath ${p("workspace")}))
(allow file-write* (require-all
  (require-any (subpath ${p("home")}) (subpath ${p("scratch")}) (literal ${p("final.json")}))
  (require-not (literal ${p("protected-canary.txt")}))
  (require-not (literal ${p("home/.codex/auth-canary-link")}))))
(allow file-write-data (literal "/dev/null"))
(allow network-outbound (remote ip "localhost:${port}"))
`;
}

export function judgeHostControlTemplateDigest() {
  return canonicalDigest({ revision: JUDGE_HOST_POLICY_REVISION,
    policy: judgeHostControlPolicy("/__ask_host_bootstrap__", 12345) });
}

/** The raw fixed probe's syscall outcomes, not a caller's six booleans. */
export function inspectJudgeHostControlTrace(bytes, { mode, deniedConnections, baselineReachable, canariesUnchanged }) {
  const value = parseJsonRejectDuplicateKeys(bytes, "host control trace");
  check(value?.type === "host_control_result" && value.mode === mode, "probe mode");
  check(Array.isArray(value.results) && value.results.length === CONTROL_IDS.length, "probe inventory");
  const failed = [];
  for (const [index, row] of value.results.entries()) {
    check(row && Object.keys(row).sort().join("|") === "errno|id|ok"
      && row.id === CONTROL_IDS[index] && typeof row.ok === "boolean"
      && Number.isInteger(row.errno) && row.errno >= 0, "probe row");
    // File-not-found, refused connection and timeout do not prove a denial.
    if (allowed.has(row.id) ? (!row.ok || row.errno !== 0) : (row.ok || ![1, 13].includes(row.errno))) failed.push(row.id);
  }
  if (baselineReachable !== true) failed.push("negative_listener_control");
  if (deniedConnections !== 0) failed.push("denied_connection_observed");
  if (canariesUnchanged !== true) failed.push("canary_changed");
  return { verdict: failed.length ? "failed" : "passed", failed_controls: failed,
    results: value.results, synthetic: mode === "synthetic", policy_revision: JUDGE_HOST_POLICY_REVISION };
}
