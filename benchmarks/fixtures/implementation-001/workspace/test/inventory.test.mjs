import test from "node:test";
import assert from "node:assert/strict";
import { reserveStock } from "../src/inventory.mjs";

test("reserves available stock", () => {
  const initial = { stock: { widget: 5 }, processed: {} };
  const outcome = reserveStock(initial, { requestId: "req-1", sku: "widget", quantity: 2 });

  assert.deepEqual(outcome.result, { ok: true, remaining: 3 });
  assert.equal(outcome.state.stock.widget, 3);
  assert.equal(initial.stock.widget, 5);
});

test("rejects an invalid quantity without mutation", () => {
  const initial = { stock: { widget: 5 }, processed: {} };
  const outcome = reserveStock(initial, { requestId: "req-2", sku: "widget", quantity: 0 });

  assert.deepEqual(outcome, { state: initial, result: { ok: false, error: "INVALID_REQUEST" } });
});
