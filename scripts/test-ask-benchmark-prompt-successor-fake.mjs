import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { effectiveCommand } from "./ask-benchmark-execution.mjs";
import { successorEffectiveCommand } from "./ask-benchmark-prompt-successor-delivery.mjs";
import { syntheticRuntime } from "./test-prompt-successor-fixtures.mjs";

// Offline contract check before the expensive native execution/scoring suites.
// Compile the same C fixture those suites use; never resolve a provider's Codex.
const root = fileURLToPath(new URL("..", import.meta.url));
let work;
let executable;
before(() => {
  assert.ok(["darwin", "linux"].includes(process.platform), "the native C fixture requires a POSIX host");
  work = mkdtempSync(resolve(tmpdir(), "ask-successor-fake-contract-"));
  executable = resolve(work, "codex");
  const compiler = process.platform === "darwin" ? "/usr/bin/clang" : "cc";
  const compiled = spawnSync(compiler, ["-std=c11", "-Wall", "-Wextra", "-Werror", "-O0",
    resolve(root, "scripts/test-fixtures/prompt-successor-fake-codex.c"), "-o", executable],
  { encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
  assert.equal(compiled.error, undefined, compiled.error?.message);
  assert.equal(compiled.status, 0, compiled.stderr);
});
after(() => { if (work) rmSync(work, { recursive: true, force: true }); });

for (const effort of ["medium", "high"]) test(`compiled successor fake ${effort === "medium" ? "accepts medium" : "rejects high before capture"}`, () => {
  const directory = resolve(work, effort);
  const home = resolve(directory, "empty-home");
  const captures = resolve(directory, "captures");
  mkdirSync(home, { recursive: true }); mkdirSync(captures);
  const runtime = syntheticRuntime();
  assert.equal(runtime.reasoning_effort, "medium");
  if (effort === "high") {
    assert.throws(() => successorEffectiveCommand(effectiveCommand(root, {
      adapter: runtime.adapter, availability: "available", model: "synthetic-native-fake-not-a-service",
      reasoning_effort: effort, permission_policy: runtime.approval_policy, sandbox_policy: runtime.sandbox,
    }), { privateEvaluatorRoot: resolve(work, "private-evaluator") }), { code: "SUCCESSOR_PROFILE_COMMAND_INVALID" });
    assert.deepEqual(readdirSync(captures), [], "high effort is rejected before the native fake is invoked");
    return;
  }
  const command = successorEffectiveCommand(effectiveCommand(root, {
    adapter: runtime.adapter, availability: "available", model: "synthetic-native-fake-not-a-service",
    reasoning_effort: effort, permission_policy: runtime.approval_policy, sandbox_policy: runtime.sandbox,
  }), { privateEvaluatorRoot: resolve(work, "private-evaluator") });
  const output = resolve(directory, "output.json");
  const argv = command.argv.map((arg) => arg.replaceAll("{output}", output)
    .replaceAll("{output_schema}", resolve(root, "benchmarks/schemas/agent-output.schema.json")));
  assert.deepEqual(argv.filter((arg) => arg.startsWith("model_reasoning_effort=")), [`model_reasoning_effort="${effort}"`]);
  const input = Buffer.from("Synthetic offline fixture contract; no model or evaluator.\n");
  const result = spawnSync(executable, argv, {
    cwd: directory, env: { HOME: home, ASK_SUCCESSOR_FAKE_CAPTURE: captures, ASK_SUCCESSOR_FAKE_MODE: "success" },
    input: effort === "medium" ? input : undefined, timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, effort === "medium" ? 0 : 64, result.stderr.toString());
  assert.equal(existsSync(output), effort === "medium");
  const stdinFiles = readdirSync(captures).filter((name) => name.endsWith(".stdin"));
  assert.equal(stdinFiles.length, effort === "medium" ? 1 : 0);
  if (effort === "medium") {
    const id = stdinFiles[0].slice(0, -".stdin".length);
    assert.deepEqual(readFileSync(resolve(captures, `${id}.stdin`)), input);
    assert.deepEqual(readFileSync(resolve(captures, `${id}.argv`)), Buffer.from(`${argv.join("\0")}\0`));
  } else assert.deepEqual(readdirSync(captures), [], "rejection must precede all capture writes");
});
