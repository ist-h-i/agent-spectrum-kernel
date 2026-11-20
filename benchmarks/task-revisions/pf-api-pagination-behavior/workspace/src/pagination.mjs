import { decodePage, legacyNextPage } from "./api-pages.mjs";

export async function collectItems(request, initialUrl, { pageSize = 2 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new RangeError("invalid page size");
  const first = new URL(initialUrl);
  first.searchParams.set("page_size", String(pageSize));
  const collected = [], seen = new Set();
  let nextUrl = first.href;
  while (nextUrl !== null) {
    if (seen.has(nextUrl)) throw new RangeError("repeated continuation");
    if (seen.size >= 10) throw new RangeError("pagination limit");
    seen.add(nextUrl);
    const page = decodePage(await request(nextUrl), nextUrl);
    collected.push(...page.items);
    if (page.items.length === 0) break;
    nextUrl = page.next === null ? null : legacyNextPage(nextUrl);
  }
  return collected;
}
