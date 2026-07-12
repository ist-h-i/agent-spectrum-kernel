import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const workspace = process.argv[2];
if (!workspace) throw new Error("workspace path is required");
const { reserveStock } = await import(pathToFileURL(resolve(workspace, "src/inventory.mjs")));

function initial() {
  return { stock: { widget: 5, gadget: 2 }, processed: {} };
}

test("IMP-1 rejects malformed requests", () => {
  for (const request of [null, {}, { requestId: "", sku: "widget", quantity: 1 }, { requestId: "x", sku: "", quantity: 1 }, { requestId: "x", sku: "widget", quantity: 1.5 }]) {
    const state = initial();
    assert.deepEqual(reserveStock(state, request), { state, result: { ok: false, error: "INVALID_REQUEST" } });
  }
});

test("IMP-2 rejects an unknown SKU", () => {
  const state = initial();
  assert.deepEqual(reserveStock(state, { requestId: "x", sku: "missing", quantity: 1 }), { state, result: { ok: false, error: "UNKNOWN_SKU" } });
});

test("IMP-3 rejects insufficient stock", () => {
  const state = initial();
  assert.deepEqual(reserveStock(state, { requestId: "x", sku: "gadget", quantity: 3 }), { state, result: { ok: false, error: "INSUFFICIENT_STOCK" } });
});

test("IMP-4 decrements only the selected SKU and records the request", () => {
  const state = initial();
  const outcome = reserveStock(state, { requestId: "x", sku: "widget", quantity: 2 });
  assert.deepEqual(outcome.result, { ok: true, remaining: 3 });
  assert.deepEqual(outcome.state.stock, { widget: 3, gadget: 2 });
  assert.deepEqual(outcome.state.processed.x, { sku: "widget", quantity: 2, result: { ok: true, remaining: 3 } });
});

test("IMP-5 replays the original result without another decrement", () => {
  const first = reserveStock(initial(), { requestId: "x", sku: "widget", quantity: 2 });
  const replay = reserveStock(first.state, { requestId: "x", sku: "widget", quantity: 2 });
  assert.deepEqual(replay.result, first.result);
  assert.equal(replay.state.stock.widget, 3);
});

test("IMP-6 rejects conflicting idempotency-key reuse", () => {
  const first = reserveStock(initial(), { requestId: "x", sku: "widget", quantity: 2 });
  const conflict = reserveStock(first.state, { requestId: "x", sku: "gadget", quantity: 1 });
  assert.deepEqual(conflict, { state: first.state, result: { ok: false, error: "IDEMPOTENCY_CONFLICT" } });
});

test("IMP-7 never mutates the input or nested objects", () => {
  const state = initial();
  const before = structuredClone(state);
  const outcome = reserveStock(state, { requestId: "x", sku: "widget", quantity: 2 });
  assert.deepEqual(state, before);
  assert.notEqual(outcome.state, state);
  assert.notEqual(outcome.state.stock, state.stock);
  assert.notEqual(outcome.state.processed, state.processed);
});
