# Transfer contract

Amounts are integer minor units. Account IDs and request shape are defined by the schema; values are never
coerced. Source and destination must be distinct, exist, use the same currency, and match both expected versions.
The source's resulting balance may equal but must not fall below `minBalance`.

Transfers are serialized through the repository's existing exclusive-execution boundary. Concurrent transfers
must not overspend, and concurrent identical requests must create one transfer.

`requestId` is an idempotency key. Lookup occurs inside the exclusive section before checking account versions or
balances. The same normalized request returns the original receipt; reuse with any different field is a conflict.

A successful transfer debits and credits atomically, increments both account versions once, and appends one audit
record. The transfer ID is `tr_` plus a six-digit sequence starting at 1. The async audit sink is part of the atomic
boundary: if it rejects, accounts, sequence, transfer history, and idempotency state remain unchanged.

The receipt is `{ requestId, transferId, amount, currency, from, to }`, where `from` and `to` contain account ID,
post-transfer balance, and post-transfer version. Inputs, receipts, account snapshots, and audit records must not
alias internal state. Existing credit, debit, getAccount, and listTransfers behavior remains compatible.
