import assert from "node:assert/strict";
import test from "node:test";
import { summaryCacheKey } from "../../src/cache-key.mjs";

test("request trace identifiers remain represented in the current cache key", () => {
  const first = summaryCacheKey({ tenantId: "tenant-a", windowMinutes: 15, requestId: "req-1" });
  const second = summaryCacheKey({ tenantId: "tenant-a", windowMinutes: 15, requestId: "req-2" });
  assert.notEqual(first, second);
});
