# Implementation task: atomic concurrent transfers

Implement the transfer API using the existing repository boundaries. Read the transfer contract, schema, and
`SerialExecutor` before choosing where state changes occur.

## Observable requirements

1. Add public async `TransferService.transfer(request)` behavior and export the new public error types.
2. Validate the request strictly against the repository schema, including unknown fields, safe integers, IDs, and distinct accounts; do not coerce.
3. Require both accounts to exist, use the same currency, and match the supplied versions.
4. Enforce the source `minBalance`; equality at the floor is valid.
5. Implement idempotency inside the exclusive state boundary. Same normalized request replays before version/balance checks; different payload under the same key fails.
6. Serialize transfers through the existing executor so concurrent calls cannot overspend and concurrent duplicates commit once.
7. On success, debit and credit atomically, increment each version once, allocate the documented transfer ID, and append exactly one history record.
8. Treat the async audit sink as part of the atomic operation. If it rejects, all account, sequence, history, and idempotency state must remain unchanged.
9. Return the exact documented receipt shape with post-transfer balances and versions.
10. Do not mutate input or expose aliases through receipts, account snapshots, history, or the object passed to the audit sink.
11. Any validation, account, currency, version, balance, idempotency, or audit failure must preserve state.
12. Preserve existing `credit`, `debit`, `getAccount`, and `listTransfers` behavior.

Visible tests cover happy-path transfer and basic validation only. Add tests for audit rollback, concurrent overspend,
concurrent idempotent replay, version failure, floor boundary, and aliasing.

## Scope

Allowed implementation files:

- `src/errors.mjs`
- `src/validation.mjs`
- `src/account-store.mjs`
- `src/transfer-service.mjs`
- `src/index.mjs`
- tests under `test/`

Do not modify `src/serial-executor.mjs`, `package.json`, files under `docs/`, or add dependencies/new source modules.
