# Implementation task: atomic rule batches

Implement the batch API described below. The repository is intentionally small; inspect the existing docs and
schema where wording such as “documented scalar”, “canonical key”, and strict request shape needs resolution.
Do not ask the user to decide those repository-defined details.

## Observable requirements

1. `RuleService.applyBatch(request)` is a public API and the relevant error type is exported from `src/index.mjs`.
2. Validate the top-level request and each operation strictly according to `docs/rule-batch.schema.json`, including limits and unknown fields; do not coerce values.
3. Canonicalize keys using the repository contract and reject duplicate canonical keys in one batch.
4. Accept only the repository-defined scalar values.
5. Check `expectedVersion` and apply the whole batch atomically; every failure must preserve rules, version, and idempotency state.
6. Support `set` and `delete`; deleting a missing key is allowed. Every newly accepted batch increments version exactly once.
7. Implement request-ID idempotency. Same normalized request returns the original receipt before version checking; a different payload under the same ID fails.
8. Do not mutate caller input, and do not expose aliases to internal state through results or stored values.
9. Return `{ requestId, version, rules }` with rule keys in the documented order.
10. Preserve existing `get`, `put`, `delete`, `list`, and `version` behavior.

Visible tests cover only a subset. Add focused tests for atomic failure, idempotent replay/collision, canonical-key duplicates, and aliasing.

## Scope

Allowed implementation files:

- `src/errors.mjs`
- `src/validation.mjs`
- `src/rule-store.mjs`
- `src/rule-service.mjs`
- `src/index.mjs`
- tests under `test/`

Do not modify `package.json`, files under `docs/`, or add dependencies/new source modules.
