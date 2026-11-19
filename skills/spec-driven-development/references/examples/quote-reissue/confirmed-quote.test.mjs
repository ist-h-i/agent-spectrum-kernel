import assert from "node:assert/strict";
import test from "node:test";
import { recordConfirmedQuote, requireConfirmedTotal } from "./confirmed-quote.mjs";

// Additional unit evidence; acceptance source: ./quote-reissue.test.mjs
// @spec-ref {"artifact_id":"SPEC-QUOTE-REISSUE","observed_revision":1}

// @acceptance-ref {"item_id":"AC-CONFIRMED-TOTAL"}
test("確定時に記録した金額を、後の価格に置き換えない", () => {
  const confirmed = recordConfirmedQuote("Q-101", 1200);
  assert.equal(requireConfirmedTotal({ ...confirmed, catalogPriceYen: 1500 }), 1200);
});

// @acceptance-ref {"item_id":"AC-LEGACY-UNAVAILABLE"}
test("確定額を裏付ける記録がなければ、金額は不明のままにする", () => {
  assert.throws(() => requireConfirmedTotal({ id: "Q-099", catalogPriceYen: 1500 }), {
    code: "CONFIRMED_TOTAL_UNAVAILABLE",
  });
});
