import test from "node:test";
import { reserve } from "./reservation.mjs";
import { cases } from "./reservation.cases.mjs";
import { observeReservation } from "./scenario-observer.mjs";

// @spec {"artifact_id":"SPEC-RESERVATION","artifact_type":"spec","revision":1,"status":"accepted","context_ref":"../domain-context.md"}
// Observable delta: add a local reservation operation; acceptance lives below.

function check(scenario) {
  const state = { ...scenario.before };
  const observation = observeReservation(scenario.id);
  const assert = observation.assert;
  try {
    const result = observation.call(reserve, state, scenario.quantity);
    assert.deepEqual(result, scenario.expected.result, "result");
    assert.equal(state.reserved, scenario.expected.reserved, "reserved");
  } finally {
    observation.flush();
  }
}

// @acceptance {"item_id":"AC-AT-CAPACITY","lifetime":"business"}
test("残数と同じ数量を予約すると、上限まで確保できる", () => {
  check(cases[0]);
});

// @acceptance {"item_id":"AC-EXCEEDS-CAPACITY","lifetime":"business"}
test("残数を超えて予約すると、拒否され確保済み数量は変わらない", () => {
  check(cases[1]);
});

// @acceptance {"item_id":"AC-INVALID-QUANTITY","lifetime":"business"}
test("正の整数でない数量は拒否され、確保済み数量は変わらない", () => {
  for (const scenario of cases.slice(2)) check(scenario);
});
