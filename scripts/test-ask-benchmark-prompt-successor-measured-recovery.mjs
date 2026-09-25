import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targetUrl = new URL("./ask-benchmark-prompt-successor-measured-execution.mjs", import.meta.url);
const testPath = fileURLToPath(import.meta.url);
const caseIds = ["case-1", "case-2", "case-3", "case-4"];
const roles = ["current_prompt", "prompt_v2", "current_prompt", "prompt_v2"];

function fixture() {
  const dir = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-measured-recovery-")));
  mkdirSync(resolve(dir, "run-current_prompt"));
  mkdirSync(resolve(dir, "run-prompt_v2"));
  writeFileSync(resolve(dir, "state.json"), JSON.stringify({ terminal: 0, native_calls: [] }));
  const preparation = {
    preparation_digest: "sha256:" + "a".repeat(64),
    cases: caseIds.map((case_id, index) => ({ case_id, prompt_role: roles[index] })),
  };
  const sources = Object.fromEntries(["current_prompt", "prompt_v2"].map((role) => [role, {
    scope: { source: { bindings: caseIds.flatMap((case_id, index) => roles[index] === role ? [{
      successor_case_id: case_id, source_case_id: `native-${case_id}`,
    }] : []) } },
    expectedScopeDigest: "synthetic",
    execution: { runDir: resolve(dir, `run-${role}`) },
    runtimeConfigPath: resolve(dir, "unused-runtime.json"),
    agentBin: resolve(dir, "unused-agent"),
  }]));
  writeFileSync(resolve(dir, "context.json"), JSON.stringify({
    root, dir, authority: { fixture: "synthetic-measured-recovery" }, preparation, sources,
  }));
  return { dir, preparation, journal: resolve(dir, "journal.json") };
}

async function loadController(context) {
  const vm = await import("node:vm");
  const { canonicalDigest } = await import("./content-addressed-store.mjs");
  const statePath = resolve(context.dir, "state.json");
  const state = () => JSON.parse(readFileSync(statePath, "utf8"));
  const control = () => {
    const progress = state();
    const cases = caseIds.map((case_id, index) => {
      const completed = index < progress.terminal;
      const digest = (kind) => canonicalDigest({ kind, case_id });
      return { case_id, status: completed ? "completed" : "pending",
        request_digest: completed ? digest("request") : null,
        result_digest: completed ? digest("result") : null,
        commit_digest: completed ? digest("commit") : null };
    });
    const body = { preparation_digest: context.preparation.preparation_digest,
      terminal_count: progress.terminal, pending_count: 4 - progress.terminal,
      next_case_id: caseIds[progress.terminal] ?? null,
      status: progress.terminal === 4 ? "collected" : "ready_for_authorized_claim",
      stop_reasons: [], total_tokens: 0, observed_token_lower_bound: 0, cases };
    return { ...body, control_digest: canonicalDigest(body) };
  };
  const synthetic = {
    "./ask-benchmark-prompt-successor-measured-authority.mjs": {
      assertSuccessorMeasuredAuthority: () => {},
      assertSuccessorMeasuredSourceAuthority: () => {},
      inspectSuccessorMeasuredAuthority: (authority) => authority,
      successorMeasuredJournalPath: () => resolve(context.dir, "journal.json"),
    },
    "./ask-benchmark-prompt-successor-collection.mjs": {
      inspectSuccessorCollectionControl: async () => {
        const value = control();
        return { control: value, inspection_digest: canonicalDigest({ control: value }) };
      },
    },
    "./ask-benchmark-prompt-successor-delivery.mjs": {
      openSuccessorPromptInput: async () => ({ synthetic: true }),
    },
    "./ask-benchmark-execution.mjs": {
      executePortfolio: ({ caseId }) => {
        const value = state();
        assert.equal(caseId, `native-${caseIds[value.terminal]}`);
        value.native_calls.push(caseId);
        value.terminal++;
        writeFileSync(statePath, JSON.stringify(value));
        return { synthetic: true };
      },
      inspectVerifiedPortfolioExecution: () => ({ cases: caseIds.map((case_id, index) => ({
        entry: { case_id: `native-${case_id}` },
        state: { status: index < state().terminal ? "completed" : "pending" },
        attempts: index < state().terminal ? [{ synthetic: true }] : [],
      })) }),
      recoverPortfolioCase: () => { throw new Error("native recovery is unexpected for an unstarted claim"); },
    },
  };
  const cache = new Map();
  const moduleFor = async (specifier) => {
    if (cache.has(specifier)) return cache.get(specifier);
    const exports = synthetic[specifier] ?? await import(specifier.startsWith("node:") ? specifier :
      new URL(specifier, targetUrl).href);
    const module = new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { identifier: specifier });
    cache.set(specifier, module);
    return module;
  };
  const module = new vm.SourceTextModule(readFileSync(targetUrl, "utf8"), {
    identifier: targetUrl.href,
    initializeImportMeta(meta, loaded) { meta.url = loaded.identifier; },
  });
  await module.link(moduleFor);
  await module.evaluate();
  return module.namespace;
}

