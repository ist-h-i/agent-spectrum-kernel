import assert from "node:assert/strict";
import test from "node:test";
import { quoteOrder } from "../../src/quote-order.mjs";

test("checkout rejects quantities outside the accepted order domain", () => {
  assert.throws(() => quoteOrder({ quantity: 0, unitPriceCents: 100 }), RangeError);
  assert.throws(() => quoteOrder({ quantity: -2, unitPriceCents: 100 }), RangeError);
});
