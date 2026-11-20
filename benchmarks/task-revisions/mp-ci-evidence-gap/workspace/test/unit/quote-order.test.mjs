import assert from "node:assert/strict";
import test from "node:test";
import { quoteOrder } from "../../src/quote-order.mjs";

test("quotes ordinary and large-quantity orders", () => {
  assert.deepEqual(quoteOrder({ quantity: 3, unitPriceCents: 250 }), {
    quantity: 3,
    totalCents: 750,
    requiresManualReview: false,
  });
  assert.equal(quoteOrder({ quantity: 101, unitPriceCents: 100 }).requiresManualReview, true);
});

test("rejects out-of-domain quantities and invalid prices", () => {
  assert.throws(() => quoteOrder({ quantity: 0, unitPriceCents: 100 }), RangeError);
  assert.throws(() => quoteOrder({ quantity: -1, unitPriceCents: 100 }), RangeError);
  assert.throws(() => quoteOrder({ quantity: 1.5, unitPriceCents: 100 }), TypeError);
  assert.throws(() => quoteOrder({ quantity: 1, unitPriceCents: -1 }), RangeError);
});

test("routes individually high-priced orders to review", () => {
  assert.equal(quoteOrder({ quantity: 1, unitPriceCents: 50_000 }).requiresManualReview, true);
});
