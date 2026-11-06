# Repair retry handling in an internal transfer ledger

A fictional account service retries a transfer when it cannot tell whether a prior attempt completed. Its incident record reports a repeated request changing balances twice and a rejected request altering input state. The service team needs the local ledger function repaired before callers can rely on retries and rejection results.

Investigate the supplied implementation, incident and tests, then fix only `workspace/src/ledger.mjs`. Completion requires contract-compliant results for new requests, exact retries, conflicting retries and rejected requests; exact integer-unit balances; one committed audit entry per unique transfer; and preservation of input state, input request and prior committed history. Use the ledger contract for request identity, observable result shapes and the boundary of defined behavior.

Existing tests, data and documentation are protected. This is a pure in-memory model, with no real charges, external writes, concurrent processes or durable transactions. Do not add dependencies or change the public API.

Run the final check from `workspace/`:

```bash
npm test
```

Passing supplied tests is evidence for the behavior they exercise, not proof about a live financial system.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"data/incident.json":"044860fee3e97446b7955ee4b6602ce5bfb3447feccb37d730f1821f0bb7143e","data/initial-state.json":"7e0bb7baeacb9b18406dca3985ce6ce45b03bebf7cb7c65d3fba4a8ed9a71d4e","docs/ledger-contract.md":"68ec21a9b07c506eabc47cb567250b1e409407fabce77cd6bca9105dc2fab8b4","package.json":"94fcbb8eafdca97376b4cb987d196f018d1ecc61cf8201421a8830d09a00bc86","test/ledger.test.mjs":"1ee13d777325c2dad8381ed0d23cdd3da959d6dbe8547270622e71a2897f3c5b"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm test
```
