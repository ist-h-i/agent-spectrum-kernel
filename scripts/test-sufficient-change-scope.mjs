import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// This executes the operator-selected artificial candidate. It is not a sandbox
// or a validator for arbitrary repositories. Keep this file outside the candidate.
const candidateDirectory = process.env.ASK_SCOPE_CANDIDATE_DIR;
const stage = process.env.ASK_SCOPE_STAGE;
assert.ok(candidateDirectory, "Set ASK_SCOPE_CANDIDATE_DIR to the artificial candidate directory.");
assert.ok(["initial", "follow-up"].includes(stage), "Set ASK_SCOPE_STAGE to initial or follow-up.");

const reservations = await import(pathToFileURL(resolve(candidateDirectory, "reservations.mjs")));
const policies = await import(pathToFileURL(resolve(candidateDirectory, "policies.mjs")));

function checkReservation(reserve, input, expected) {
  const request = Object.freeze({ ...input });
  assert.deepEqual(reserve(request), expected, `reservation for ${String(input.partySize)} seats`);
  assert.deepEqual(request, input, "the caller retains its input unchanged");
}

for (const [entryPoint, exportName] of [["online", "reserveOnline"], ["import", "reserveImport"]]) {
  test(`${entryPoint} rejects invalid party sizes without coercion`, () => {
    assert.equal(typeof reservations[exportName], "function");
    for (const partySize of [-1, 0, -0, 1.5, "2", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, undefined, true, {}, [], 2n]) {
      checkReservation(reservations[exportName], { partySize, availableSeats: 10 }, {
        accepted: false, reason: "invalid_party_size",
      });
    }
  });

  test(`${entryPoint} preserves capacity behavior and input ownership`, () => {
    for (const [partySize, availableSeats] of [[1, 1], [2, 10], [10, 10], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]]) {
      checkReservation(reservations[exportName], { partySize, availableSeats, note: "unrelated" }, {
        accepted: true, seats: partySize,
      });
    }
    for (const [partySize, availableSeats] of [[1, 0], [3, 2]]) {
      checkReservation(reservations[exportName], { partySize, availableSeats }, {
        accepted: false, reason: "insufficient_capacity",
      });
    }
  });

  if (stage === "follow-up") {
    test(`${entryPoint} applies the new party limit with the required precedence`, () => {
      const cases = [
        [{ partySize: 2, availableSeats: 10, maxPartySize: 2 }, { accepted: true, seats: 2 }],
        [{ partySize: 3, availableSeats: 10, maxPartySize: 2 }, { accepted: false, reason: "party_limit_exceeded" }],
        [{ partySize: 3, availableSeats: 2, maxPartySize: 2 }, { accepted: false, reason: "party_limit_exceeded" }],
        [{ partySize: 0, availableSeats: 0, maxPartySize: 2 }, { accepted: false, reason: "invalid_party_size" }],
        [{ partySize: "3", availableSeats: 2, maxPartySize: 2 }, { accepted: false, reason: "invalid_party_size" }],
        [{ partySize: 4, availableSeats: 3, maxPartySize: 5 }, { accepted: false, reason: "insufficient_capacity" }],
        [{ partySize: 4, availableSeats: 4, maxPartySize: 5 }, { accepted: true, seats: 4 }],
      ];
      for (const [request, expected] of cases) checkReservation(reservations[exportName], request, expected);
    });
  }
}

test("invoice reminders retain their own 14-day policy", () => {
  assert.equal(typeof policies.isInvoiceReminderDue, "function");
  for (const days of [0, 13, 14, 29, 30, 44, 45, 100]) {
    assert.equal(policies.isInvoiceReminderDue(days), days >= 14, `invoice day ${days}`);
  }
});

test("draft deletion retains its independently owned policy", () => {
  assert.equal(typeof policies.isDraftDeletionDue, "function");
  const cutoff = stage === "initial" ? 30 : 45;
  for (const days of [0, 13, 14, 29, 30, 44, 45, 100]) {
    assert.equal(policies.isDraftDeletionDue(days), days >= cutoff, `draft day ${days}`);
  }
});
