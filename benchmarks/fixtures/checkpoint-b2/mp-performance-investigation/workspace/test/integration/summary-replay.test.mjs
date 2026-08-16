import assert from "node:assert/strict";
import test from "node:test";
import { replaySummaryRequests, repeatedTenantWindowRequests } from "../../src/summary-replay.mjs";

test("current replay records the observed absence of reuse", () => {
  assert.deepEqual(replaySummaryRequests(repeatedTenantWindowRequests), {
    requests: 3,
    hits: 0,
    builds: 3,
    keys: ["tenant-a:15:req-1", "tenant-a:15:req-2", "tenant-a:15:req-3"],
  });
});
