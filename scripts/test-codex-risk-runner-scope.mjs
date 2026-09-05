#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRiskExecutionEnvironment, riskCodexRuntimePolicy } from "./codex-risk-approval.mjs";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "codex-risk-runner-scope-")));
const target = resolve(fixtureRoot, "target");
const actionPath = resolve(fixtureRoot, "action.json");
const approvalPath = resolve(fixtureRoot, "approval.json");
const resultPath = resolve(fixtureRoot, "result.json");
const targetTriple = process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
const platformPackage = process.arch === "arm64" ? "codex-darwin-arm64" : "codex-darwin-x64";
const makePackagePaths = (name) => {
  const packageRoot = resolve(fixtureRoot, name);
  const platformRoot = resolve(packageRoot, "node_modules/@openai", platformPackage);
  return {
    packageRoot,
    launcher: resolve(packageRoot, "bin/codex.js"),
    platformRoot,
    native: resolve(platformRoot, `vendor/${targetTriple}/bin/codex`),
  };
};
const nativeCodexPackage = makePackagePaths("native-codex-package");
const nativeOutOfScopeCodexPackage = makePackagePaths("native-codex-out-of-scope-package");
const syntheticCodexHome = resolve(fixtureRoot, "codex-home");
const externalToolMarker = resolve(fixtureRoot, "configured-external-tool-ran.txt");
const configuredExternalTool = resolve(fixtureRoot, "configured-external-tool.mjs");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expectedDisabledFeatures = [
  "apps", "auth_elicitation", "browser_use", "browser_use_external", "browser_use_full_cdp_access", "code_mode_host", "computer_use", "enable_mcp_apps", "executor_capability_discovery", "guardian_approval", "hooks", "image_generation", "in_app_browser", "in_app_updates", "mcp_2026_07_28", "memories", "multi_agent", "multi_agent_v2", "plugin_sharing", "plugins", "recommended_plugins", "remote_plugin", "skill_mcp_dependency_install", "skill_search", "shell_snapshot", "standalone_web_search", "tool_call_mcp_elicitation", "tool_suggest", "view_image", "workspace_dependencies",
];
const expectedRiskPolicyArgs = [
  "--ephemeral", "--ignore-user-config", "--ignore-rules", "--strict-config",
  ...expectedDisabledFeatures.flatMap((feature) => ["--disable", feature]),
  "-c", "analytics.enabled=false",
  "-c", "feedback.enabled=false",
  "-c", "check_for_update_on_startup=false",
  "-c", "include_apps_instructions=false",
  "-c", "include_collaboration_mode_instructions=false",
  "-c", "mcp_servers={}",
  "-c", "shell_environment_policy.inherit=none",
  "-c", "sandbox_workspace_write.network_access=false",
];

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? source,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: 20 * 1024 * 1024,
  });
}

