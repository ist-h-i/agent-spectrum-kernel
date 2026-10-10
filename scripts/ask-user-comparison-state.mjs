// Local execution history only: never launches or terminates model processes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { COMPARISON_RECORD_BYTE_LIMIT, comparisonHash } from "./ask-user-comparison-prepare.mjs";

const IDS = ["plain", "kernel_only", "full_ask"];
const LIMIT = COMPARISON_RECORD_BYTE_LIMIT;
const NAME = /^\d{8}$/u;
const PHASES = ["pending", "launch_intent", "model_running", "verifying", "terminal"];
const bytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const error = (code, reason) => Object.assign(new Error(reason), { comparisonCode: code });
const numberName = number => String(number).padStart(8, "0");

function directory(path, create = false) {
  if (create && !existsSync(path)) mkdirSync(path, { mode: 0o700 });
  const stat = lstatSync(path);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === path, "unsafe execution directory");
}
function writeFile(path, value) {
  assert.ok(value.length <= LIMIT, "execution record byte limit");
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, value); fsyncSync(fd); } finally { closeSync(fd); }
}
function writePair(path, value) {
  const raw = bytes(value);
  writeFile(join(path, "record.json"), raw);
  writeFile(join(path, "record.digest"), Buffer.from(comparisonHash(raw)));
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
  return comparisonHash(raw);
}
function readPair(path) {
  directory(path);
  assert.deepEqual(readdirSync(path).sort(), ["record.digest", "record.json"], "incomplete or unknown execution record files");
  const raw = readStableFile(join(path, "record.json"), "execution record", LIMIT).bytes;
  const digest = comparisonHash(raw);
  assert.equal(readStableFile(join(path, "record.digest"), "execution digest", 256).bytes.toString("utf8"), digest);
  return { value: parseJsonRejectDuplicateKeys(raw.toString("utf8")), digest };
}
function bind(value, plan, digest) {
  assert.equal(value.run_id, plan.run_id, "execution run changed");
  assert.equal(value.plan_digest, digest, "execution plan changed");
}

function bootIdentity() {
  try {
    if (process.platform === "linux") return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    if (process.platform === "darwin") {
      const value = spawnSync("/usr/sbin/sysctl", ["-n", "kern.boottime"], {
        encoding: "utf8", timeout: 2000, maxBuffer: 4096, env: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C" },
      });
      if (!value.error && value.status === 0 && value.stdout.trim()) return value.stdout.trim();
    }
  } catch { /* Unavailable ownership is not absent ownership. */ }
  return null;
}

/** Only signal 0 and bounded read-only local process metadata. No persisted PID
 * is ever passed to a terminating signal by this module or by resume. */
export function observeComparisonProcess(pid) {
  const identity = { host: hostname(), platform: process.platform, boot: bootIdentity(), pid, birth: null, status: "unknown" };
  if (!Number.isSafeInteger(pid) || pid < 1) return identity;
  try { process.kill(pid, 0); }
  catch (value) { return { ...identity, status: value.code === "ESRCH" ? "gone" : "unknown" }; }
  const value = spawnSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8", timeout: 2000, maxBuffer: 4096, env: { PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C" },
  });
  if (!value.error && value.status === 0 && value.stdout.trim() && identity.boot !== null) {
    return { ...identity, birth: value.stdout.trim(), status: "alive" };
  }
  try { process.kill(pid, 0); }
  catch (value) { if (value.code === "ESRCH") return { ...identity, status: "gone" }; }
  return identity;
}

export function probeComparisonOwner(owner, processGroup = false) {
  if (!owner || owner.host !== hostname() || owner.platform !== process.platform || !owner.boot || !owner.birth
    || !Number.isSafeInteger(owner.pid) || owner.pid < 1) return { status: "unknown", reason: "owner identity missing or belongs to another host" };
  const current = observeComparisonProcess(owner.pid);
  if (current.boot === null || current.boot !== owner.boot) return { status: "unknown", reason: "owner boot identity cannot be confirmed" };
  let status = current.status;
  if (status === "alive" && current.birth !== owner.birth) status = "gone"; // PID reused; never kill the replacement.
  if (processGroup && process.platform !== "win32") {
    try {
      process.kill(-owner.pid, 0);
      return { status: status === "alive" ? "alive" : "unknown", reason: "recorded process group is present; no cleanup is attempted by resume" };
    } catch (value) {
      if (value.code !== "ESRCH") return { status: "unknown", reason: "recorded process group ownership unavailable" };
    }
  }
  return { status, reason: status === "gone" ? "recorded owner is absent" : status === "alive" ? "recorded owner is still active" : "owner liveness unavailable" };
}

