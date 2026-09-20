#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertNoManagedCodexConfiguration,
  canonicalRiskDigest,
  createRiskApprovalRequest,
  materializeRiskExecutionEnvironment,
  readRiskAction,
  resolveRiskCodexExecutor,
  resolveRiskExecutionEnvironment,
  riskCodexRuntimePolicy,
  verifyRiskApproval,
  verifyRiskCodexExecutor,
} from "./codex-risk-approval.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "codex-risk-approval-")));
const target = resolve(temporaryRoot, "target");
const actionPath = resolve(temporaryRoot, "risk-action.json");
const approvalPath = resolve(temporaryRoot, "approval.json");
const actionSchemaPath = resolve(root, "schemas/codex-risk-action.schema.json");
const approvalSchemaPath = resolve(root, "schemas/codex-risk-approval.schema.json");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (character) => `sha256:${character.repeat(64)}`;
const action = {
  schema_version: "1.0.0",
  action_id: "release-fixture",
  repository_id: "github.com/example/release-fixture",
  risk_gate: "risk-gate",
  operation: "publish_release_candidate",
  target_scope: ["dist/release.json"],
  permitted_effects: ["create", "modify", "delete"],
  prohibited_effects: ["external_side_effects", "git_metadata_changes", "write_outside_target_scope"],
  approval_authority: {
    authority_id: "release-owner",
    authority_revision: "rev-7",
    evidence_sha256: digest("a"),
  },
};
const invocation = {
  repository: {
    repository_id: action.repository_id,
    repository_identity_sha256: digest("b"),
    head_sha: "c".repeat(40),
    tree_sha: "d".repeat(40),
  },
  target_scope: action.target_scope,
  prompt: {
    entry_id: "skill-implement.md",
    rendered_sha256: digest("e"),
    invocation_sha256: digest("f"),
  },
  profile: {
    installed_profile: "implementation",
    profile_id: "ask.codex.implementation.compact",
    profile_schema_version: "1.2.0",
    canonical_revision: "fixture-revision",
    canonical_source_digest: digest("1"),
    profile_fingerprint: digest("2"),
  },
  executor: {
    requested_bin: "/usr/bin/codex",
    resolution: "installed_openai_codex_platform_package",
    target_triple: "aarch64-apple-darwin",
    launcher: { canonical_path: "/usr/local/lib/node_modules/@openai/codex/bin/codex.js", raw_sha256: digest("3"), size_bytes: 3000 },
    package_manifest: { canonical_path: "/usr/local/lib/node_modules/@openai/codex/package.json", raw_sha256: digest("4"), size_bytes: 1000, package_name: "@openai/codex", package_version: "1.2.3" },
    platform_manifest: { canonical_path: "/usr/local/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/package.json", raw_sha256: digest("5"), size_bytes: 1000, package_name: "@openai/codex", package_version: "1.2.3-darwin-arm64" },
    native_binary: {
      canonical_path: "/usr/bin/codex",
      raw_sha256: digest("3"),
      size_bytes: 12345,
      executable_format: "mach-o",
    },
    spawn_path: "/usr/bin/codex",
    spawn_method: "runner_owned_verified_snapshot",
    output_path: ".agents/runs/release.md",
    candidate_network_access: "disabled",
  },
  environment: {
    inheritance: "none",
    authentication_mode: "single_api_key_environment",
    runtime_path_derivation: "runner_task_root_v1",
    public_bindings: [
      { name: "CODEX_HOME", value: "<RUNNER_TASK_ROOT>/codex-home" },
      { name: "HOME", value: "<RUNNER_TASK_ROOT>/home" },
      { name: "LANG", value: "C.UTF-8" },
      { name: "LC_ALL", value: "C.UTF-8" },
      { name: "NO_COLOR", value: "1" },
      { name: "PATH", value: "/usr/bin:/bin:/usr/sbin:/sbin" },
      { name: "SHELL", value: "/bin/sh" },
      { name: "TERM", value: "dumb" },
    ],
    secret_bindings: [{ name: "OPENAI_API_KEY", value_sha256: digest("b") }],
    stripped_injection_families: ["NODE_*", "npm_*", "DYLD_*", "LD_*", "*_PROXY", "BASH_ENV", "ENV", "GIT_*", "SSH_*"],
    environment_sha256: digest("a"),
  },
  runtime_policy: riskCodexRuntimePolicy(),
  mode: "implementation",
  sandbox: "workspace-write",
  required_gates: ["risk-gate"],
  risk_gate: "risk-gate",
  operation: action.operation,
  permitted_effects: action.permitted_effects,
  prohibited_effects: action.prohibited_effects,
};

