#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { riskCodexRuntimePolicy } from "./codex-risk-approval.mjs";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "codex-risk-runner-scope-")));
const target = resolve(fixtureRoot, "target");
const actionPath = resolve(fixtureRoot, "action.json");
const approvalPath = resolve(fixtureRoot, "approval.json");
const resultPath = resolve(fixtureRoot, "result.json");
const fakeCodex = resolve(fixtureRoot, "fake-codex.mjs");
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

  writeFileSync(resultPath, `${JSON.stringify({
    schema_version: "1.0.0",
    response_markdown: `Implementation Contract:\n- Artifact ID: IMPL-RISK-SCOPE\n- Upstream refs: WP-RISK-SCOPE, VER-RISK-SCOPE\n- Actual change boundary: exact approved path\n- Verification attempted: node scripts/test-codex-risk-runner-scope.mjs\n- Evidence references: isolated workspace delta\n- Handoff state: review pending\n\nEvidence:\n- command: node scripts/test-codex-risk-runner-scope.mjs\n  result: pass\n`,
    control: {
      evidence_status: { checked: ["isolated workspace delta"], missing: [] },
      stop_reason: { status: "completed", details: [], human_decision_required: [], stop_if: [] },
      next_action: "review the promoted scoped file",
    },
  }, null, 2)}\n`);
  writeFileSync(fakeCodex, `#!/usr/bin/env node\nimport { mkdirSync, readFileSync, writeFileSync } from "node:fs";\nimport { dirname, resolve } from "node:path";\nlet output;\nfor (let i = 2; i < process.argv.length; i += 1) if (process.argv[i] === "--output-last-message") output = process.argv[++i];\nconst approved = resolve(process.cwd(), "dist/release.json");\nmkdirSync(dirname(approved), { recursive: true });\nwriteFileSync(approved, "approved\\n");\nif (process.env.ASK_OUT_OF_SCOPE === "1") writeFileSync(resolve(process.cwd(), "README.md"), "unapproved sibling\\n");\nconst destination = resolve(process.cwd(), output);\nmkdirSync(dirname(destination), { recursive: true });\nwriteFileSync(destination, readFileSync(process.env.ASK_FAKE_RESULT, "utf8"));\n`);
  chmodSync(fakeCodex, 0o755);
  const fakeCodexImplementation = resolve(fixtureRoot, "fake-codex-implementation.mjs");
  renameSync(fakeCodex, fakeCodexImplementation);
  writeFileSync(configuredExternalTool, `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nwriteFileSync(process.env.ASK_MUTATING_TOOL_MARKER, "configured external tool invoked\\n");\n`);
  chmodSync(configuredExternalTool, 0o755);
  mkdirSync(syntheticCodexHome);
  writeFileSync(resolve(syntheticCodexHome, "config.toml"), `[mcp_servers.mutating_fixture]\ncommand = ${JSON.stringify(configuredExternalTool)}\n\n[features]\nhooks = true\nplugins = true\napps = true\nbrowser_use = true\ncomputer_use = true\n`);
  writeFileSync(fakeCodex, `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const expectedPrefix = ${JSON.stringify(["exec", ...expectedRiskPolicyArgs, "--sandbox", "workspace-write"])};
const actual = process.argv.slice(2);
const exactPolicy = expectedPrefix.every((value, index) => actual[index] === value);
if (!exactPolicy) {
  const config = readFileSync(new URL("config.toml", \`file://\${process.env.CODEX_HOME}/\`), "utf8");
  const command = config.match(/command = "([^"]+)"/u)?.[1];
  if (command) spawnSync(command, { env: process.env, stdio: "inherit" });
  process.exit(17);
}
const result = spawnSync(${JSON.stringify(fakeCodexImplementation)}, actual, { env: process.env, stdio: "inherit" });
process.exit(result.status ?? 1);
`);
  chmodSync(fakeCodex, 0o755);

  const syntheticEnvironment = {
    ASK_FAKE_RESULT: resultPath,
    ASK_MUTATING_TOOL_MARKER: externalToolMarker,
    CODEX_HOME: syntheticCodexHome,
  };
  const redControl = runNode([fakeCodex, "exec", "--sandbox", "workspace-write"], { cwd: target, env: syntheticEnvironment });
  assert.equal(redControl.status, 17, "synthetic Codex must expose the configured mutating tool when the risk policy is absent");
  assert.equal(readFileSync(externalToolMarker, "utf8"), "configured external tool invoked\n");
  rmSync(externalToolMarker);

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
  const baseArgs = [runner, "--target", target, "--prompt", "skill-implement.md", "--mode", "implementation", "--required-gate", "risk-gate", "--risk-action", actionPath, "--codex-bin", fakeCodex, "--output", ".agents/runs/risk-scope.md", "--json"];
  const first = runNode(baseArgs, { cwd: target, env: syntheticEnvironment });
  assert.equal(first.status, 2, first.stderr);
  const firstReport = JSON.parse(first.stdout);
  const request = firstReport.execution_envelope_record.envelope.risk_approval.request;
  assert.deepEqual(request.invocation.runtime_policy, riskCodexRuntimePolicy(), "approval must bind the exact closed Codex runtime policy and argv digest");
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
  const rejected = runNode([...baseArgs, "--risk-approval", approvalPath, "--risk-approval-sha256", sha256(approvalBytes)], { cwd: target, env: { ...syntheticEnvironment, ASK_OUT_OF_SCOPE: "1" } });
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