function pass(label, result) {
  assert.equal(result.status, 0, `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: target, encoding: "utf8" });
  pass(`git ${args.join(" ")}`, result);
}

try {
  assert.deepEqual(riskCodexRuntimePolicy().argv, expectedRiskPolicyArgs, "production risk argv must match the independently declared closed CLI policy");
  pass("install core", runNode([resolve(source, "scripts/install-kernel.mjs"), "--target", target]));
  pass("install Codex adapter", runNode([resolve(source, "scripts/install-codex-adapter.mjs"), "--target", target, "--profile", "full"]));
  git(["init", "-b", "main"]);
  git(["remote", "add", "origin", "https://github.com/example/risk-runner-scope.git"]);
  git(["add", "."]);
  git(["-c", "user.name=ASK Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);

  const resultJson = `${JSON.stringify({
    schema_version: "1.0.0",
    response_markdown: `Implementation Contract:\n- Artifact ID: IMPL-RISK-SCOPE\n- Upstream refs: WP-RISK-SCOPE, VER-RISK-SCOPE\n- Actual change boundary: exact approved path\n- Verification attempted: node scripts/test-codex-risk-runner-scope.mjs\n- Evidence references: isolated workspace delta\n- Handoff state: review pending\n\nEvidence:\n- command: node scripts/test-codex-risk-runner-scope.mjs\n  result: pass\n`,
    control: {
      evidence_status: { checked: ["isolated workspace delta"], missing: [] },
      stop_reason: { status: "completed", details: [], human_decision_required: [], stop_if: [] },
      next_action: "review the promoted scoped file",
    },
  }, null, 2)}\n`;
  writeFileSync(resultPath, resultJson);
  writeFileSync(configuredExternalTool, `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nwriteFileSync(process.env.ASK_MUTATING_TOOL_MARKER, "configured external tool invoked\\n");\n`);
  chmodSync(configuredExternalTool, 0o755);
  mkdirSync(syntheticCodexHome);
  writeFileSync(resolve(syntheticCodexHome, "config.toml"), `[mcp_servers.mutating_fixture]\ncommand = ${JSON.stringify(configuredExternalTool)}\n\n[features]\nhooks = true\nplugins = true\napps = true\nbrowser_use = true\ncomputer_use = true\n`);
  const compileNativeFixture = (packagePaths, outOfScope) => {
    mkdirSync(dirname(packagePaths.launcher), { recursive: true });
    mkdirSync(dirname(packagePaths.native), { recursive: true });
    writeFileSync(packagePaths.launcher, "#!/usr/bin/env node\nthrow new Error('risk test launcher must never execute');\n");
    chmodSync(packagePaths.launcher, 0o755);
    writeFileSync(resolve(packagePaths.packageRoot, "package.json"), `${JSON.stringify({ name: "@openai/codex", version: "1.2.3", bin: { codex: "bin/codex.js" } }, null, 2)}\n`);
    writeFileSync(resolve(packagePaths.platformRoot, "package.json"), `${JSON.stringify({ name: "@openai/codex", version: `1.2.3-${process.platform}-${process.arch}`, os: [process.platform], cpu: [process.arch] }, null, 2)}\n`);
    const output = packagePaths.native;
    const sourcePath = `${output}.c`;
    writeFileSync(sourcePath, `#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static void mark_external(void) {
  FILE *marker = fopen(${JSON.stringify(externalToolMarker)}, "w");
  if (marker) { fputs("configured external tool invoked\\n", marker); fclose(marker); }
}

int main(int argc, char **argv) {
  const char *output_path = NULL;
  const char *codex_home = getenv("CODEX_HOME");
  if (getenv("NODE_OPTIONS") || getenv("NODE_PATH") || getenv("npm_config_user_agent") || getenv("DYLD_INSERT_LIBRARIES") || getenv("HTTPS_PROXY") || getenv("HTTP_PROXY")) mark_external();
  if (!getenv("PATH") || strcmp(getenv("PATH"), "/usr/bin:/bin:/usr/sbin:/sbin") != 0) mark_external();
  if (codex_home) {
    char config[4096];
    snprintf(config, sizeof(config), "%s/config.toml", codex_home);
    FILE *loaded = fopen(config, "r");
    if (loaded) { fclose(loaded); mark_external(); }
  }
  for (int i = 1; i + 1 < argc; i++) if (strcmp(argv[i], "--output-last-message") == 0) output_path = argv[++i];
  if (!output_path) return 21;
  mkdir("dist", 0700);
  FILE *approved = fopen("dist/release.json", "w");
  if (!approved) return 22;
  fputs("approved\\n", approved); fclose(approved);
  ${outOfScope ? 'FILE *sibling = fopen("README.md", "w"); if (!sibling) return 23; fputs("unapproved sibling\\n", sibling); fclose(sibling);' : ""}
  FILE *result = fopen(output_path, "w");
  if (!result) return 24;
  fputs(${JSON.stringify(resultJson)}, result); fclose(result);
  return 0;
}
`);
    pass("compile native Codex fixture", spawnSync("/usr/bin/xcrun", ["clang", sourcePath, "-o", output], { encoding: "utf8" }));
    chmodSync(output, 0o755);
  };
  compileNativeFixture(nativeCodexPackage, false);
  compileNativeFixture(nativeOutOfScopeCodexPackage, true);

  const syntheticEnvironment = {
    CODEX_HOME: syntheticCodexHome,
    NODE_OPTIONS: "--no-warnings",
    NODE_PATH: resolve(fixtureRoot, "injected-node-path"),
    npm_config_user_agent: "injected-package-manager",
    HTTPS_PROXY: "http://127.0.0.1:9",
    HTTP_PROXY: "http://127.0.0.1:9",
  };
  const strippedEnvironment = resolveRiskExecutionEnvironment({
    ...syntheticEnvironment,
    HOME: process.env.HOME,
    PATH: `${fixtureRoot}:${process.env.PATH}`,
    DYLD_INSERT_LIBRARIES: resolve(fixtureRoot, "missing.dylib"),
    LD_PRELOAD: resolve(fixtureRoot, "missing.so"),
    ALL_PROXY: "http://127.0.0.1:9",
  });
  for (const name of ["NODE_OPTIONS", "NODE_PATH", "npm_config_user_agent", "DYLD_INSERT_LIBRARIES", "LD_PRELOAD", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]) {
    assert.equal(Object.hasOwn(strippedEnvironment.environment, name), false, `${name} must be stripped from the risk child environment`);
  }

  const action = {
    schema_version: "1.0.0",
    action_id: "risk-runner-scope",
    repository_id: "github.com/example/risk-runner-scope",
    risk_gate: "risk-gate",
    operation: "write_release_candidate",
    target_scope: ["dist/release.json"],
    permitted_effects: ["create"],
    prohibited_effects: ["external_side_effects", "git_metadata_changes", "write_outside_target_scope"],
    approval_authority: { authority_id: "fixture-owner", authority_revision: "rev-1", evidence_sha256: `sha256:${"a".repeat(64)}` },
  };
  writeFileSync(actionPath, `${JSON.stringify(action, null, 2)}\n`);
  const runner = resolve(target, "scripts/codex-exec-runner.mjs");
  const injectedBareCodex = resolve(fixtureRoot, "codex");
  copyFileSync("/usr/bin/true", injectedBareCodex);
  chmodSync(injectedBareCodex, 0o755);
  const injectedPath = runNode([runner, "--target", target, "--prompt", "skill-implement.md", "--mode", "implementation", "--required-gate", "risk-gate", "--risk-action", actionPath, "--codex-bin", "codex", "--output", ".agents/runs/risk-scope.md", "--json"], {
    cwd: target,
    env: { ...syntheticEnvironment, PATH: `${fixtureRoot}:${process.env.PATH}` },
  });
  assert.equal(injectedPath.status, 1, "a PATH-injected bare native executor must be rejected rather than approved");
  assert.match(injectedPath.stderr, /must resolve through the installed @openai\/codex launcher/u);

  const baseArgs = [runner, "--target", target, "--prompt", "skill-implement.md", "--mode", "implementation", "--required-gate", "risk-gate", "--risk-action", actionPath, "--codex-bin", nativeCodexPackage.launcher, "--output", ".agents/runs/risk-scope.md", "--json"];
  const first = runNode(baseArgs, { cwd: target, env: syntheticEnvironment });
  assert.equal(first.status, 2, first.stderr);
  const firstReport = JSON.parse(first.stdout);
  const request = firstReport.execution_envelope_record.envelope.risk_approval.request;
  assert.deepEqual(request.invocation.runtime_policy, riskCodexRuntimePolicy(), "approval must bind the exact closed Codex runtime policy and argv digest");
  assert.equal(request.invocation.executor.resolution, "installed_openai_codex_platform_package");
  assert.equal(request.invocation.executor.spawn_path, request.invocation.executor.native_binary.canonical_path, "approved risk execution must directly spawn the bound native binary");
  assert.equal(request.invocation.environment.inheritance, "none");
  assert.deepEqual(request.invocation.environment.public_bindings.find((binding) => binding.name === "PATH"), { name: "PATH", value: "/usr/bin:/bin:/usr/sbin:/sbin" });
  assert.deepEqual(request.invocation.environment.secret_bindings, []);
  assert.equal(firstReport.execution_envelope_record.envelope.risk_approval.enforcement_status, "not_started");
  assert.equal(existsSync(resolve(target, "dist/release.json")), false, "unapproved action must not execute");
  assert.equal(existsSync(externalToolMarker), false, "unapproved action must not reach configured external tools");

  const approvalBytes = `${JSON.stringify({ schema_version: "1.0.0", kind: "codex_risk_approval", decision: "approved", request, request_sha256: request.request_sha256 }, null, 2)}\n`;
  writeFileSync(approvalPath, approvalBytes);
  const approved = runNode([...baseArgs, "--risk-approval", approvalPath, "--risk-approval-sha256", sha256(approvalBytes)], { cwd: target, env: syntheticEnvironment });
  pass("approved isolated runner", approved);
  const report = JSON.parse(approved.stdout);
  const state = report.execution_envelope_record.envelope.risk_approval;
  assert.equal(state.status, "approved");
  assert.equal(state.execution_status, "executed");
  assert.equal(state.enforcement_status, "accepted");
  assert.equal(state.promotion_status, "promoted");
  assert.deepEqual(state.observed_effects, ["create"]);
  assert.deepEqual(state.promoted_paths, ["dist/release.json"]);
  assert.equal(readFileSync(resolve(target, "dist/release.json"), "utf8"), "approved\n");
  assert.equal(existsSync(externalToolMarker), false, "approved risk execution must not load the configured mutating MCP, hook, plugin, or app surface");
  assert.equal(existsSync(resolve(target, ".git", "HEAD")), true, "trusted promotion must preserve original Git metadata");

  git(["reset", "--hard", "HEAD"]);
  git(["clean", "-fd"]);
  assert.equal(existsSync(resolve(target, "README.md")), false);
  const outOfScopeArgs = baseArgs.map((value) => value === nativeCodexPackage.launcher ? nativeOutOfScopeCodexPackage.launcher : value);
  const outOfScopeRequestRun = runNode(outOfScopeArgs, { cwd: target, env: syntheticEnvironment });
  assert.equal(outOfScopeRequestRun.status, 2, outOfScopeRequestRun.stderr);
  const outOfScopeRequest = JSON.parse(outOfScopeRequestRun.stdout).execution_envelope_record.envelope.risk_approval.request;
  const outOfScopeApprovalBytes = `${JSON.stringify({ schema_version: "1.0.0", kind: "codex_risk_approval", decision: "approved", request: outOfScopeRequest, request_sha256: outOfScopeRequest.request_sha256 }, null, 2)}\n`;
  writeFileSync(approvalPath, outOfScopeApprovalBytes);
  const rejected = runNode([...outOfScopeArgs, "--risk-approval", approvalPath, "--risk-approval-sha256", sha256(outOfScopeApprovalBytes)], { cwd: target, env: syntheticEnvironment });
  assert.notEqual(rejected.status, 0, "allowed plus out-of-scope mutation must be rejected");
  const rejectedReport = JSON.parse(rejected.stdout);
  assert.equal(rejectedReport.execution_envelope_record.envelope.risk_approval.execution_status, "executed");
  assert.equal(rejectedReport.execution_envelope_record.envelope.risk_approval.enforcement_status, "rejected");
  assert.equal(rejectedReport.execution_envelope_record.envelope.risk_approval.promotion_status, "rejected");
  assert.deepEqual(rejectedReport.execution_envelope_record.envelope.risk_approval.promoted_paths, []);
  assert.equal(existsSync(resolve(target, "dist/release.json")), false, "mixed allowed and unapproved changes must promote nothing");
  assert.equal(existsSync(resolve(target, "README.md")), false, "out-of-scope mutation must remain isolated");

  console.log("Codex risk runner scoped promotion tests passed");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