try {
  mkdirSync(target);
  const platform = {
    "darwin:arm64": { triple: "aarch64-apple-darwin", package: "codex-darwin-arm64" },
    "darwin:x64": { triple: "x86_64-apple-darwin", package: "codex-darwin-x64" },
    "linux:arm64": { triple: "aarch64-unknown-linux-musl", package: "codex-linux-arm64" },
    "linux:x64": { triple: "x86_64-unknown-linux-musl", package: "codex-linux-x64" },
  }[`${process.platform}:${process.arch}`];
  assert.ok(platform, `risk executor fixture does not support ${process.platform}/${process.arch}`);
  const packageRoot = resolve(temporaryRoot, "node_modules/@openai/codex");
  const platformRoot = resolve(packageRoot, "node_modules/@openai", platform.package);
  const launcher = resolve(packageRoot, "bin/codex.js");
  const native = resolve(platformRoot, "vendor", platform.triple, "bin/codex");
  const packagePath = resolve(packageRoot, "package.json");
  const platformPath = resolve(platformRoot, "package.json");
  const packageManifest = { name: "@openai/codex", version: "1.2.3", bin: { codex: "bin/codex.js" } };
  const platformManifest = { name: "@openai/codex", version: `1.2.3-${process.platform}-${process.arch}`, os: [process.platform], cpu: [process.arch] };
  const launcherBytes = "#!/usr/bin/env node\nthrow new Error('identity-only fixture must not execute');\n";
  mkdirSync(resolve(packageRoot, "bin"), { recursive: true });
  mkdirSync(resolve(platformRoot, "vendor", platform.triple, "bin"), { recursive: true });
  writeFileSync(packagePath, JSON.stringify(packageManifest));
  writeFileSync(platformPath, JSON.stringify(platformManifest));
  writeFileSync(launcher, launcherBytes);
  chmodSync(launcher, 0o755);
  // Only inspect native identity: neither this Node copy nor the launcher is spawned.
  copyFileSync(process.execPath, native);
  chmodSync(native, 0o755);
  const searchPath = resolve(temporaryRoot, "path-bin");
  mkdirSync(searchPath);
  symlinkSync(launcher, resolve(searchPath, "codex"));
  const installedExecutor = resolveRiskCodexExecutor(launcher, target, { sourceEnv: { PATH: "" } });
  const searchedExecutor = resolveRiskCodexExecutor("codex", target, { sourceEnv: { PATH: searchPath } });
  assert.deepEqual(searchedExecutor, { ...installedExecutor, requested_bin: "codex" });
  assert.equal(installedExecutor.target_triple, platform.triple);
  assert.equal(installedExecutor.native_binary.canonical_path, native);
  assert.equal(installedExecutor.resolution, "installed_openai_codex_platform_package");
  assert.match(installedExecutor.launcher.canonical_path, /@openai\/codex\/bin\/codex\.js$/u);
  assert.notEqual(installedExecutor.spawn_path, installedExecutor.launcher.canonical_path, "the JavaScript launcher must be bound but never spawned on the risk path");
  assert.equal(installedExecutor.spawn_path, installedExecutor.native_binary.canonical_path);
  assert.doesNotThrow(() => verifyRiskCodexExecutor(installedExecutor));
  const staleLauncher = structuredClone(installedExecutor);
  staleLauncher.launcher.raw_sha256 = digest("0");
  assert.throws(() => verifyRiskCodexExecutor(staleLauncher), /launcher identity changed/u, "launcher drift must fail before the native spawn even though the launcher is not executed");
  const staleNative = structuredClone(installedExecutor);
  staleNative.native_binary.raw_sha256 = digest("0");
  assert.throws(() => verifyRiskCodexExecutor(staleNative), /native executable identity changed/u, "native drift must fail immediately before spawn");

  const emptyPath = resolve(temporaryRoot, "empty-path");
  mkdirSync(emptyPath);
  assert.throws(() => resolveRiskCodexExecutor("codex", target, { sourceEnv: { PATH: emptyPath } }), /Codex executable cannot be resolved: codex/u);
  writeFileSync(packagePath, JSON.stringify({ ...packageManifest, bin: { codex: "other.js" } }));
  assert.throws(() => resolveRiskCodexExecutor(launcher, target), /closed installed @openai\/codex package layout/u);
  writeFileSync(packagePath, JSON.stringify(packageManifest));
  writeFileSync(platformPath, JSON.stringify({ ...platformManifest, version: "0.0.0" }));
  assert.throws(() => resolveRiskCodexExecutor(launcher, target), /platform manifest does not bind/u);
  writeFileSync(platformPath, JSON.stringify(platformManifest));
  appendFileSync(launcher, "// identity drift\n");
  assert.throws(() => verifyRiskCodexExecutor(installedExecutor), /launcher identity changed/u);
  writeFileSync(launcher, launcherBytes);
  assert.doesNotThrow(() => verifyRiskCodexExecutor(installedExecutor));
  appendFileSync(native, "identity drift\n");
  assert.throws(() => verifyRiskCodexExecutor(installedExecutor), /native executable identity changed/u);

  const scriptExecutor = resolve(temporaryRoot, "script-executor");
  writeFileSync(scriptExecutor, "#!/bin/sh\nexit 0\n");
  chmodSync(scriptExecutor, 0o755);
  assert.throws(() => resolveRiskCodexExecutor(scriptExecutor, target), /rejects script\/interpreter launchers/u);
  const injectedBare = resolve(temporaryRoot, "codex");
  copyFileSync(process.execPath, injectedBare);
  chmodSync(injectedBare, 0o755);
  assert.throws(() => resolveRiskCodexExecutor("codex", target, { sourceEnv: { PATH: temporaryRoot } }), /must resolve through the installed @openai\/codex launcher/u);
  assert.throws(() => resolveRiskCodexExecutor(injectedBare, target), /must resolve through the installed @openai\/codex launcher/u);

  assert.throws(() => resolveRiskExecutionEnvironment({}), /requires exactly one caller-supplied API-key/u);
  assert.throws(() => resolveRiskExecutionEnvironment({ OPENAI_API_KEY: "one", CODEX_API_KEY: "two" }), /requires exactly one caller-supplied API-key/u);
  const managedConfig = resolve(temporaryRoot, "managed-config.toml");
  writeFileSync(managedConfig, "[features]\nhooks = true\n");
  assert.throws(() => assertNoManagedCodexConfiguration([managedConfig]), /rejects managed or system configuration/u);
  const environment = resolveRiskExecutionEnvironment({
    OPENAI_API_KEY: "fixture-api-key",
    NODE_OPTIONS: "--require=/tmp/injected.cjs",
    NODE_PATH: "/tmp/injected-node-path",
    npm_config_user_agent: "injected",
    DYLD_INSERT_LIBRARIES: "/tmp/injected.dylib",
    LD_PRELOAD: "/tmp/injected.so",
    HTTPS_PROXY: "http://127.0.0.1:9",
  });
  const environmentRoot = resolve(temporaryRoot, "environment-root");
  mkdirSync(environmentRoot);
  const materializedEnvironment = materializeRiskExecutionEnvironment(environment, environmentRoot);
  assert.deepEqual(Object.keys(materializedEnvironment.environment).filter((name) => /^(?:NODE_|npm_|DYLD_|LD_|.*_PROXY)/u.test(name)), []);
  assert.deepEqual(materializedEnvironment.environment.PATH, "/usr/bin:/bin:/usr/sbin:/sbin");
  assert.equal(materializedEnvironment.environment.HOME, resolve(environmentRoot, "home"));
  assert.equal(materializedEnvironment.environment.CODEX_HOME, resolve(environmentRoot, "codex-home"));
  assert.equal(materializedEnvironment.environment.OPENAI_API_KEY, "fixture-api-key");
  assert.equal(environment.policy.inheritance, "none");
  assert.equal(environment.policy.authentication_mode, "single_api_key_environment");

  writeFileSync(actionPath, `${JSON.stringify(action, null, 2)}\n`);
  const actionEvidence = readRiskAction(actionPath, { schemaPath: actionSchemaPath });
  const request = createRiskApprovalRequest({ actionEvidence, invocation });
  assert.match(request.action_sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.match(request.invocation_sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.match(request.request_sha256, /^sha256:[a-f0-9]{64}$/u);
  const requestWithoutDigest = { ...request };
  delete requestWithoutDigest.request_sha256;
  assert.equal(request.request_sha256, canonicalRiskDigest(requestWithoutDigest));
  assert.deepEqual(createRiskApprovalRequest({ actionEvidence, invocation }), request, "request identity must be deterministic");
  assert.throws(
    () => createRiskApprovalRequest({ actionEvidence, invocation: { ...invocation, repository: { ...invocation.repository, repository_id: "github.com/example/transplant" } } }),
    /repository identity/u,
    "action and invocation must bind the same logical repository",
  );

  const approval = {
    schema_version: "1.0.0",
    kind: "codex_risk_approval",
    decision: "approved",
    request,
    request_sha256: request.request_sha256,
  };
  const writeApproval = (value) => {
    const bytes = `${JSON.stringify(value, null, 2)}\n`;
    writeFileSync(approvalPath, bytes);
    return sha256(bytes);
  };
  const verify = (value, overrides = {}) => verifyRiskApproval({
    approvalPath,
    approvalSha256: writeApproval(value),
    expectedRequest: request,
    target,
    schemaPath: approvalSchemaPath,
    ...overrides,
  });

  assert.equal(verify(approval).status, "approved");
  assert.equal(verify({ ...approval, decision: "rejected" }).status, "rejected");
  assert.equal(verify(true).status, "rejected", "plain boolean must not authorize");
  assert.equal(verify("approved").status, "rejected", "approval prose must not authorize");
  assert.equal(verify({ ...approval, extra: true }).status, "rejected", "superset approval must not authorize");
  const partialApproval = structuredClone(approval);
  delete partialApproval.request.invocation.sandbox;
  assert.equal(verify(partialApproval).status, "rejected", "partial approval must not authorize");
  assert.equal(verify({ ...approval, request: { ...request, mode: "review" } }).status, "rejected", "partial/resealed request must not authorize");
  assert.equal(verify(approval, { approvalSha256: "0".repeat(64) }).status, "rejected", "wrong raw file digest must not authorize");

  for (const [label, mutate] of [
    ["head", (value) => { value.request.invocation.repository.head_sha = "3".repeat(40); }],
    ["tree", (value) => { value.request.invocation.repository.tree_sha = "4".repeat(40); }],
    ["repository", (value) => { value.request.invocation.repository.repository_identity_sha256 = digest("5"); }],
    ["logical repository", (value) => { value.request.invocation.repository.repository_id = "github.com/example/transplant"; }],
    ["target scope", (value) => { value.request.invocation.target_scope = ["dist/other.json"]; }],
    ["prompt", (value) => { value.request.invocation.prompt.invocation_sha256 = digest("6"); }],
    ["profile", (value) => { value.request.invocation.profile.profile_fingerprint = digest("7"); }],
    ["selected profile", (value) => { value.request.invocation.profile.installed_profile = "different-profile"; }],
    ["Codex binary", (value) => { value.request.invocation.executor.requested_bin = "/other/codex"; }],
    ["Codex canonical path", (value) => { value.request.invocation.executor.native_binary.canonical_path = "/other/codex"; }],
    ["Codex binary digest", (value) => { value.request.invocation.executor.native_binary.raw_sha256 = digest("4"); }],
    ["Codex binary size", (value) => { value.request.invocation.executor.native_binary.size_bytes += 1; }],
    ["Codex spawn path", (value) => { value.request.invocation.executor.spawn_path = "/other/codex"; }],
    ["environment path", (value) => { value.request.invocation.environment.public_bindings.find((entry) => entry.name === "PATH").value = "/tmp/injected"; }],
    ["environment digest", (value) => { value.request.invocation.environment.environment_sha256 = digest("4"); }],
    ["output path", (value) => { value.request.invocation.executor.output_path = ".agents/runs/other.md"; }],
    ["runtime policy argv", (value) => { value.request.invocation.runtime_policy.argv = ["--ephemeral"]; }],
    ["runtime policy digest", (value) => { value.request.invocation.runtime_policy.argv_sha256 = digest("4"); }],
    ["runtime policy feature", (value) => { value.request.invocation.runtime_policy.disabled_features = value.request.invocation.runtime_policy.disabled_features.filter((feature) => feature !== "hooks"); }],
    ["mode", (value) => { value.request.invocation.mode = "verification"; }],
    ["sandbox", (value) => { value.request.invocation.sandbox = "read-only"; }],
    ["operation", (value) => { value.request.invocation.operation = "other_operation"; }],
    ["permitted effect", (value) => { value.request.invocation.permitted_effects = ["other_effect"]; }],
    ["prohibited effect", (value) => { value.request.invocation.prohibited_effects = ["other_effect"]; }],
    ["authority id", (value) => { value.request.approval_authority.authority_id = "other-owner"; }],
    ["authority revision", (value) => { value.request.approval_authority.authority_revision = "rev-8"; }],
    ["authority evidence", (value) => { value.request.approval_authority.evidence_sha256 = digest("8"); }],
    ["action digest", (value) => { value.request.action_sha256 = digest("9"); }],
    ["invocation digest", (value) => { value.request.invocation_sha256 = digest("0"); }],
  ]) {
    const changed = structuredClone(approval);
    mutate(changed);
    changed.request.request_sha256 = canonicalRiskDigest({ ...changed.request, request_sha256: undefined });
    changed.request_sha256 = changed.request.request_sha256;
    assert.equal(verify(changed).status, "rejected", `${label} mismatch must not authorize even when resealed`);
  }

  assert.throws(
    () => createRiskApprovalRequest({ actionEvidence, invocation: { ...invocation, runtime_policy: { ...invocation.runtime_policy, plugins: "enabled" } } }),
    /closed supported Codex policy/u,
    "request construction must reject a runtime policy outside the supported closed boundary",
  );

  const targetApprovalPath = resolve(target, "approval.json");
  writeFileSync(targetApprovalPath, `${JSON.stringify(approval)}\n`, { recursive: false });
  assert.equal(verifyRiskApproval({
    approvalPath: targetApprovalPath,
    approvalSha256: sha256(`${JSON.stringify(approval)}\n`),
    expectedRequest: request,
    target,
    schemaPath: approvalSchemaPath,
  }).status, "rejected", "target-contained approval must not authorize");

  const symlinkPath = resolve(temporaryRoot, "approval-link.json");
  symlinkSync(approvalPath, symlinkPath);
  assert.equal(verifyRiskApproval({
    approvalPath: symlinkPath,
    approvalSha256: writeApproval(approval),
    expectedRequest: request,
    target,
    schemaPath: approvalSchemaPath,
  }).status, "rejected", "symlink approval must not authorize");

  const actionSymlinkPath = resolve(temporaryRoot, "risk-action-link.json");
  symlinkSync(actionPath, actionSymlinkPath);
  assert.throws(() => readRiskAction(actionSymlinkPath, { schemaPath: actionSchemaPath }), /non-symlink|symbolic link/u, "symlink action descriptor must be rejected");

  console.log("Codex risk approval tests passed");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
