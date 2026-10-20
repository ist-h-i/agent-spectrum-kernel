# Repair duplicate-sensitive ledger transfers

Investigate the fictional retry incident and fix workspace/src/ledger.mjs. Preserve exact integer-unit balances, one committed audit entry per unique transfer, atomic rejection and immutable inputs. The public ledger contract defines valid request identity, retry/conflict behavior and observable result shapes. Existing tests, incident record, initial state and documentation are protected; change only the implementation.

Run the exact final validation:

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"data/incident.json":"044860fee3e97446b7955ee4b6602ce5bfb3447feccb37d730f1821f0bb7143e","data/initial-state.json":"7e0bb7baeacb9b18406dca3985ce6ce45b03bebf7cb7c65d3fba4a8ed9a71d4e","docs/ledger-contract.md":"236ae38d35685890be54aba7ea910477ad9748a51a924182a7a1ca96e95f5775","package.json":"94fcbb8eafdca97376b4cb987d196f018d1ecc61cf8201421a8830d09a00bc86","test/ledger.test.mjs":"1ee13d777325c2dad8381ed0d23cdd3da959d6dbe8547270622e71a2897f3c5b"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm test
```
