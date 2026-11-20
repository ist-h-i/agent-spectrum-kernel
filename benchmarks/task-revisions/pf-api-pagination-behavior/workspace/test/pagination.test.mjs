import test from "node:test";
import assert from "node:assert/strict";
import { collectItems } from "../src/pagination.mjs";
import { loadCatalogIds } from "../src/catalog-consumer.mjs";
const base = "https://catalog.example.test/items?category=tools";

test("first request uses the current page-size parameter and retains filters", async () => {
  await collectItems(async url => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("limit"), "3");
    assert.equal(parsed.searchParams.has("page_size"), false);
    assert.equal(parsed.searchParams.get("category"), "tools");
    return { items: [], links: { next: null } };
  }, base, { pageSize: 3 });
});

test("consumer follows the exact opaque continuation and retains duplicate IDs", async () => {
  const next = "https://catalog.example.test/items?cursor=a%2Fb&limit=1&category=tools";
  const calls = [];
  const ids = await loadCatalogIds(async url => {
    calls.push(url);
    if (calls.length === 1) return { items: [{ id: "a" }], links: { next } };
    assert.equal(url, next);
    return { items: [{ id: "a" }, { id: "b" }], links: { next: null } };
  }, base);
  assert.deepEqual(ids, ["a", "a", "b"]);
  assert.equal(calls.length, 2);
});

test("empty intermediate page does not discard a valid continuation", async () => {
  let count = 0;
  const result = await collectItems(async () => ++count === 1
    ? { items: [], links: { next: "https://catalog.example.test/items?cursor=next" } }
    : { items: [{ id: "after-empty" }], links: { next: null } }, base);
  assert.deepEqual(result, [{ id: "after-empty" }]);
  assert.equal(count, 2);
});

test("repeated continuation is rejected before a repeated request", async () => {
  let count = 0;
  await assert.rejects(collectItems(async url => {
    count += 1;
    return { items: [{ id: "a" }], links: { next: url } };
  }, base), RangeError);
  assert.equal(count, 1);
});

test("single page retains all item fields without modifying the response", async () => {
  const page = { items: [{ id: "a", extra: { status: "local" } }], links: { next: null } };
  const before = structuredClone(page);
  assert.deepEqual(await collectItems(async () => page, base), before.items);
  assert.deepEqual(page, before);
});

test("request and decoder failures remain failures", async () => {
  const error = new Error("local request rejected");
  await assert.rejects(collectItems(async () => { throw error; }, base), value => value === error);
  await assert.rejects(collectItems(async () => ({ items: [], links: { next: "https://other.example.test/items" } }), base), TypeError);
});

test("ten-request limit remains bounded", async () => {
  let count = 0;
  await assert.rejects(collectItems(async () => {
    count += 1;
    return { items: [{ id: String(count) }], links: { next: `https://catalog.example.test/items?cursor=${count}` } };
  }, base), /pagination limit/u);
  assert.equal(count, 10);
});

test("invalid page-size options fail before a request", async () => {
  for (const pageSize of [0, 101, 1.5, null, "2"]) {
    let calls = 0;
    await assert.rejects(collectItems(async () => { calls += 1; }, base, { pageSize }), RangeError);
    assert.equal(calls, 0);
  }
});
