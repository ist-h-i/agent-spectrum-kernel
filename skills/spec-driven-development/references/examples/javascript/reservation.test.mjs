import assert from "node:assert/strict";
import test from "node:test";
import { reserve } from "./reservation.mjs";

// @spec {"artifact_id":"SPEC-RESERVATION","artifact_type":"spec","revision":1,"status":"accepted","context_ref":"../domain-context.md"}
// Observable delta: add a local reservation operation; acceptance lives below.

// @acceptance {"item_id":"AC-AT-CAPACITY","lifetime":"business"}
test("残数と同じ数量を予約すると、上限まで確保できる", () => {
  const state = { capacity: 10, reserved: 7 };
  assert.deepEqual(reserve(state, 3), { ok: true, reserved: 10 });
  assert.equal(state.reserved, 10);
});

// @acceptance {"item_id":"AC-EXCEEDS-CAPACITY","lifetime":"business"}
test("残数を超えて予約すると、拒否され確保済み数量は変わらない", () => {
  const state = { capacity: 10, reserved: 7 };
  assert.deepEqual(reserve(state, 4), { ok: false, error: "CAPACITY_EXCEEDED" });
  assert.equal(state.reserved, 7);
});

// @acceptance {"item_id":"AC-INVALID-QUANTITY","lifetime":"business"}
test("正の整数でない数量は拒否され、確保済み数量は変わらない", () => {
  for (const quantity of [0, -1, 1.5, "3", true, NaN]) {
    const state = { capacity: 10, reserved: 7 };
    assert.deepEqual(reserve(state, quantity), { ok: false, error: "INVALID_QUANTITY" });
    assert.equal(state.reserved, 7);
  }
});