function validateSnapshot(value, previous, plan, digest, sequence) {
  bind(value, plan, digest);
  assert.equal(value.kind, "ask_comparison_execution_event_v1");
  assert.equal(value.sequence, sequence);
  assert.ok(Number.isSafeInteger(value.at_ms) && value.at_ms > 0);
  assert.ok(Number.isSafeInteger(value.started_at_ms) && value.started_at_ms > 0);
  assert.ok(Number.isSafeInteger(value.deadline_at_ms) && value.deadline_at_ms > value.started_at_ms);
  assert.ok(typeof value.lease_id === "string" && value.lease_id.length > 0 && typeof value.event === "string");
  assert.deepEqual(Object.keys(value.slots).sort(), [...IDS].sort());
  if (previous) {
    assert.equal(value.started_at_ms, previous.started_at_ms);
    assert.equal(value.deadline_at_ms, previous.deadline_at_ms);
    assert.ok(value.at_ms >= previous.at_ms, "execution clock moved backwards");
  }
  for (const id of IDS) {
    const slot = value.slots[id], prior = previous?.slots[id];
    assert.ok(PHASES.includes(slot.phase) && [0, 1].includes(slot.attempts));
    assert.ok(slot.phase !== "pending" || slot.attempts === 0);
    assert.ok(["pending", "terminal"].includes(slot.phase) || slot.attempts === 1);
    if (slot.phase === "terminal") assert.match(slot.terminal_digest, /^sha256:[a-f0-9]{64}$/u);
    if (prior) {
      assert.ok(slot.attempts >= prior.attempts, "attempt consumption cannot be reversed");
      if (prior.phase !== "pending") assert.notEqual(slot.phase, "pending", "an attempted condition cannot become pending");
      if (prior.phase === "terminal") assert.deepEqual(slot, prior, "terminal checkpoint cannot change");
    }
  }
}

/** A committed immutable event folder publishes record+digest atomically. A
 * pending folder survives failed persistence and is never silently repaired. */
export function readComparisonHistory(root, plan, digest) {
  const parent = join(root, "control/history");
  if (!existsSync(parent)) return { snapshot: null, digest: null, count: 0, pending: [] };
  directory(parent);
  const names = readdirSync(parent), pending = names.filter(name => name.startsWith("pending-"));
  assert.ok(names.every(name => NAME.test(name) || name.startsWith("pending-")), "unknown history entry");
  const ordered = names.filter(name => NAME.test(name)).sort();
  assert.ok(ordered.length <= 10000, "execution history bound");
  let previous = null, previousDigest = null;
  for (const [index, name] of ordered.entries()) {
    assert.equal(name, numberName(index + 1), "execution history gap");
    const entry = readPair(join(parent, name));
    assert.equal(entry.value.previous_digest, previousDigest, "execution history chain changed");
    validateSnapshot(entry.value, previous, plan, digest, index + 1);
    previous = entry.value; previousDigest = entry.digest;
  }
  return { snapshot: previous, digest: previousDigest, count: ordered.length, pending };
}

function readLeases(root, plan, digest) {
  const parent = join(root, "control/leases");
  if (!existsSync(parent)) return [];
  directory(parent);
  const names = readdirSync(parent).sort();
  assert.ok(names.length <= 10000 && names.every(name => NAME.test(name)), "unknown or excessive owner generations");
  return names.map((name, index) => {
    assert.equal(name, numberName(index + 1), "owner generation gap");
    const path = join(parent, name); directory(path);
    const pair = readPair(join(path, "owner")); bind(pair.value, plan, digest);
    assert.equal(pair.value.kind, "ask_comparison_owner_v1");
    assert.equal(pair.value.sequence, index + 1);
    assert.deepEqual(readdirSync(path).sort(), existsSync(join(path, "release")) ? ["owner", "release"] : ["owner"]);
    let released = false;
    if (existsSync(join(path, "release"))) {
      const release = readPair(join(path, "release")); bind(release.value, plan, digest);
      assert.equal(release.value.kind, "ask_comparison_owner_release_v1");
      assert.equal(release.value.owner_digest, pair.digest);
      assert.equal(release.value.lease_id, pair.value.lease_id);
      released = true;
    }
    return { ...pair.value, path, digest: pair.digest, released };
  });
}

export function inspectComparisonExecution(root, plan, digest) {
  try {
    const history = readComparisonHistory(root, plan, digest), leases = readLeases(root, plan, digest);
    const owner = leases.at(-1) ?? null;
    const probe = owner ? owner.released ? { status: "released", reason: "controller relinquished this generation" }
      : probeComparisonOwner(owner.identity) : { status: "none", reason: "no execution owner" };
    const reports=join(root,"control/invocations");
    if(existsSync(reports)) directory(reports);
    const pendingReport=existsSync(reports)&&readdirSync(reports).some(name=>name.startsWith("pending-"));
    const pending = history.pending.length > 0 || pendingReport;
    return { kind: "ask_comparison_execution_state_v1", history, owner, probe,
      state: pending && probe.status !== "alive" ? "state_corrupt" : pending ? "running"
        : probe.status === "alive" ? "running" : probe.status === "unknown" ? "ownership_unverified" : "available",
      reason: pendingReport ? "an invocation report is not durably published" : pending ? "an execution event is not durably published" : probe.reason };
  } catch (value) {
    return { kind: "ask_comparison_execution_state_v1", state: "state_corrupt", reason: `execution state corrupt: ${value.message}`, history: null, owner: null, probe: { status: "unknown" } };
  }
}

