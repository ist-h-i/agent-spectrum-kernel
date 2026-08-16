import { summaryCacheKey } from "./cache-key.mjs";

export function replaySummaryRequests(requests) {
  const cache = new Map();
  let hits = 0;
  let builds = 0;
  const keys = [];
  for (const request of requests) {
    const key = summaryCacheKey(request);
    keys.push(key);
    if (cache.has(key)) hits += 1;
    else {
      cache.set(key, { generated: true });
      builds += 1;
    }
  }
  return { requests: requests.length, hits, builds, keys };
}

export const repeatedTenantWindowRequests = Object.freeze([
  { tenantId: "tenant-a", windowMinutes: 15, requestId: "req-1" },
  { tenantId: "tenant-a", windowMinutes: 15, requestId: "req-2" },
  { tenantId: "tenant-a", windowMinutes: 15, requestId: "req-3" },
]);
