import nodeAssert from "node:assert/strict";
import test from "node:test";
import { reserve } from "./reservation.mjs";
import { cases } from "./reservation.cases.mjs";
import { observeReservation } from "./scenario-observer.mjs";

// @spec {"artifact_id":"SPEC-RESERVATION","artifact_type":"spec","revision":2,"status":"accepted","context_ref":"../domain-context.md"}
// Revision 2 adds an under-capacity acceptance item and a second over-capacity example.

function check(scenario) {
  const state = { ...scenario.before };
  const observation = observeReservation(scenario.id);
  const assert = observation.assert;
  try {
    const result = observation.call(reserve, state, scenario.quantity);
    assert.deepEqual(result, scenario.expected.result, "result");
    assert.equal(state.reserved, scenario.expected.reserved, "reserved");
    if (!scenario.expected.result.ok) nodeAssert.deepEqual(state, scenario.before);
  } finally {
    observation.flush();
  }
}

// Select and validate fixtures before the runner filters tests by name. A
// renamed or mistagged fixture must not yield an empty or unrelated green test.
const registeredItems = new Set();
nodeAssert.equal(new Set(cases.map(({ id }) => id)).size, cases.length, "duplicate case ID");

function acceptanceTest(itemId, title, hasRequiredInput) {
  nodeAssert.ok(!registeredItems.has(itemId), `duplicate acceptance group: ${itemId}`);
  registeredItems.add(itemId);

  const selected = cases.filter(({ item_id }) => item_id === itemId);
  nodeAssert.ok(selected.length > 0, `no cases for ${itemId}`);
  for (const scenario of selected) {
    nodeAssert.ok(hasRequiredInput(scenario), `${scenario.id}: input does not belong to ${itemId}`);
  }

  test(title, async (t) => {
    for (const scenario of selected) await t.test(scenario.id, () => check(scenario));
  });
}

const positiveInteger = (quantity) => Number.isInteger(quantity) && quantity > 0;
const remaining = (before) => before.capacity - before.reserved;

// @acceptance {"item_id":"AC-AT-CAPACITY","lifetime":"business"}
acceptanceTest("AC-AT-CAPACITY", "残数と同じ数量を予約すると、上限まで確保できる",
  ({ before, quantity }) => positiveInteger(quantity) && quantity === remaining(before));

// @acceptance {"item_id":"AC-EXCEEDS-CAPACITY","lifetime":"business"}
acceptanceTest("AC-EXCEEDS-CAPACITY", "残数を超えて予約すると、拒否され確保済み数量は変わらない",
  ({ before, quantity }) => positiveInteger(quantity) && quantity > remaining(before));

// @acceptance {"item_id":"AC-INVALID-QUANTITY","lifetime":"business"}
acceptanceTest("AC-INVALID-QUANTITY", "正の整数でない数量は拒否され、確保済み数量は変わらない",
  ({ quantity }) => !positiveInteger(quantity));

// @acceptance {"item_id":"AC-UNDER-CAPACITY","lifetime":"business"}
acceptanceTest("AC-UNDER-CAPACITY", "残数未満を予約すると、その数量だけ確保できる",
  ({ before, quantity }) => positiveInteger(quantity) && quantity < remaining(before));

for (const { id, item_id } of cases) {
  nodeAssert.ok(registeredItems.has(item_id), `${id}: unknown acceptance item ${item_id}`);
}
