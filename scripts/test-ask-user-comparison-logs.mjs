import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareUserComparison } from "./ask-user-comparison-prepare.mjs";
import { startUserComparison } from "./ask-user-comparison.mjs";
import { boundedVerificationLogs, VERIFICATION_STREAM_BYTE_LIMIT, VERIFICATION_VIEW_BYTE_LIMIT } from "./ask-user-comparison-logs.mjs";

const MiB = 1024 * 1024;
const git = (repo, args) => {
  const value = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, encoding: "utf8",
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  assert.equal(value.status, 0, value.stderr); return value.stdout.trim();
};
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-user-log-test-"))), repo = join(root, "source");
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  mkdirSync(repo); mkdirSync(join(repo, "src")); mkdirSync(join(repo, "test"));
  writeFileSync(join(repo, "src/value.mjs"), "export const value = 0;\n");
  writeFileSync(join(repo, "test/value.test.mjs"), "import test from 'node:test'; import assert from 'node:assert/strict'; import {value} from '../src/value.mjs'; test('value is one',()=>assert.equal(value,1));\n");
  git(repo, ["init", "-q"]); git(repo, ["add", "."]);
  git(repo, ["-c", "user.name=ASK test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "test seed"]);
  const taskFile = join(root, "task.md"), verificationFile = join(root, "verification.json");
  writeFileSync(taskFile, "Set the exported value to 1. Keep the API and existing tests.\n");
  writeFileSync(verificationFile, JSON.stringify({ command: ["node", "--test", "test/value.test.mjs"],
    requirements: [{ id: "value-one", description: "The exported value is one", command: ["node", "--test", "test/value.test.mjs"] }] }));
  return prepareUserComparison({ repo, commit: git(repo, ["rev-parse", "HEAD"]), taskFile, verificationFile,
    output: join(root, "comparison"), mutablePaths: ["src/"], taskClass: "trivial", evidenceKind: "synthetic" });
}
const counts = { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
function validSummary(padding = "") {
  return [JSON.stringify({ format: "ask_node_event_v1", data: padding }),
    JSON.stringify({ format: "ask_node_file_summary_v1", file: "test/value.test.mjs", success: true, counts }),
    JSON.stringify({ format: "ask_node_run_summary_v1", success: true, counts })].join("\n") + "\n";
}

test("complete 18 MiB verification streams preserve successful three-arm execution", async t => {
  const p = fixture(t), stdout = validSummary("x".repeat(9 * MiB)), stderr = "y".repeat(9 * MiB);
  assert.ok(Buffer.byteLength(stdout) < 10 * MiB && Buffer.byteLength(stderr) < 10 * MiB);
  assert.ok(Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 16 * MiB);
  let modelCalls = 0, verificationCalls = 0;
  const report = await startUserComparison(p.root, p.plan_digest, {
    runner: async invocation => {
      modelCalls++; invocation.onSpawn?.(12345);
      writeFileSync(invocation.argv[invocation.argv.indexOf("--output-last-message") + 1], "Changed value.\n");
      writeFileSync(join(invocation.cwd, "src/value.mjs"), "export const value = 1;\n");
      return { spawnObserved: true, exitCode: 0, durationMs: 1, stdout: "", stderr: "" };
    },
    verifier: async () => { verificationCalls++; return { spawnObserved: true, exitCode: 0, durationMs: 1, stdout, stderr }; },
  });
  assert.deepEqual(report.slots.map(slot => slot.state), ["completed", "completed", "completed"]);
  assert.equal(modelCalls, 3); assert.equal(verificationCalls, 6);
  assert.deepEqual(report.slots.map(slot => slot.outcome), ["pass", "pass", "pass"]);
  for (const slot of report.slots) {
    const folder = join(p.root, "control", "slots", slot.condition);
    const terminal = JSON.parse(readFileSync(join(folder, "result.json"), "utf8"));
    assert.deepEqual(terminal.artifact_errors, []);
    for (const check of slot.verification.checks) {
      assert.equal(check.exit_code, 0); assert.equal(check.status, "pass");
      assert.equal(check.test_summary.tests_observed, true);
      assert.equal(check.test_result, "pass");
      assert.equal(check.log_metadata.full_evidence_available, true);
      assert.equal(check.log_metadata.view.truncated, true);
      assert.equal(check.log_metadata.stdout.truncated, false);
      assert.equal(check.log_metadata.stderr.truncated, false);
      assert.equal(check.log_metadata.stdout.saved_bytes, Buffer.byteLength(stdout));
      assert.equal(check.log_metadata.stderr.saved_bytes, Buffer.byteLength(stderr));
      assert.ok(statSync(join(folder, check.log)).size <= 16 * MiB);
      assert.equal(readFileSync(join(folder, `verification-${check.id === "task-tests" ? 0 : 1}.stdout.jsonl`), "utf8"), stdout);
      assert.equal(readFileSync(join(folder, `verification-${check.id === "task-tests" ? 0 : 1}.stderr.log`), "utf8"), stderr);
    }
  }
  assert.equal(existsSync(join(p.root, "control/slots/plain/verification-0.stdout.jsonl")), true);
});

test("stream storage before, exactly at, and above its UTF-8 byte bound", () => {
  for (const size of [31, 32, 33]) {
    for (const stream of ["stdout", "stderr"]) {
      const value = "a".repeat(size), result = boundedVerificationLogs(stream === "stdout" ? value : "", stream === "stderr" ? value : "",
        { streamLimit: 32, viewLimit: 100 });
      assert.equal(result[stream], "a".repeat(Math.min(size, 32)));
      assert.equal(result.metadata[stream].captured_bytes, size);
      assert.equal(result.metadata[stream].redacted_bytes, size);
      assert.equal(result.metadata[stream].saved_bytes, Math.min(size, 32));
      assert.equal(result.metadata[stream].saved_truncated, size > 32);
      assert.equal(result.metadata.full_evidence_available, size <= 32);
    }
  }
});

test("combined view before, exactly at, and above its bound retains complete source evidence", () => {
  for (const size of [127, 128, 129]) {
    const stdout = "x".repeat(60), stderr = "y".repeat(size - 61);
    const result = boundedVerificationLogs(stdout, stderr, { streamLimit: 100, viewLimit: 128 });
    assert.equal(result.stdout, stdout); assert.equal(result.stderr, stderr);
    assert.equal(result.metadata.view.source_bytes, size);
    assert.equal(result.metadata.view.saved_bytes, Math.min(size, 128));
    assert.equal(result.metadata.view.truncated, size > 128);
    assert.equal(result.metadata.full_evidence_available, true);
    if (size > 128) assert.match(result.view, /review view truncated/u);
  }
});

test("both streams at the production cap remain complete with a bounded visibly truncated view", () => {
  const result = boundedVerificationLogs("x".repeat(VERIFICATION_STREAM_BYTE_LIMIT), "y".repeat(VERIFICATION_STREAM_BYTE_LIMIT));
  assert.equal(Buffer.byteLength(result.stdout), VERIFICATION_STREAM_BYTE_LIMIT);
  assert.equal(Buffer.byteLength(result.stderr), VERIFICATION_STREAM_BYTE_LIMIT);
  assert.equal(Buffer.byteLength(result.view), VERIFICATION_VIEW_BYTE_LIMIT);
  assert.equal(result.metadata.stdout.truncated, false); assert.equal(result.metadata.stderr.truncated, false);
  assert.equal(result.metadata.view.truncated, true); assert.equal(result.metadata.full_evidence_available, true);
  assert.match(result.view, /complete bounded stdout\/stderr artifacts are available/u);
});

test("production 10 MiB stream boundary before, equal and above records exact saved bounds", () => {
  for (const delta of [-1, 0, 1]) {
    const result = boundedVerificationLogs("x".repeat(VERIFICATION_STREAM_BYTE_LIMIT + delta), "y".repeat(VERIFICATION_STREAM_BYTE_LIMIT + delta));
    for (const name of ["stdout", "stderr"]) {
      assert.equal(result.metadata[name].captured_bytes, VERIFICATION_STREAM_BYTE_LIMIT + delta);
      assert.equal(result.metadata[name].saved_bytes, VERIFICATION_STREAM_BYTE_LIMIT + Math.min(delta, 0));
      assert.equal(result.metadata[name].saved_truncated, delta > 0);
    }
    assert.equal(result.metadata.full_evidence_available, delta <= 0);
    assert.ok(Buffer.byteLength(result.view) <= VERIFICATION_VIEW_BYTE_LIMIT);
  }
});

test("production 16 MiB combined boundary before, equal and above does not change stream completeness", () => {
  for (const delta of [-1, 0, 1]) {
    const result = boundedVerificationLogs("x".repeat(8 * MiB), "y".repeat(8 * MiB - 1 + delta));
    assert.equal(result.metadata.view.source_bytes, VERIFICATION_VIEW_BYTE_LIMIT + delta);
    assert.equal(result.metadata.view.saved_bytes, VERIFICATION_VIEW_BYTE_LIMIT + Math.min(delta, 0));
    assert.equal(result.metadata.view.truncated, delta > 0);
    assert.equal(result.metadata.full_evidence_available, true);
  }
});

test("UTF-8 truncation never splits a code point or exceeds byte limits", () => {
  for (const [value, limit, expected] of [["あいう", 8, "あい"], ["a😀b", 4, "a"], ["😀😀", 4, "😀"], ["éé", 3, "é"]]) {
    const result = boundedVerificationLogs(value, value, { streamLimit: limit, viewLimit: limit });
    assert.equal(result.stdout, expected); assert.equal(result.stderr, expected);
    for (const content of [result.stdout, result.stderr, result.view]) {
      assert.ok(Buffer.byteLength(content) <= limit); assert.ok(!content.includes("�"));
    }
    assert.equal(result.metadata.full_evidence_available, false);
  }
});

test("redaction expansion is bounded after sanitization and distinguishes captured/redacted/saved bytes", () => {
  const result = boundedVerificationLogs("secret", "secret", { sanitize: () => "[REDACTED]".repeat(3), streamLimit: 20, viewLimit: 30 });
  assert.equal(result.metadata.stdout.captured_bytes, 6);
  assert.equal(result.metadata.stdout.redacted_bytes, 30);
  assert.equal(result.metadata.stdout.saved_bytes, 20);
  assert.equal(result.metadata.stdout.saved_truncated, true);
  assert.equal(result.metadata.full_evidence_available, false);
  assert.ok(Buffer.byteLength(result.view) <= 30); assert.ok(!result.view.includes("secret"));
});

test("runner capture truncation and incomplete UTF-8 remain explicit independently of saved size", () => {
  const unknown = boundedVerificationLogs("small", "small", { captureTruncated: true });
  assert.equal(unknown.metadata.capture_truncated, true);
  assert.equal(unknown.metadata.stdout.capture_truncated, null); assert.equal(unknown.metadata.stderr.capture_truncated, null);
  assert.equal(unknown.metadata.stdout.capture_truncation_unknown, true); assert.equal(unknown.metadata.stderr.capture_truncation_unknown, true);
  assert.equal(unknown.metadata.stdout.saved_truncated, false); assert.equal(unknown.metadata.full_evidence_available, false);
  const partial = boundedVerificationLogs("small", "small", { captureTruncated: { stderr: true } });
  assert.equal(partial.metadata.stdout.truncated, false); assert.equal(partial.metadata.stderr.truncated, true);
  const broken = boundedVerificationLogs(Buffer.from([0xf0, 0x9f]), "");
  assert.equal(broken.metadata.stdout.captured_bytes, 2); assert.equal(broken.metadata.stdout.encoding_loss, true);
  assert.equal(broken.metadata.full_evidence_available, false);
});

test("empty streams, zero bounds and invalid bounds do not make unbounded artifacts", () => {
  const empty = boundedVerificationLogs("", "", { streamLimit: 0, viewLimit: 0 });
  assert.equal(empty.stdout, ""); assert.equal(empty.stderr, ""); assert.equal(empty.view, "");
  assert.equal(empty.metadata.full_evidence_available, true);
  for (const options of [{ streamLimit: -1 }, { streamLimit: VERIFICATION_STREAM_BYTE_LIMIT + 1 }, { viewLimit: VERIFICATION_VIEW_BYTE_LIMIT + 1 },
    { viewLimit: 1.5 }, { captureTruncated: "unknown" }, { captureTruncated: { other: true } }, { sanitize: () => null }]) {
    assert.throws(() => boundedVerificationLogs("abc", "def", options));
  }
});
