import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateJsonSchema } from "./execution-envelope.mjs";

const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ACTION_SCHEMA_PATH = resolve(RUNTIME_ROOT, "codex-risk-action.schema.json");
const DEFAULT_APPROVAL_SCHEMA_PATH = resolve(RUNTIME_ROOT, "codex-risk-approval.schema.json");
const MAX_AUTHORITY_BYTES = 1024 * 1024;
const MAX_EXECUTOR_BYTES = 512 * 1024 * 1024;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalRiskJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalRiskDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalRiskJson(value)).digest("hex")}`;
}

function rawDigest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export function readStableAuthorityFile(path, label) {
  const absolute = resolve(path);
  const before = lstatSync(absolute);
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must be a regular non-symlink file`);
  if (realpathSync(absolute) !== absolute) throw new Error(`${label} must not traverse a symbolic link`);
  if (before.size <= 0 || before.size > MAX_AUTHORITY_BYTES) throw new Error(`${label} size is outside the accepted range`);
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameIdentity(before, opened)) throw new Error(`${label} changed while opening`);
    const bytes = readFileSync(descriptor);
    const afterDescriptor = fstatSync(descriptor);
    const afterPath = lstatSync(absolute);
    if (!sameIdentity(opened, afterDescriptor) || !sameIdentity(opened, afterPath) || realpathSync(absolute) !== absolute) throw new Error(`${label} changed while reading`);
    return { path: absolute, bytes, file_sha256: `sha256:${rawDigest(bytes)}` };
  } finally {
    closeSync(descriptor);
  }
}

export function readStableExecutableFile(path, label = "Codex executable") {
  const absolute = resolve(path);
  const before = lstatSync(absolute);
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must resolve to a regular non-symlink file`);
  if (realpathSync(absolute) !== absolute) throw new Error(`${label} canonical path must not traverse a symbolic link`);
  if ((before.mode & 0o111) === 0) throw new Error(`${label} is not executable`);
  if (before.size <= 0 || before.size > MAX_EXECUTOR_BYTES) throw new Error(`${label} size is outside the accepted range`);
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameIdentity(before, opened)) throw new Error(`${label} changed while opening`);
    const bytes = readFileSync(descriptor);
    const afterDescriptor = fstatSync(descriptor);
    const afterPath = lstatSync(absolute);
    if (!sameIdentity(opened, afterDescriptor) || !sameIdentity(opened, afterPath) || realpathSync(absolute) !== absolute) throw new Error(`${label} changed while reading`);
    return { path: absolute, bytes, file_sha256: `sha256:${rawDigest(bytes)}` };
  } finally {
    closeSync(descriptor);
  }
}

function parseClosedJson(evidence, schemaPath, label) {
  let value;
  try {
    value = JSON.parse(evidence.bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  const errors = validateJsonSchema(value, { schemaPath });
  if (errors.length > 0) throw new Error(`${label} does not match its closed schema: ${errors.join("; ")}`);
  return value;
}

function validateTargetScope(paths) {
  for (const path of paths) {
    if (isAbsolute(path) || path.includes("\0") || path.split(/[\\/]/u).includes("..")) throw new Error("risk action target_scope must contain only relative paths inside target");
  }
}

export function readRiskAction(path, { schemaPath = DEFAULT_ACTION_SCHEMA_PATH } = {}) {
  const evidence = readStableAuthorityFile(path, "risk action descriptor");
  const value = parseClosedJson(evidence, schemaPath, "risk action descriptor");
  validateTargetScope(value.target_scope);
  return { ...evidence, value };
}

export function createRiskApprovalRequest({ actionEvidence, invocation }) {
  const action = actionEvidence.value;
  if (invocation.repository.repository_id !== action.repository_id
    || canonicalRiskJson(invocation.target_scope) !== canonicalRiskJson(action.target_scope)
    || invocation.risk_gate !== action.risk_gate
    || invocation.operation !== action.operation
    || canonicalRiskJson(invocation.permitted_effects) !== canonicalRiskJson(action.permitted_effects)
    || canonicalRiskJson(invocation.prohibited_effects) !== canonicalRiskJson(action.prohibited_effects)) {
    throw new Error("risk invocation does not exactly match the action descriptor, including repository identity");
  }
  const requestWithoutDigest = {
    schema_version: "1.0.0",
    kind: "codex_risk_approval_request",
    approval_authority: action.approval_authority,
    action,
    action_sha256: canonicalRiskDigest(action),
    action_file_sha256: actionEvidence.file_sha256,
    invocation,
    invocation_sha256: canonicalRiskDigest(invocation),
  };
  return { ...requestWithoutDigest, request_sha256: canonicalRiskDigest(requestWithoutDigest) };
}

function insidePath(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

export function verifyRiskApproval({ approvalPath, approvalSha256, expectedRequest, target, schemaPath = DEFAULT_APPROVAL_SCHEMA_PATH }) {
  const rejected = (reason, evidence = null) => ({ status: "rejected", reasons: [reason], evidence });
  if (!approvalPath || !/^[a-f0-9]{64}$/u.test(approvalSha256 ?? "")) return rejected("approval requires an exact lowercase raw SHA256 trust value");
  let evidence;
  try {
    evidence = readStableAuthorityFile(approvalPath, "risk approval");
  } catch (error) {
    return rejected(error.message);
  }
  let canonicalTarget;
  try {
    canonicalTarget = realpathSync(target);
  } catch (error) {
    return rejected(`risk approval target is unavailable: ${error.message}`, evidence);
  }
  if (insidePath(evidence.path, canonicalTarget)) return rejected("risk approval must be supplied from outside the target repository", evidence);
  if (evidence.file_sha256 !== `sha256:${approvalSha256}`) return rejected("risk approval raw file SHA256 does not match the caller-supplied trust value", evidence);
  let value;
  try {
    value = parseClosedJson(evidence, schemaPath, "risk approval");
  } catch (error) {
    return rejected(error.message, evidence);
  }
  const requestWithoutDigest = { ...value.request };
  delete requestWithoutDigest.request_sha256;
  if (value.request.request_sha256 !== canonicalRiskDigest(requestWithoutDigest)) return rejected("risk approval request self-digest is invalid", evidence);
  if (value.request_sha256 !== value.request.request_sha256) return rejected("risk approval outer request digest disagrees with the embedded request", evidence);
  if (canonicalRiskJson(value.request) !== canonicalRiskJson(expectedRequest)) return rejected("risk approval does not exactly match the current request", evidence);
  if (value.decision !== "approved") return rejected("approval authority rejected the exact request", evidence);
  return { status: "approved", reasons: [], evidence, value };
}
