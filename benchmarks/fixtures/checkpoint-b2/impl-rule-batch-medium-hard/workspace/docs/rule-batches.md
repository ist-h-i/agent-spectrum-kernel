# Atomic rule batch contract

Rule keys are canonicalized by trimming surrounding whitespace and converting ASCII letters to lower case.
The canonical key must match `[a-z][a-z0-9._-]{0,31}`. Two operations that resolve to the same canonical key
make the request invalid.

A documented scalar is exactly one of: `null`, string, boolean, or finite number. Arrays, objects, bigint,
undefined, `NaN`, and infinities are invalid. Request and operation objects follow the JSON schema strictly;
unknown properties and type coercion are not accepted.

A batch contains 1 through 20 operations. `delete` of a missing key is accepted. Every newly accepted batch,
including an all-no-op delete batch, increments the store version exactly once. Validation, version checking,
and application are atomic.

`requestId` is an idempotency key. Replay lookup occurs before checking the current version. The same request ID
with the same normalized payload returns the original receipt; reuse with any different normalized field is an
idempotency conflict. Results and inputs must not alias internal state.

Batch receipts are `{ requestId, version, rules }`; `rules` keys are returned in lexical order. Existing single-rule
get, put, delete, list, and version behavior must remain compatible.
