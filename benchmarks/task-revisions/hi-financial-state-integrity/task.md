# Repair retry handling in an internal transfer ledger

A fictional account service retries a transfer when it cannot tell whether a prior attempt completed. Its incident record reports a repeated request changing balances twice and a rejected request altering input state. The service team needs the local ledger function repaired before callers can rely on retries and rejection results.

Investigate the supplied implementation, incident and tests, then fix only `workspace/src/ledger.mjs`. Completion requires contract-compliant results for new requests, exact retries, conflicting retries and rejected requests; exact integer-unit balances; one committed audit entry per unique transfer; and preservation of input state, input request and prior committed history. Use the ledger contract for request identity, observable result shapes and the boundary of defined behavior.

Existing tests, data and documentation are protected. This is a pure in-memory model, with no real charges, external writes, concurrent processes or durable transactions. Do not add dependencies or change the public API.

Run the final check from `workspace/`:

```bash
npm test
```

Passing supplied tests is evidence for the behavior they exercise, not proof about a live financial system.

Keep the fixed tests intact. In the final response give one reproducible local sequence and its observed results: include a new request, exact replay, conflicting replay and rejection. Record the responses, integer-unit balances, request registry, audit history and earlier state/request values after subsequent operations. Identify any checks not run. The sequence should distinguish unchanged current balances from loss of an earlier state or history.
