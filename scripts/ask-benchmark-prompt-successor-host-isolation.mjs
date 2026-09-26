import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, relative, resolve, sep } from "node:path";
import {
  assertNoSymlinkPathSegments, canonicalDigest, parseJsonRejectDuplicateKeys,
} from "./content-addressed-store.mjs";
import { successorEffectiveCommand, assertSuccessorAdapterFacts, assertSuccessorProfileCommand } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { effectiveCommand } from "./ask-benchmark-execution.mjs";
import { successorExact, successorFail } from "./ask-benchmark-prompt-successor.mjs";

const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const PROFILE = "ask_issue291";

function inside(parent, path) {
  const offset = relative(parent, path);
  return offset === "" || (offset !== ".." && !offset.startsWith(`..${sep}`) && !offset.startsWith("/"));
}

function regular(path, label) {
  assertNoSymlinkPathSegments(path, label);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) successorFail("SUCCESSOR_HOST_ISOLATION_INVALID", label);
  return realpathSync(path);
}

function capturedEnvironment(identity) {
  const values = {};
  const entries = identity.environment_snapshot?.entries;
  if (!Array.isArray(entries)) successorFail("SUCCESSOR_HOST_ISOLATION_INVALID", "native environment snapshot");
  successorExact(canonicalDigest(entries), identity.environment_snapshot.digest, "native environment snapshot digest");
  successorExact(entries.map(entry => entry.name).sort(), [...identity.environment_allowlist].sort(), "native environment names");
  for (const entry of entries) {
    if (entry.name === "CODEX_HOME") {
      // The measured runner replaces CODEX_HOME with a fresh isolated home.
      continue;
    }
    const current = Object.hasOwn(process.env, entry.name) ? process.env[entry.name] : undefined;
    successorExact(current !== undefined, entry.present, `native environment ${entry.name} presence`);
    if (current !== undefined) {
      successorExact(hash(Buffer.from(current)), entry.digest, `native environment ${entry.name} bytes`);
      successorExact(Buffer.byteLength(current), entry.bytes, `native environment ${entry.name} length`);
      values[entry.name] = current;
    }
  }
  return values;
}

function runSandbox(executable, args, options, expectedStatus) {
  const result = spawnSync(executable, args, {
    ...options, encoding: "utf8", timeout: 15000, killSignal: "SIGKILL", maxBuffer: 16 * 1024,
  });
  if (result.error || result.signal || result.status !== expectedStatus) {
    successorFail("SUCCESSOR_HOST_ISOLATION_PROBE_FAILED", "native sandbox control or deny probe");
  }
  return result;
}

/**
 * Model-free probe of the exact native binary and explicit permission profile.
 * It never invokes `codex exec`, so its evidence must not be described as an
 * observed model-session sandbox or provider identity.
 */
export function probeSuccessorPrivateRootDeny({ root, source, runtime, privateManifestPath, expectedManifestPathDigest }) {
  const repository = realpathSync(resolve(root));
  const configPath = regular(resolve(source.runtimeConfigPath), "native runtime config");
  const configBytes = readFileSync(configPath);
  successorExact(hash(configBytes), runtime.configuration_digest, "native runtime config bytes");
  const config = parseJsonRejectDuplicateKeys(configBytes, "native runtime config");
  const privateRoot = realpathSync(resolve(config.successor_private_evaluator_root));
  assertNoSymlinkPathSegments(privateRoot, "private evaluator deny root");
  if (inside(repository, privateRoot) || inside(privateRoot, repository)) {
    successorFail("SUCCESSOR_HOST_ISOLATION_INVALID", "private deny root overlaps repository");
  }
  const manifest = regular(resolve(privateManifestPath), "private evaluator manifest");
  if (!inside(privateRoot, manifest)) successorFail("SUCCESSOR_HOST_ISOLATION_INVALID", "private manifest outside deny root");
  successorExact(canonicalDigest({ path: manifest }), expectedManifestPathDigest, "admitted private manifest path");
  // Open only a descriptor. No private bytes enter this process or the probe output.
  closeSync(openSync(manifest, "r"));

  const identityPath = regular(resolve(source.execution.runDir, "adapters/codex.json"), "native adapter identity");
  const identity = parseJsonRejectDuplicateKeys(readFileSync(identityPath), "native adapter identity");
  assertSuccessorAdapterFacts(runtime, identity, { checkHost: true });
  successorExact(canonicalDigest(identity), source.scope.source.runtime_identity_digest, "native scoped runtime identity");
  successorExact(hash(configBytes), `sha256:${identity.runtime_config_sha256}`, "native adapter config bytes");
  const expectedCommand = successorEffectiveCommand(effectiveCommand(repository, config), { privateEvaluatorRoot: privateRoot });
  successorExact(identity.effective_command, expectedCommand, "native exact effective command");
  successorExact(assertSuccessorProfileCommand(identity.effective_command, privateRoot), privateRoot, "native private profile");
  for (const binding of source.scope.source.bindings) {
    successorExact(binding.effective_command_digest, identity.effective_command_digest, "native scoped command digest");
  }

  const executable = regular(resolve(source.agentBin), "native Codex executable");
  successorExact(basename(executable), "codex", "native executable basename");
  const executableDigest = hash(readFileSync(executable));
  successorExact(executableDigest, runtime.executable_digest, "native executable bytes");
  successorExact(executableDigest, `sha256:${identity.executable.executable_sha256}`, "native adapter executable bytes");
  const environment = capturedEnvironment(identity);
  const settings = [];
  const argv = identity.effective_command.argv;
  for (let index = 0; index < argv.length; index++) if (argv[index] === "-c") settings.push(argv[++index]);
  const isolatedHome = mkdtempSync(resolve(tmpdir(), "ask-successor-isolation-home-"));
  chmodSync(isolatedHome, 0o700);
  try {
    const options = { cwd: repository, env: { ...environment, CODEX_HOME: isolatedHome } };
    const args = ["sandbox", "-P", PROFILE, "--include-managed-config",
      ...settings.flatMap(setting => ["-c", setting]), "-C", repository, "--"];
    runSandbox(executable, [...args, "/bin/sh", "-c", "exit 0"], options, 0);
    const denied = runSandbox(executable, [...args, "/bin/sh", "-c", 'exec 3< "$1"', "_", manifest], options, 1);
    if (!/(?:Operation not permitted|Permission denied)/u.test(denied.stderr ?? "") || denied.stdout !== "") {
      successorFail("SUCCESSOR_HOST_ISOLATION_PROBE_FAILED", "native sandbox did not report a private read denial");
    }
  } finally {
    rmSync(isolatedHome, { recursive: true, force: true });
  }
  const evidence = {
    schema_version: "1.0.0", kind: "successor_host_isolation_probe",
    method: "native_codex_sandbox_explicit_permission_profile_read_open",
    model_calls: 0, exec_session_policy_observed: false,
    host: { os: process.platform, arch: process.arch, node_version: process.version },
    executable_path_digest: canonicalDigest({ path: executable }), executable_digest: executableDigest,
    runtime_config_path_digest: canonicalDigest({ path: configPath }), runtime_config_digest: hash(configBytes),
    runtime_identity_digest: canonicalDigest(identity), effective_command_digest: identity.effective_command_digest,
    environment_snapshot_digest: identity.environment_snapshot.digest,
    private_deny_root_path_digest: canonicalDigest({ path: privateRoot }),
    private_manifest_path_digest: canonicalDigest({ path: manifest }),
    allowed_control_observed: true, private_read_denied_observed: true,
  };
  return { ...evidence, probe_digest: canonicalDigest(evidence) };
}
