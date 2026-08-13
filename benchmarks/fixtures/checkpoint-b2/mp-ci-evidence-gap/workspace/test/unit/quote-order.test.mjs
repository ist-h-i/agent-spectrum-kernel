import assert from "node:assert/strict";
import test from "node:test";
import { quoteOrder } from "../../src/quote-order.mjs";

test("quotes ordinary and bulk orders", () => {
  assert.deepEqual(quoteOrder({ quantity: 3, unitPriceCents: 250 }), {
    quantity: 3,
    totalCents: 750,
    requiresManualReview: false,
  });
  assert.equal(quoteOrder({ quantity: 101, unitPriceCents: 100 }).requiresManualReview, true);
});

test("rejects non-integer quantities and invalid prices", () => {
  assert.throws(() => quoteOrder({ quantity: 1.5, unitPriceCents: 100 }), TypeError);
  assert.throws(() => quoteOrder({ quantity: 1, unitPriceCents: -1 }), RangeError);
});
