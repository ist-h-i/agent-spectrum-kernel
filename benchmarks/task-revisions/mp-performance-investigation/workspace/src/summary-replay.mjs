import { summaryCacheKey } from "./cache-key.mjs";
import { loadSummary } from "./summary-service.mjs";

export async function replaySummaryRequests(requests, events) {
  const cache = new Map();
  const active = new Map();
  const outcomes = [];
  let builds = 0;
  const started = new Set();
  for (const { type, index } of events) {
    if (!Number.isInteger(index) || index < 0 || index >= requests.length) throw new Error("unrecognized request");
    if (type === "start" && !started.has(index)) {
      started.add(index);
      const request = requests[index];
      const entry = { key: summaryCacheKey(request), completeBuild: null };
      entry.task = loadSummary({
        request, cache,
        buildSummary: () => {
          builds += 1;
          return new Promise(resolve => { entry.completeBuild = resolve; });
        },
      });
      active.set(index, entry);
    } else if (type === "finish" && active.has(index)) {
      const entry = active.get(index);
      entry.completeBuild?.({ generated: true });
      const { source } = await entry.task;
      outcomes.push({ index, key: entry.key, source });
      active.delete(index);
    } else {
      throw new Error("invalid replay timeline");
    }
  }
  if (started.size !== requests.length || active.size) throw new Error("incomplete replay timeline");
  return { requests: requests.length, hits: outcomes.filter(row => row.source === "cache").length, builds, outcomes };
}

export const repeatedTenantWindowRequests = Object.freeze([
  { tenantId: "tenant-a", windowMinutes: 15, requestId: "req-1" },
  { tenantId: "tenant-a", windowMinutes: 15, requestId: "req-2" },
  { tenantId: "tenant-a", windowMinutes: 15, requestId: "req-3" },
]);
