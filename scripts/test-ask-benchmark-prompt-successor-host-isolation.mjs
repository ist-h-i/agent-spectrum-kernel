import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { canonicalDigest } from "./content-addressed-store.mjs";
import { effectiveCommand } from "./ask-benchmark-execution.mjs";
import { successorEffectiveCommand } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { probeSuccessorPrivateRootDeny } from "./ask-benchmark-prompt-successor-host-isolation.mjs";

const root = realpathSync(resolve(fileURLToPath(new URL("..", import.meta.url))));
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const nativeBin = process.env.ASK_ISSUE291_NATIVE_CODEX;

test("native profile probe binds exact binary, config, command, host and denies private read-open", {
  skip: process.platform !== "darwin" || !nativeBin ? "set ASK_ISSUE291_NATIVE_CODEX to the local native Codex executable" : false,
}, () => {
  const work = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-successor-isolation-test-")));
  chmodSync(work, 0o700);
  try {
    const privateRoot = resolve(work, "private");
    const runDir = resolve(work, "run");
    mkdirSync(privateRoot); mkdirSync(runDir); mkdirSync(resolve(runDir, "adapters"));
    const privateManifestPath = resolve(privateRoot, "private-evaluator-bundle.json");
    writeFileSync(privateManifestPath, "private-canary\n", { mode: 0o600 });
    const config = { adapter: "codex", availability: "available", model: "test-model", reasoning_effort: "medium",
      permission_policy: "never", sandbox_policy: "workspace-write", case_timeout_ms: 900000,
      successor_private_evaluator_root: privateRoot };
    const runtimeConfigPath = resolve(work, "runtime.json");
    writeFileSync(runtimeConfigPath, `${JSON.stringify(config)}\n`);
    const executable = realpathSync(nativeBin);
    const version = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 10000 });
    assert.equal(version.status, 0);
    const cliVersion = /^codex-cli (\d+\.\d+\.\d+)\s*$/u.exec(version.stdout)?.[1];
    assert.ok(cliVersion);
    const runtime = { adapter: "codex", cli_version: cliVersion, executable_digest: hash(readFileSync(executable)),
      node_version: process.version, os: process.platform, arch: process.arch, model: config.model,
      provider_model_revision: { status: "unknown", value: null }, reasoning_effort: "medium",
      authentication_mode: "chatgpt_subscription", configuration_digest: hash(readFileSync(runtimeConfigPath)),
      sandbox: "workspace-write", approval_policy: "never", agent_network: "disabled",
      provider_network: "provider_only", timeout_ms: 900000 };
    const command = successorEffectiveCommand(effectiveCommand(root, config), { privateEvaluatorRoot: privateRoot });
    const home = process.env.HOME;
    assert.ok(home);
    const entries = [{ name: "HOME", present: true, value: null, digest: hash(Buffer.from(home)), bytes: Buffer.byteLength(home) }];
    const identity = { adapter: "codex", availability: "available", model: config.model, reasoning_effort: "medium",
      sandbox_policy: "workspace-write", permission_policy: "never", case_timeout_ms: 900000,
      executable: { executable_basename: "codex", observed_version: cliVersion,
        executable_sha256: runtime.executable_digest.slice(7) },
      runtime_config_sha256: runtime.configuration_digest.slice(7), effective_command: command,
      effective_command_digest: canonicalDigest(command), environment_allowlist: ["HOME"],
      environment_snapshot: { entries, digest: canonicalDigest(entries) } };
    writeFileSync(resolve(runDir, "adapters/codex.json"), `${JSON.stringify(identity)}\n`);
    const source = { runtimeConfigPath, agentBin: executable, execution: { runDir },
      scope: { source: { runtime_identity_digest: canonicalDigest(identity),
        bindings: [{ effective_command_digest: identity.effective_command_digest }] } } };
    const input = { root, source, runtime, privateManifestPath,
      expectedManifestPathDigest: canonicalDigest({ path: privateManifestPath }) };
    const proof = probeSuccessorPrivateRootDeny(input);
    assert.equal(proof.model_calls, 0);
    assert.equal(proof.exec_session_policy_observed, false);
    assert.equal(proof.allowed_control_observed, true);
    assert.equal(proof.private_read_denied_observed, true);
    assert.equal(proof.executable_digest, runtime.executable_digest);
    assert.throws(() => probeSuccessorPrivateRootDeny({ ...input, expectedManifestPathDigest: canonicalDigest({ different: true }) }));
    writeFileSync(runtimeConfigPath, `${JSON.stringify({ ...config, model: "drift" })}\n`);
    assert.throws(() => probeSuccessorPrivateRootDeny(input));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
