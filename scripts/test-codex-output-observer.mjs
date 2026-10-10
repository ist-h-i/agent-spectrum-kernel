import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCodexSession } from "./codex-exec-runner.mjs";

const STREAM_LIMIT = 10 * 1024 * 1024;
const RUNNER_URL = new URL("./codex-exec-runner.mjs", import.meta.url).href;
function directory(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ask-output-observer-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function nodeRequest(root, script, options = {}) {
  return { executable: process.execPath, argv: ["-e", script], cwd: root, input: "", timeoutMs: 5000, ...options };
}

for (const [label, input] of [["string", ""], ["buffer", Buffer.alloc(0)]]) {
  test(`empty ${label} stdin does not write to an exited child after a slow spawn receipt`, async t => {
    const root = directory(t);
    const value = await executeCodexSession(nodeRequest(root, "process.stdout.write('finished');", {
      input, onSpawn: () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250),
    }));
    assert.equal(value.spawnObserved, true); assert.equal(value.exitCode, 0);
    assert.equal(value.error, null); assert.equal(value.cleanupError, null);
    assert.equal(value.stdout.toString(), "finished");
  });
}

test("output observer validation refuses before spawning any process", async t => {
  const root = directory(t); let starts = 0;
  await assert.rejects(executeCodexSession(nodeRequest(root, "", { onOutput: {} }), () => {
    starts++; throw new Error("must not spawn");
  }), /bounded Codex session request/u);
  assert.equal(starts, 0);
});

test("synchronous observers receive both accepted streams without changing retained bytes", async t => {
  const root = directory(t), observed = { stdout: [], stderr: [] };
  const value = await executeCodexSession(nodeRequest(root,
    "process.stdout.write('stdout bytes');process.stderr.write('stderr bytes');", {
      onOutput: ({ stream, chunk }) => {
        assert.ok(Buffer.isBuffer(chunk));
        assert.ok(chunk.length <= STREAM_LIMIT);
        observed[stream].push(Buffer.from(chunk));
        chunk.fill(88);
      },
    }));
  assert.equal(value.exitCode, 0); assert.equal(value.error, null);
  assert.equal(value.stdout.toString(), "stdout bytes");
  assert.equal(value.stderr.toString(), "stderr bytes");
  assert.equal(Buffer.concat(observed.stdout).toString(), "stdout bytes");
  assert.equal(Buffer.concat(observed.stderr).toString(), "stderr bytes");
});

test("each stream at its exact limit remains complete and is observed within the bound", async t => {
  const root = directory(t), lengths = { stdout: 0, stderr: 0 };
  const value = await executeCodexSession(nodeRequest(root,
    `process.stdout.write(Buffer.alloc(${STREAM_LIMIT},65));process.stderr.write(Buffer.alloc(${STREAM_LIMIT},66));`, {
      onOutput: ({ stream, chunk }) => { lengths[stream] += chunk.length; assert.ok(lengths[stream] <= STREAM_LIMIT); },
    }));
  assert.equal(value.exitCode, 0); assert.equal(value.error, null); assert.equal(value.outputLimited, false);
  assert.equal(value.stdout.length, STREAM_LIMIT); assert.equal(value.stderr.length, STREAM_LIMIT);
  assert.deepEqual(lengths, { stdout: STREAM_LIMIT, stderr: STREAM_LIMIT });
});

test("output observers never receive bytes rejected by the stream limit", async t => {
  const root = directory(t); let accepted = 0;
  const value = await executeCodexSession(nodeRequest(root,
    `process.stdout.write(Buffer.alloc(${STREAM_LIMIT + 1},65));setInterval(()=>{},1000);`, {
      onOutput: ({ stream, chunk }) => { assert.equal(stream, "stdout"); accepted += chunk.length; assert.ok(accepted <= STREAM_LIMIT); },
    }));
  assert.equal(accepted, STREAM_LIMIT); assert.equal(value.stdout.length, STREAM_LIMIT);
  assert.equal(value.outputLimited, true); assert.equal(value.error.code, "ENOBUFS");
  assert.equal(value.cleanupError, null);
});

test("an observer exception terminates its owned child while another session completes", async t => {
  const root = directory(t); let calls = 0;
  const other = executeCodexSession(nodeRequest(root,
    "setTimeout(()=>process.stdout.write('unrelated child completed'),100);"));
  const failing = executeCodexSession(nodeRequest(root,
    "process.stdout.write('observe once');setInterval(()=>process.stdout.write('more'),10);", {
      onOutput: () => { calls++; throw new Error("observer storage unavailable"); },
    }));
  const [failure, unrelated] = await Promise.all([failing, other]);
  assert.equal(calls, 1); assert.match(failure.error.message, /observer storage unavailable/u);
  assert.equal(failure.spawnObserved, true); assert.equal(failure.cleanupError, null); assert.equal(failure.timedOut, false);
  assert.equal(unrelated.exitCode, 0); assert.equal(unrelated.error, null); assert.equal(unrelated.cleanupError, null);
  assert.equal(unrelated.stdout.toString(), "unrelated child completed");
});

for (const [name, observer] of [
  ["resolved async function", "async () => {}"],
  ["rejected async function", "async () => { throw new Error('async observer rejected'); }"],
  ["rejecting thenable", "() => ({ then(_resolve, reject) { reject(new Error('thenable rejected')); } })"],
]) test(`${name} is refused without an unhandled rejection`, t => {
  const root = directory(t);
  // This subprocess is Node alone. Strict rejection handling makes rejection
  // leakage observable as a nonzero exit instead of relying on test listeners.
  const script = `import { executeCodexSession } from ${JSON.stringify(RUNNER_URL)};
    let calls = 0;
    const observe = ${observer};
    const value = await executeCodexSession({ executable: process.execPath,
      argv: ['-e', "process.stdout.write('observe');setInterval(()=>{},1000)"],
      cwd: ${JSON.stringify(root)}, input: '', timeoutMs: 5000,
      onOutput: event => { calls++; return observe(event); } });
    await new Promise(resolve => setImmediate(resolve));
    console.log(JSON.stringify({ calls, error: value.error, cleanupError: value.cleanupError,
      timedOut: value.timedOut, spawnObserved: value.spawnObserved }));`;
  const value = spawnSync(process.execPath, ["--unhandled-rejections=strict", "--input-type=module", "--eval", script],
    { cwd: root, shell: false, encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 });
  assert.equal(value.status, 0, value.stderr); assert.equal(value.error, undefined);
  const receipt = JSON.parse(value.stdout);
  assert.equal(receipt.calls, 1); assert.equal(receipt.spawnObserved, true);
  assert.match(receipt.error.message, /output observer must be synchronous/u);
  assert.equal(receipt.cleanupError, null); assert.equal(receipt.timedOut, false);
});