/** Elect one controller by exclusive creation of the next immutable generation.
 * No lock is unlinked or stolen. A torn generation blocks automatic recovery. */
export function acquireComparisonOwner(root, plan, digest, resume) {
  directory(join(root, "control"));
  const start = join(root, "control/start.json"), started = existsSync(start);
  if (!resume && started) throw error(9, "this run already consumed its start; use resume for never-requested conditions or prepare a new run");
  if (resume && !started) throw error(9, "resume requires an existing started run");
  const inspected = inspectComparisonExecution(root, plan, digest);
  if (inspected.state === "state_corrupt") throw error(10, inspected.reason);
  if (["running", "ownership_unverified"].includes(inspected.state)) throw error(9, inspected.reason);
  if (resume && !inspected.history?.snapshot) throw error(10, "legacy or incomplete start has no recovery checkpoint; do not repeat its requests");
  if (inspected.history?.pending.length) throw error(10, "uncommitted execution event; manual evidence review required");
  if (!resume && (inspected.owner || inspected.history?.snapshot)) throw error(10, "incomplete initial execution state; cannot silently start again");
  const identity = observeComparisonProcess(process.pid);
  if (identity.status !== "alive" || !identity.birth || !identity.boot) throw error(9, "current controller ownership unavailable");
  const parent = join(root, "control/leases"); directory(parent, true);
  const count = inspected.owner?.sequence ?? 0;
  const sequence = count + 1, path = join(parent, numberName(sequence));
  try { mkdirSync(path, { mode: 0o700 }); }
  catch (value) { if (value.code === "EEXIST") throw error(9, "another controller acquired this owner generation"); throw value; }
  mkdirSync(join(path, "owner"), { mode: 0o700 });
  const owner = { kind: "ask_comparison_owner_v1", run_id: plan.run_id, plan_digest: digest, sequence,
    lease_id: randomUUID(), identity, acquired_at: new Date().toISOString(), node_version: process.version };
  const ownerDigest = writePair(join(path, "owner"), owner);
  directory(join(root, "control/history"), true);
  return { root, plan, plan_digest: digest, owner: { ...owner, path, digest: ownerDigest }, history: inspected.history };
}

export function checkpointComparison(context, event, changes = {}) {
  const { root, plan, plan_digest: digest, owner } = context;
  const prior = context.history.snapshot;
  const now = Date.now();
  const value = { kind: "ask_comparison_execution_event_v1", run_id: plan.run_id, plan_digest: digest,
    sequence: context.history.count + 1, previous_digest: context.history.digest, lease_id: owner.lease_id,
    event, at_ms: now, started_at_ms: prior?.started_at_ms ?? now,
    deadline_at_ms: prior?.deadline_at_ms ?? now + (plan.config.overall_timeout_ms ?? 3600000),
    slots: prior ? structuredClone(prior.slots) : Object.fromEntries(IDS.map(id => [id, { phase: "pending", attempts: 0 }])),
    stop: changes.stop === undefined ? prior?.stop ?? null : changes.stop };
  if (changes.condition) {
    assert.ok(IDS.includes(changes.condition));
    value.slots[changes.condition] = { ...value.slots[changes.condition], ...changes.slot };
  }
  validateSnapshot(value, prior, plan, digest, value.sequence);
  const parent = join(root, "control/history"), pending = join(parent, `pending-${randomUUID()}`);
  mkdirSync(pending, { mode: 0o700 });
  const recordDigest = writePair(pending, value);
  renameSync(pending, join(parent, numberName(value.sequence)));
  const fd = openSync(parent, "r"); try { fsyncSync(fd); } finally { closeSync(fd); }
  context.history = { snapshot: value, digest: recordDigest, count: value.sequence, pending: [] };
  return value;
}

export function releaseComparisonOwner(context) {
  const { owner, plan, plan_digest: digest } = context;
  const path = join(owner.path, "release");
  mkdirSync(path, { mode: 0o700 });
  writePair(path, { kind: "ask_comparison_owner_release_v1", run_id: plan.run_id, plan_digest: digest,
    lease_id: owner.lease_id, owner_digest: owner.digest, released_at: new Date().toISOString() });
}
