export function decodePage(value, requestUrl) {
  if (!value || typeof value !== "object" || !Array.isArray(value.items) || !value.links || typeof value.links !== "object") throw new TypeError("invalid catalog page");
  const next = value.links.next;
  if (next !== null && (typeof next !== "string" || next.length === 0)) throw new TypeError("invalid continuation");
  if (next !== null) {
    const target = new URL(next);
    if (target.protocol !== "https:" || target.origin !== new URL(requestUrl).origin) throw new TypeError("invalid continuation origin");
  }
  return { items: value.items, next };
}

export function legacyNextPage(url) {
  const target = new URL(url);
  target.searchParams.set("page", String(Number(target.searchParams.get("page") ?? "1") + 1));
  return target.href;
}
