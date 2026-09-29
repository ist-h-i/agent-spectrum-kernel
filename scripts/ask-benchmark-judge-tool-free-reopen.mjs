#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonRejectDuplicateKeys, readStableBytes } from "./content-addressed-store.mjs";
import {
  JUDGE_TOOL_FREE_CATALOG_SHA256, JUDGE_TOOL_FREE_CLI_SHA256, JUDGE_TOOL_FREE_CLI_VERSION,
  inspectJudgeToolFreeRequest,
} from "./ask-benchmark-judge-tool-free-profile.mjs";

const sha256 = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function check(ok, message) { if (!ok) throw new Error(`JUDGE_TOOL_FREE_REOPEN_INVALID: ${message}`); }
function readRegular(root, name, maximumBytes) {
  return readStableBytes(resolve(root, name), `Judge tool-free ${name}`, maximumBytes);
}
function readJson(root, name) {
  return parseJsonRejectDuplicateKeys(readRegular(root, name, 1024 * 1024), name);
}

/** Recompute TF3 from saved request bytes and non-secret HTTP metadata. */
export function reopenJudgeToolFreeCapture(evidenceRoot) {
  check(typeof evidenceRoot === "string" && isAbsolute(evidenceRoot)
    && resolve(evidenceRoot) === evidenceRoot && realpathSync(evidenceRoot) === evidenceRoot,
  "absolute canonical evidence root");
  const precall = readJson(evidenceRoot, "precall.json");
  const result = readJson(evidenceRoot, "result.json");
  check(precall.kind === "judge_tool_free_capture_precall"
    && result.kind === "judge_tool_free_capture_result", "record kinds");
  check(precall.cli_version === JUDGE_TOOL_FREE_CLI_VERSION
    && result.cli_version === JUDGE_TOOL_FREE_CLI_VERSION
    && precall.executable_digest === JUDGE_TOOL_FREE_CLI_SHA256
    && result.executable_digest === JUDGE_TOOL_FREE_CLI_SHA256
    && precall.catalog_digest === JUDGE_TOOL_FREE_CATALOG_SHA256
    && result.catalog_digest === JUDGE_TOOL_FREE_CATALOG_SHA256,
  "fixed CLI and catalog identity");
  const count = result.loopback_request_count;
  check(Number.isSafeInteger(count) && count >= 0 && count <= 8, "bounded request count");
  const evidence = result.request_evidence ?? (count === 0 ? [] : null);
  check(Array.isArray(evidence) && evidence.length === count, "request evidence inventory");
  const expectedFiles = new Set();
  const requests = [];
  for (let index = 1; index <= count; index++) {
    const bodyName = `request-${index}.bin`, metadataName = `request-${index}.json`;
    expectedFiles.add(bodyName); expectedFiles.add(metadataName);
    const body = readRegular(evidenceRoot, bodyName, 4 * 1024 * 1024);
    const metadataBytes = readRegular(evidenceRoot, metadataName, 1024 * 1024);
    const metadata = parseJsonRejectDuplicateKeys(metadataBytes, metadataName);
    check(evidence[index - 1]?.body_sha256 === sha256(body)
      && evidence[index - 1]?.metadata_sha256 === sha256(metadataBytes),
    `request ${index} saved digests`);
    check(metadata.kind === "judge_tool_free_http_request"
      && metadata.body_sha256 === sha256(body)
      && typeof metadata.method === "string" && typeof metadata.path === "string"
      && typeof metadata.remote_address === "string"
      && Array.isArray(metadata.header_names)
      && metadata.header_names.every(name => typeof name === "string" && name.length > 0)
      && new Set(metadata.header_names).size === metadata.header_names.length,
    `request ${index} metadata`);
    requests.push({ method: metadata.method, path: metadata.path,
      remote_address: metadata.remote_address,
      headers: Object.fromEntries(metadata.header_names.map(name => [name, ""])), body });
  }
  const actualFiles = readdirSync(evidenceRoot).filter(name => /^request-\d+\.(?:bin|json)$/u.test(name));
  check(actualFiles.length === expectedFiles.size && actualFiles.every(name => expectedFiles.has(name)),
    "request file inventory");
  let inspection = null;
  try { inspection = inspectJudgeToolFreeRequest(requests); } catch { /* A failed probe is preserved. */ }
  if (result.inspection !== null) {
    check(result.failure === null && inspection !== null, "recorded success without valid request");
    check(Number.isInteger(result.cli_exit_code) && result.cli_exit_code !== 0
      && result.cli_signal === null && result.cli_cause === null,
    "recorded success contradicts CLI termination");
    check(precall.cwd === resolve(evidenceRoot, "workspace")
      && precall.executable === resolve(evidenceRoot, "codex-0.157.1-native")
      && Array.isArray(precall.workspace_initial_files) && precall.workspace_initial_files.length === 0
      && Array.isArray(precall.codex_home_initial_files) && precall.codex_home_initial_files.length === 0
      && Array.isArray(result.codex_home_initial_files) && result.codex_home_initial_files.length === 0
      && Array.isArray(result.workspace_final_files) && result.workspace_final_files.length === 0
      && readdirSync(precall.cwd).length === 0,
    "recorded success contradicts workspace state");
    check(precall.credential_source === "none" && result.credential_source === "none"
      && precall.benchmark_input === false && precall.private_evaluator_path_supplied === false
      && result.benchmark_workspace_as_child_cwd === false
      && result.private_evaluator_path_supplied === false,
    "recorded success contradicts probe boundary");
    try { assert.deepEqual(result.inspection, inspection); }
    catch { throw new Error("JUDGE_TOOL_FREE_REOPEN_INVALID: inspection differs from saved request"); }
  } else check(result.failure !== null, "recorded failure missing reason");
  return { evidence_root: evidenceRoot, request_count: count,
    captured_request_verified: result.inspection !== null && inspection !== null,
    failure: result.failure, inspection };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length === 4 && process.argv[2] === "--evidence-root", "expected --evidence-root path");
    process.stdout.write(JSON.stringify(reopenJudgeToolFreeCapture(process.argv[3])) + "\n");
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
