import assert from "node:assert/strict";
import test from "node:test";
import { checkoutDisposition } from "../../src/checkout.mjs";

test("checkout uses the entire quoted order for the review boundary", () => {
  const ordinary = checkoutDisposition({ quantity: 4, unitPriceCents: 12_499 });
  const atLimit = checkoutDisposition({ quantity: 4, unitPriceCents: 12_500 });
  assert.equal(ordinary.totalCents, 49_996);
  assert.equal(ordinary.disposition, "ready-to-submit");
  assert.equal(atLimit.totalCents, 50_000);
  assert.equal(atLimit.disposition, "hold-for-review");
});
