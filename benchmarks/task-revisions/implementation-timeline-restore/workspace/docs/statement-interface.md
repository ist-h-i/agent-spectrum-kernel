# Statement clients

The legacy viewer calls `lookupEvents(events, requests)` synchronously. Its frozen client examples and the shipped implementation define its behaviour. Production still uses it independently of the archive.

The restore desk calls `await restore(manifest, requests, allowance, readPack)`. Requests are in caller order and may repeat. Each is `{tenant, at, from, until, after, limit}`, with nonnegative integer revision, a finite half-open event-time range [from, until), and a nonnegative integer page size. `after` is null or a position `{time, key}`. A statement is the tenant's live entries at revision `at`, filtered by event time. Order by descending numeric time and then ascending key in JavaScript string order. A position is exclusive in this order and need not refer to an existing row.

Each statement returns `{count, total, entries}`. Count and total include **all** live entries in the range, including those outside the requested page. Total is an exact signed decimal cents string. Each page entry is `{key,time,cents}`, with cents a normalized decimal string. Distinct entries can have identical times or amounts. Emit one statement per request, including an empty result for an empty window or page.

`restore` returns `{status, spent, minimum, statements}`. For success use `"ok"`, the units actually spent, 0 outstanding and the statement array. On an unaffordable restore use `"over_budget"`, the units actually spent, the minimum **additional** units needed, and null statements. An impossible restore is `"unavailable"` with both minimum and statements null. A batch is delivered together. Data retained from one call cannot be used to quote or serve another.
