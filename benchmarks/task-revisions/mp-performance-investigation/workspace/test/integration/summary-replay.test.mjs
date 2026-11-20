import assert from "node:assert/strict";
import test from "node:test";
import { replaySummaryRequests, repeatedTenantWindowRequests } from "../../src/summary-replay.mjs";

test("an individual replay reports the request outcome", async () => {
  const [request] = repeatedTenantWindowRequests;
  const result = await replaySummaryRequests([request], [{ type: "start", index: 0 }, { type: "finish", index: 0 }]);
  assert.equal(result.requests, 1);
  assert.equal(result.outcomes[0].source, "build");
  assert.equal(result.builds, 1);
});
