import assert from "node:assert/strict";
import test from "node:test";
import { sessionCacheKey } from "../src/session-key.mjs";

test("builds a session key from normalized fields", () => {
  assert.equal(sessionCacheKey({ tenantId: " acme ", region: "us-east-1" }), "acme:us-east-1");
});

test("rejects missing key fields", () => {
  assert.throws(() => sessionCacheKey({ tenantId: "acme", region: " " }), /region must be a non-empty string/u);
});
