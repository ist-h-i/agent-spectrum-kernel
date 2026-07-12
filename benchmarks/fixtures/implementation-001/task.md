# Task: implement immutable idempotent stock reservation

Implement `reserveStock(state, request)` in `src/inventory.mjs`.

Requirements:

- `IMP-1`: accept `{ requestId, sku, quantity }`; `requestId` and `sku` must be non-empty strings and `quantity` must be a positive integer.
- `IMP-2`: unknown SKU returns `{ ok: false, error: "UNKNOWN_SKU" }` without changing state.
- `IMP-3`: insufficient stock returns `{ ok: false, error: "INSUFFICIENT_STOCK" }` without changing state.
- `IMP-4`: a successful reservation returns `{ ok: true, remaining }`, decrements only the requested SKU, and records the request in `state.processed`.
- `IMP-5`: replaying the same `requestId`, `sku`, and `quantity` returns the original success result without decrementing stock again.
- `IMP-6`: reusing a processed `requestId` with a different `sku` or `quantity` returns `{ ok: false, error: "IDEMPOTENCY_CONFLICT" }` without changing state.
- `IMP-7`: the input state and its nested `stock` / `processed` objects must never be mutated; every return includes a `state` value.
- Invalid input returns `{ ok: false, error: "INVALID_REQUEST" }` without changing state.

Keep changes within `src/inventory.mjs` and tests. Use no dependencies. Run the relevant tests. Return only the structured final response required by the supplied output schema.
