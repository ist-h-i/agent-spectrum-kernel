#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSuccessorNativeExecutable } from "./ask-benchmark-prompt-successor-native.mjs";
import {
  JUDGE_TOOL_FREE_CATALOG_SHA256, JUDGE_TOOL_FREE_CLI_SHA256, JUDGE_TOOL_FREE_CLI_VERSION, JUDGE_TOOL_FREE_MODEL,
  buildJudgeToolFreeOverrides, inspectJudgeToolFreeCatalog, inspectJudgeToolFreeRequest,
} from "./ask-benchmark-judge-tool-free-profile.mjs";
import { reopenJudgeToolFreeCapture } from "./ask-benchmark-judge-tool-free-reopen.mjs";

const REPOSITORY = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CATALOG = resolve(REPOSITORY, "benchmarks/prompt-successor-judge-tool-free-catalog.json");
const MAX_STREAM = 1024 * 1024;
const MAX_REQUEST = 4 * 1024 * 1024;
const sha256 = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function check(ok, message) { if (!ok) throw new Error(`JUDGE_TOOL_FREE_CAPTURE_INVALID: ${message}`); }
function inside(parent, child) {
  const offset = relative(parent, child);
  return offset === "" || (offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset));
}
function argument(name) {
  const index = process.argv.indexOf(name);
  check(index > 0 && index + 1 < process.argv.length && process.argv.indexOf(name, index + 1) < 0, `one ${name} required`);
  return process.argv[index + 1];
}
function save(root, name, bytes) {
  writeFileSync(resolve(root, name), bytes, { flag: "wx", mode: 0o600 });
}
function processOutput(child, timeoutMs) {
  return new Promise(resolveResult => {
    const output = { stdout: [], stderr: [] };
    const count = { stdout: 0, stderr: 0 };
    let cause = null, done = false;
    const finish = (exitCode, signal) => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolveResult({
        exit_code: exitCode, signal, cause,
        stdout: Buffer.concat(output.stdout), stderr: Buffer.concat(output.stderr),
      });
    };
    const stop = why => {
      cause ??= why;
      if (child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); }
        catch (error) { if (error.code !== "ESRCH") cause = `${why}:kill_failed`; }
      }
    };
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    child.on("error", error => { cause = error.code ?? "spawn_error"; });
    for (const stream of ["stdout", "stderr"]) child[stream].on("data", chunk => {
      count[stream] += chunk.length;
      if (count[stream] > MAX_STREAM) { stop("output_limit"); return; }
      output[stream].push(chunk);
    });
    child.once("close", finish);
  });
}

