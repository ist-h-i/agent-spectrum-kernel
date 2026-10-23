import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Artificial controls calibrate the behavior checks, not a model or a Skill.
// They never enter an agent's candidate workspace during an evaluation.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suite = join(root, "scripts/test-sufficient-change-scope.mjs");
const seed = join(root, "docs/fixtures/sufficient-change-scope/seed");
const invalidParty = 'if (!Number.isSafeInteger(request.partySize) || request.partySize < 1) return { accepted: false, reason: "invalid_party_size" };';
const capacity = 'if (request.partySize > request.availableSeats) return { accepted: false, reason: "insufficient_capacity" };';
const accepted = 'return { accepted: true, seats: request.partySize };';
const partyLimit = 'if (request.maxPartySize !== undefined && request.partySize > request.maxPartySize) return { accepted: false, reason: "party_limit_exceeded" };';
const body = (stage) => [invalidParty, ...(stage === "follow-up" ? [partyLimit] : []), capacity, accepted].join("\n");
const policySource = (deletionCutoff) => `export const isInvoiceReminderDue = days => days >= 14;
export const isDraftDeletionDue = days => days >= ${deletionCutoff};\n`;

function sharedCandidate(stage) {
  return {
    "reservations.mjs": `function assess(request) { ${body(stage)} }
export function reserveOnline(request) { return assess(request); }
export function reserveImport(request) { return assess(request); }\n`,
    "policies.mjs": policySource(stage === "initial" ? 30 : 45),
  };
}

function withCandidate(files, run) {
  const directory = mkdtempSync(join(tmpdir(), "ask-scope-fixture-"));
  try {
    writeCandidate(directory, files);
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeCandidate(directory, files) {
  for (const [file, content] of Object.entries(files)) writeFileSync(join(directory, file), content);
}

function runCandidate(directory, stage) {
  const env = { ...process.env, ASK_SCOPE_CANDIDATE_DIR: directory, ASK_SCOPE_STAGE: stage };
  // Each control needs a fresh test process, even when this file uses --test.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", suite], {
    env,
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.error, undefined, `candidate process error: ${result.error}`);
  assert.equal(result.signal, null, `candidate process signal: ${result.signal}`);
  return result;
}

function expectPass(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function expectFailure(result, behavior) {
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(`not ok [0-9]+ - ${behavior}`));
}

test("the initial seed exposes the reported defect and reminder change", () => {
  withCandidate({
    "reservations.mjs": readFileSync(join(seed, "reservations.mjs"), "utf8"),
    "policies.mjs": readFileSync(join(seed, "policies.mjs"), "utf8"),
  }, directory => {
    const result = runCandidate(directory, "initial");
    expectFailure(result, "online rejects invalid party sizes without coercion");
    expectFailure(result, "import rejects invalid party sizes without coercion");
    expectFailure(result, "invoice reminders retain their own 14-day policy");
  });
});

test("different internal module arrangements satisfy the same public contract", () => {
  withCandidate(sharedCandidate("initial"), directory => expectPass(runCandidate(directory, "initial")));
  withCandidate({
    "party-policy.mjs": `export function reserve(request) { ${body("initial")} }\n`,
    "reservations.mjs": 'export { reserve as reserveOnline, reserve as reserveImport } from "./party-policy.mjs";\n',
    "policies.mjs": policySource(30),
  }, directory => expectPass(runCandidate(directory, "initial")));
});

test("a patch limited to the reported online symptom remains insufficient", () => {
  const files = sharedCandidate("initial");
  files["reservations.mjs"] = `export function reserveOnline(request) { ${body("initial")} }
export function reserveImport(request) {
  if (request.partySize < 1) return { accepted: false, reason: "invalid_party_size" };
  ${capacity}
  ${accepted}
}\n`;
  withCandidate(files, directory => expectFailure(runCandidate(directory, "initial"), "import rejects invalid party sizes without coercion"));
});

test("sharing the reminder policy with independently owned deletion is rejected", () => {
  const files = sharedCandidate("initial");
  files["policies.mjs"] = 'const due = days => days >= 14; export { due as isInvoiceReminderDue, due as isDraftDeletionDue };\n';
  withCandidate(files, directory => expectFailure(runCandidate(directory, "initial"), "draft deletion retains its independently owned policy"));
});

test("the same candidate can pass stage 1 and then the changed stage 2 contract", () => {
  withCandidate(sharedCandidate("initial"), directory => {
    expectPass(runCandidate(directory, "initial"));
    const beforeUpdate = runCandidate(directory, "follow-up");
    expectFailure(beforeUpdate, "online applies the new party limit with the required precedence");
    expectFailure(beforeUpdate, "draft deletion retains its independently owned policy");
    writeCandidate(directory, sharedCandidate("follow-up"));
    expectPass(runCandidate(directory, "follow-up"));
  });
});

test("the follow-up catches an entry point left on the previous policy", () => {
  const files = sharedCandidate("follow-up");
  files["reservations.mjs"] = `export function reserveOnline(request) { ${body("follow-up")} }
export function reserveImport(request) { ${body("initial")} }\n`;
  withCandidate(files, directory => expectFailure(runCandidate(directory, "follow-up"), "import applies the new party limit with the required precedence"));
});

test("the follow-up catches a changed rejection priority", () => {
  const files = sharedCandidate("follow-up");
  files["reservations.mjs"] = `function reserve(request) { ${invalidParty} ${capacity} ${partyLimit} ${accepted} }
export { reserve as reserveOnline, reserve as reserveImport };\n`;
  withCandidate(files, directory => expectFailure(runCandidate(directory, "follow-up"), "online applies the new party limit with the required precedence"));
});

test("the follow-up preserves the unrelated reminder policy", () => {
  const files = sharedCandidate("follow-up");
  files["policies.mjs"] = 'const due = days => days >= 45; export { due as isInvoiceReminderDue, due as isDraftDeletionDue };\n';
  withCandidate(files, directory => expectFailure(runCandidate(directory, "follow-up"), "invoice reminders retain their own 14-day policy"));
});
