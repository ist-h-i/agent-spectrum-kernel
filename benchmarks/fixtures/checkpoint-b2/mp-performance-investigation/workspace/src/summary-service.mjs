import { summaryCacheKey } from "./cache-key.mjs";

export async function loadSummary({ request, cache, buildSummary }) {
  const key = summaryCacheKey(request);
  if (cache.has(key)) return { source: "cache", value: cache.get(key) };
  const value = await buildSummary(request);
  cache.set(key, value);
  return { source: "build", value };
}
