import assert from "node:assert/strict";
import test from "node:test";
import { summaryCacheKey } from "../../src/cache-key.mjs";

test("cache keys separate tenant and window values", () => {
  const first = { tenantId: "tenant-a", windowMinutes: 15, requestId: "trace-1" };
  assert.notEqual(summaryCacheKey(first), summaryCacheKey({ ...first, tenantId: "tenant-b" }));
  assert.notEqual(summaryCacheKey(first), summaryCacheKey({ ...first, windowMinutes: 30 }));
});