async function main() {
  check(process.argv.length === 8, "expected --codex-bin, --expected-sha256, and --evidence-root");
  const executable = realpathSync(argument("--codex-bin"));
  const expectedDigest = argument("--expected-sha256");
  check(process.platform === "darwin" && process.arch === "arm64", "candidate native image requires darwin arm64");
  check(expectedDigest === JUDGE_TOOL_FREE_CLI_SHA256, "expected digest must match fixed 0.157.1 image");
  const requestedRoot = argument("--evidence-root");
  check(isAbsolute(requestedRoot) && resolve(requestedRoot) === requestedRoot, "absolute evidence root");
  const evidenceRoot = resolve(realpathSync(dirname(requestedRoot)), requestedRoot.split(sep).at(-1));
  check(!inside(REPOSITORY, evidenceRoot) && !inside(evidenceRoot, REPOSITORY), "evidence root outside repository");
  const native = assertSuccessorNativeExecutable({
    path: executable, expectedDigest, os: process.platform, arch: process.arch,
  });
  check(native.executable_digest === expectedDigest, "pinned native image");
  const catalog = readFileSync(CATALOG);
  inspectJudgeToolFreeCatalog(catalog);
  check(sha256(catalog) === JUDGE_TOOL_FREE_CATALOG_SHA256, "catalog identity");
  mkdirSync(evidenceRoot, { mode: 0o700 });
  const workspace = resolve(evidenceRoot, "workspace");
  const home = resolve(evidenceRoot, "home");
  const codexHome = resolve(evidenceRoot, "codex-home");
  const xdgHome = resolve(evidenceRoot, "xdg");
  for (const dir of [workspace, home, codexHome, xdgHome]) mkdirSync(dir, { mode: 0o700 });
  check(readdirSync(workspace).length === 0 && readdirSync(codexHome).length === 0, "fresh child state");
  const catalogPath = resolve(evidenceRoot, "model-catalog.json");
  const instructionPath = resolve(evidenceRoot, "instruction.txt");
  save(evidenceRoot, "model-catalog.json", catalog);
  save(evidenceRoot, "instruction.txt", Buffer.from("Judge tool inventory capture only. Return OK.\n"));
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = []; let length = 0;
    request.on("data", chunk => {
      length += chunk.length;
      if (length > MAX_REQUEST) { request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => {
      requests.push({
        method: request.method, path: request.url, headers: request.headers,
        body: Buffer.concat(chunks),
        remote_address: request.socket.remoteAddress,
      });
      response.writeHead(400, { "content-type": "application/json", connection: "close" });
      response.end('{"error":{"type":"capture_only","message":"local request capture; no model"}}');
    });
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  check(address?.address === "127.0.0.1" && Number.isInteger(address.port), "loopback listener");
  const overrides = buildJudgeToolFreeOverrides({
    catalogPath, instructionPath, captureBaseUrl: `http://127.0.0.1:${address.port}/v1`,
  });
  const argv = [
    "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--strict-config",
    "--skip-git-repo-check", "--json", "--model", JUDGE_TOOL_FREE_MODEL,
    ...overrides.flatMap(value => ["-c", value]), "-",
  ];
  const env = {
    HOME: home, CODEX_HOME: codexHome, XDG_CONFIG_HOME: xdgHome,
    PATH: "/usr/bin:/bin", LANG: "C.UTF-8", NO_COLOR: "1",
  };
  save(evidenceRoot, "precall.json", Buffer.from(JSON.stringify({
    schema_version: "1.0.0", kind: "judge_tool_free_capture_precall",
    cli_version: JUDGE_TOOL_FREE_CLI_VERSION, executable, executable_digest: native.executable_digest,
    native_image: { os: native.os, arch: native.arch, format: native.format, bytes: native.bytes },
    catalog_digest: JUDGE_TOOL_FREE_CATALOG_SHA256, argv, cwd: workspace,
    environment_names: Object.keys(env).sort(), credential_source: "none",
    codex_home_initial_files: [], workspace_initial_files: [],
    benchmark_input: false, private_evaluator_path_supplied: false,
    local_endpoint: `http://127.0.0.1:${address.port}/v1`,
  }, null, 2) + "\n"));
  let processResult;
  try {
    const child = spawn(executable, argv, {
      cwd: workspace, env, shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"],
    });
    const completion = processOutput(child, 30000);
    child.stdin.on("error", () => {});
    child.stdin.end("Synthetic local request capture. Respond OK without tools.\n");
    processResult = await completion;
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
  save(evidenceRoot, "stdout.bin", processResult.stdout);
  save(evidenceRoot, "stderr.bin", processResult.stderr);
  const requestEvidence = [];
  for (const [index, request] of requests.entries()) {
    save(evidenceRoot, `request-${index + 1}.bin`, request.body);
    const metadata = Buffer.from(JSON.stringify({
      schema_version: "1.0.0", kind: "judge_tool_free_http_request",
      method: request.method, path: request.path,
      remote_address: request.remote_address,
      header_names: Object.keys(request.headers).sort(),
      body_sha256: sha256(request.body),
    }, null, 2) + "\n");
    save(evidenceRoot, `request-${index + 1}.json`, metadata);
    requestEvidence.push({ body_sha256: sha256(request.body), metadata_sha256: sha256(metadata) });
  }
  let inspection = null, failure = null;
  try {
    check(processResult.cause === null && processResult.signal === null, "CLI process completed without timeout or signal");
    check(processResult.exit_code !== 0, "capture endpoint must reject completion");
    check(readdirSync(workspace).length === 0, "capture workspace changed");
    inspection = inspectJudgeToolFreeRequest(requests);
  } catch (error) { failure = error.message; }
  const result = {
    schema_version: "1.0.0", kind: "judge_tool_free_capture_result",
    cli_version: JUDGE_TOOL_FREE_CLI_VERSION, executable_digest: expectedDigest,
    catalog_digest: JUDGE_TOOL_FREE_CATALOG_SHA256,
    cli_exit_code: processResult.exit_code, cli_signal: processResult.signal,
    cli_cause: processResult.cause, loopback_request_count: requests.length,
    request_evidence: requestEvidence,
    workspace_final_files: readdirSync(workspace),
    codex_home_initial_files: [], credential_source: "none",
    benchmark_workspace_as_child_cwd: false, private_evaluator_path_supplied: false,
    inspection, failure,
  };
  save(evidenceRoot, "result.json", Buffer.from(JSON.stringify(result, null, 2) + "\n"));
  const reopened = reopenJudgeToolFreeCapture(evidenceRoot);
  process.stdout.write(JSON.stringify({ evidence_root: evidenceRoot, ...result, reopened }) + "\n");
  if (failure !== null) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
