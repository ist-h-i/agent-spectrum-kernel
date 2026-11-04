# Review record-service errors as the support client observes them

A support application uses the record service's error response to choose its displayed state and, for eligible reads, whether and how long to wait before retrying. Review the proposed response-adapter PR and decide whether it is ready to merge without disrupting that caller contract.

Inspect `pr.diff`, base and proposed adapter, `docs/error-contract.md`, the unchanged client policy, cases and tests. Write only `review.json` using `review.schema.json`. Each material finding must identify a supplied case, cite file/line evidence, record observed before/after response AND client results, and state the behavior required by the published contract. Derive findings, severity and decision from that evidence; preserve correct behavior and avoid expanding the PR. Use the structured fields for all material claims, without additional free-form summary claims.

Preserve all supplied workspace files. Scenarios are fictional local records; no remote service or application change is requested. Passing the existing tests or a report shape check alone does not establish review correctness.

From the workspace, run `npm test` and `npm run trace`; after writing the review, run `npm run validate:review`. Declare only the verification actually performed.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"base/response-adapter.mjs":"ee0accba181d6e2fb890ca7d2c7ccc3fb6131b97aa7bfc64fb013eee880c7537","data/cases.json":"65a415fb5626b4c555ed75cefb2155ead45d73bfd35481dcc72aecd996552aa4","docs/error-contract.md":"e2b653917bb3c1a54d12e61112d902958b4460740c188217da3dd35ef0aab88b","package.json":"d2d55c3edd8df7aa2d7d53b7bf47e1fa8271c6846f1d3314e0c9d77bd43a79b5","pr.diff":"40585c23b4ab648a1c6d8eae5aa76e265ba1c9ce181ae41ba875858b7d62ff1e","review.schema.json":"285c6d6b179bbe688cb8d8a6dee67e615988db91fb64ddfb02519f339b82fdb5","scripts/trace-cases.mjs":"64dd208b9c24da2dd21f7ec69c24de9e1c94eedb4b20c8bcce3550a426861fde","scripts/validate-review.mjs":"9486039537e4924edc142709a3bcebbaa0236652bcb55daf690be1f164487475","src/client-policy.mjs":"8238c6db8d39fe810a136f1d413cdfd69df765820a0d0edc793fe4a6e895c814","src/response-adapter.mjs":"2aa656641e532930f268f31987268612be1d7bd27d01eb762869c19762f4ae84","test/api-error.test.mjs":"ff052dbe6c2ac6885b61e882e9eac6e616191ebfc0985839ed3fff59b8370cd5"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm test && npm run trace && npm run validate:review
```