async function worker() {
  const context = JSON.parse(readFileSync(resolve(process.env.ASK_R3_FIXTURE_DIR, "context.json"), "utf8"));
  const controller = await loadController(context);
  const options = { authority: context.authority, preparation: context.preparation,
    sources: context.sources, root: context.root };
  try {
    const result = process.argv[3] === "recover"
      ? await controller.recoverMeasuredSuccessorSession(options)
      : await controller.executeNextMeasuredSuccessorCase(options);
    process.stdout.write(JSON.stringify({ ok: true, case_id: result.case_id ?? result.recovered_case_id,
      terminal: result.collection.terminal_count, retry: result.retry_performed ?? result.automatic_retry_performed }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: error.code, path: error.path,
      message: error.message }) + "\n");
  }
}

if (process.argv[2] === "--worker") {
  await worker();
} else {
  const childArgs = ["--no-warnings", "--experimental-vm-modules", testPath, "--worker"];
  const envFor = (fixtureDir, fault = "") => ({ ...process.env, ASK_R3_FIXTURE_DIR: fixtureDir,
    ASK_BENCHMARK_FAULT: fault });
  const run = (fixtureDir, action, fault = "") => {
    const result = spawnSync(process.execPath, [...childArgs, action], {
      cwd: root, env: envFor(fixtureDir, fault), encoding: "utf8", timeout: 15000,
    });
    assert.equal(result.error, undefined, result.stderr);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim());
  };
  const start = (fixtureDir, action, fault) => {
    const child = spawn(process.execPath, [...childArgs, action], {
      cwd: root, env: envFor(fixtureDir, fault), stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr.setEncoding("utf8");
    child.stderrText = "";
    child.stderr.on("data", chunk => { child.stderrText += chunk; });
    return child;
  };
  const barrier = (child, marker) => new Promise((resolveBarrier, rejectBarrier) => {
    const cleanup = () => { clearTimeout(timer); child.stderr.off("data", check); child.off("exit", prematureExit); };
    const timer = setTimeout(() => { cleanup(); rejectBarrier(new Error(`missing ${marker}: ${child.stderrText}`)); }, 15000);
    const check = () => {
      if (!child.stderrText.includes(marker)) return;
      cleanup();
      resolveBarrier();
    };
    const prematureExit = (code, signal) => {
      cleanup(); rejectBarrier(new Error(`child exited before ${marker}: ${code}/${signal}: ${child.stderrText}`));
    };
    child.stderr.on("data", check);
    child.once("exit", prematureExit);
    check();
  });
  const exit = (child) => new Promise(resolveExit => child.once("exit", (code, signal) => resolveExit({ code, signal })));
  const snapshot = (fixtureDir) => JSON.parse(readFileSync(resolve(fixtureDir, "state.json"), "utf8"));

  test("R3: a killed stale provisional owner cannot rewrite the three-entry journal or retry native work", { timeout: 60000 }, async () => {
    const { dir, journal } = fixture();
    assert.deepEqual(run(dir, "execute"), { ok: true, case_id: "case-1", terminal: 1, retry: false });
    const stale = start(dir, "execute", "before_measured_lock_pause,after_measured_provisional_lock_pause");
    try {
      await barrier(stale, "MEASURED_BEFORE_LOCK\n");
      assert.deepEqual(run(dir, "execute"), { ok: true, case_id: "case-2", terminal: 2, retry: false });
      assert.deepEqual(run(dir, "execute"), { ok: true, case_id: "case-3", terminal: 3, retry: false });
      const journalBefore = readFileSync(journal);
      stale.kill("SIGCONT");
      await barrier(stale, "MEASURED_AFTER_PROVISIONAL_LOCK\n");
      const liveRecovery = run(dir, "recover");
      assert.equal(liveRecovery.code, "SUCCESSOR_MEASURED_EXECUTION_ACTIVE", JSON.stringify(liveRecovery));
      const died = exit(stale);
      stale.kill("SIGKILL");
      assert.deepEqual(await died, { code: null, signal: "SIGKILL" });
      const interruptedRecovery = start(dir, "recover", "before_measured_reservation_release_pause");
      try {
        await barrier(interruptedRecovery, "MEASURED_BEFORE_RESERVATION_RELEASE\n");
        assert.deepEqual(readFileSync(journal), journalBefore);
        const competingRecovery = run(dir, "recover");
        assert.equal(competingRecovery.code, "SUCCESSOR_MEASURED_RECOVERY_LOCKED", JSON.stringify(competingRecovery));
        const recoveryDied = exit(interruptedRecovery);
        interruptedRecovery.kill("SIGKILL");
        assert.deepEqual(await recoveryDied, { code: null, signal: "SIGKILL" });
      } finally {
        if (interruptedRecovery.exitCode === null && interruptedRecovery.signalCode === null) {
          interruptedRecovery.kill("SIGCONT"); interruptedRecovery.kill("SIGKILL");
        }
      }
      const recovered = run(dir, "recover");
      assert.deepEqual(recovered, { ok: true, case_id: null, terminal: 3, retry: false });
      assert.deepEqual(readFileSync(journal), journalBefore);
      assert.equal(existsSync(`${journal}.lock`), false);
      assert.deepEqual(snapshot(dir).native_calls, ["native-case-1", "native-case-2", "native-case-3"]);
      assert.deepEqual(run(dir, "execute"), { ok: true, case_id: "case-4", terminal: 4, retry: false });
      assert.deepEqual(snapshot(dir).native_calls, caseIds.map(id => `native-${id}`));
    } finally {
      if (stale.exitCode === null && stale.signalCode === null) {
        stale.kill("SIGCONT"); stale.kill("SIGKILL");
      }
    }
  });

  test("R2: first empty journal publication survives a second recovery without native retry", { timeout: 30000 }, async () => {
    const { dir, journal } = fixture();
    const first = start(dir, "execute", "after_measured_lock_pause");
    try {
      await barrier(first, "MEASURED_AFTER_LOCK\n");
      const died = exit(first);
      first.kill("SIGKILL");
      assert.deepEqual(await died, { code: null, signal: "SIGKILL" });
      const interrupted = spawnSync(process.execPath, [...childArgs, "recover"], {
        cwd: root, env: envFor(dir, "after_measured_recovery_journal_published"), encoding: "utf8", timeout: 15000,
      });
      assert.equal(interrupted.status, 86, interrupted.stderr || interrupted.stdout);
      const emptyBytes = readFileSync(journal);
      assert.equal(JSON.parse(emptyBytes).terminal_count, 0);
      assert.deepEqual(run(dir, "recover"), { ok: true, case_id: "case-1", terminal: 0, retry: false });
      assert.deepEqual(readFileSync(journal), emptyBytes);
      assert.equal(existsSync(`${journal}.lock`), false);
      assert.deepEqual(snapshot(dir).native_calls, []);
    } finally {
      if (first.exitCode === null && first.signalCode === null) {
        first.kill("SIGCONT"); first.kill("SIGKILL");
      }
    }
  });

  test("an initial provisional lock is recoverable without publishing a journal", { timeout: 30000 }, async () => {
    const { dir, journal } = fixture();
    const first = start(dir, "execute", "after_measured_provisional_lock_pause");
    try {
      await barrier(first, "MEASURED_AFTER_PROVISIONAL_LOCK\n");
      const reservation = JSON.parse(readFileSync(`${journal}.lock`, "utf8"));
      assert.equal(reservation.kind, "prompt_successor_measured_reservation");
      const died = exit(first);
      first.kill("SIGKILL");
      assert.deepEqual(await died, { code: null, signal: "SIGKILL" });
      assert.deepEqual(run(dir, "recover"), { ok: true, case_id: null, terminal: 0, retry: false });
      assert.equal(existsSync(journal), false);
      assert.equal(existsSync(`${journal}.lock`), false);
      assert.deepEqual(snapshot(dir).native_calls, []);
      assert.deepEqual(run(dir, "execute"), { ok: true, case_id: "case-1", terminal: 1, retry: false });
      assert.deepEqual(snapshot(dir).native_calls, ["native-case-1"]);
    } finally {
      if (first.exitCode === null && first.signalCode === null) {
        first.kill("SIGCONT"); first.kill("SIGKILL");
      }
    }
  });
}
