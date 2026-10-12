# Record API pull request review
Review the proposed response-adapter change for caller-visible error behavior and decide whether it is ready to merge. Inspect the PR diff, base and proposed implementation, error contract, client policy, supplied cases and tests. Run relevant local checks to establish observations.

Write only workspace/review.json using workspace/review.schema.json. Each finding must name one supplied case and cite file/line evidence, its observed before/after response and client result, and the behavior required by the published contract. Use those structured fields for all material claims; do not add free-form summary claims. A passing shape check does not establish review correctness. Do not modify any other workspace file.

Useful checks: npm test and npm run trace. After writing the review, run npm run validate:review.

Use this anchored invocation after writing the review:
```sh
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"base/response-adapter.mjs":"ee0accba181d6e2fb890ca7d2c7ccc3fb6131b97aa7bfc64fb013eee880c7537","data/cases.json":"65a415fb5626b4c555ed75cefb2155ead45d73bfd35481dcc72aecd996552aa4","docs/error-contract.md":"53d53857a4239ac6fa625c5f66ad73409ea05846edfa910bfb3d206c3ebc5230","package.json":"d2d55c3edd8df7aa2d7d53b7bf47e1fa8271c6846f1d3314e0c9d77bd43a79b5","pr.diff":"40585c23b4ab648a1c6d8eae5aa76e265ba1c9ce181ae41ba875858b7d62ff1e","review.schema.json":"37e208792b333486c24d0bf8b6a46b978a610b9d03841c6b552992cce5d3138d","scripts/trace-cases.mjs":"64dd208b9c24da2dd21f7ec69c24de9e1c94eedb4b20c8bcce3550a426861fde","scripts/validate-review.mjs":"35fdba9cf2bf42587e81c8bd39836b6868d4a33653ecd1b9d67dbd5ad5c6264e","src/client-policy.mjs":"8238c6db8d39fe810a136f1d413cdfd69df765820a0d0edc793fe4a6e895c814","src/response-adapter.mjs":"2aa656641e532930f268f31987268612be1d7bd27d01eb762869c19762f4ae84","test/api-error.test.mjs":"ff052dbe6c2ac6885b61e882e9eac6e616191ebfc0985839ed3fff59b8370cd5"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm run validate:review
```
