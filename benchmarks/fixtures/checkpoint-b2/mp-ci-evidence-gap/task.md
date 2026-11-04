# Pull request verification review

The checkout team is preparing to merge a change to order quotes. Quotes supply quantities and totals used when accepting an order, so an incorrect acceptance rule can reach customers even when the pull request status is green. Review whether the proposed change and its current verification evidence support merging it.

Use the supplied workflow, CI record, implementation, tests, and repository guidance. Write `workspace/review.json` using `workspace/review.schema.json`. The review must provide:

- A merge recommendation covering the order contract and the evidence available for it.
- Any material findings, with supplied paths and lines, the effect on order acceptance or confidence in the change, and the condition needed to resolve the risk.
- A truthful verification state that distinguishes the supplied CI record from checks run locally and identifies any coverage still missing.

There is no required finding count. Record the actual result of any local check used; do not treat output validation as product verification. Evidence paths are relative to the supplied workspace, with an optional `workspace/` prefix.

Write only `workspace/review.json`. Run `npm run validate:review` from the workspace to check the output structure and source references. Do not change the workflow, implementation, tests, or supplied CI evidence.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={".github/workflows/pull-request.yml":"d1a079e6bf8aea15c532c1ee06e9f505e92e40f6492be626dc8fd24f86eb382c","ci/pull-request-314.log":"8cdd6705480e8b6a859bf40098fe0e3c358564c1e775acd14d8bb8c55ec98fd6","docs/verification.md":"fe1e2db5b00085d6e3d59cffd3a191a1bd2f9f149f86ff898ad893b4fb9b69bf","package-lock.json":"1441bbf380d78c27f1604d32ba6c31806099a8d1e533877cd058c462e2b77723","package.json":"849ad5e187dfe0a542479aef8411203d606559ab0f140865601913e165a88fe7","pr.diff":"903d8a715665c7091aa7b7a0dba214235079abed3b09faa20510e46c64fbe834","review.schema.json":"22e7984d1a6b3c8e92177500b7a566d5f0cc06fa5325acc55dc6c4dc6e91a62a","scripts/upload-diagnostics.mjs":"4f82ac80e4c5622d0e33bdd44c8e01628ed63eee9a2d313a1cd0c6e73857dd2c","scripts/validate-review.mjs":"04596758f6cf4269b7681001d21bb211bee07b992c71ab759af1d9712bb9c682","src/quote-order.mjs":"9b74bbd8aebbce93ccaca984dee24dcdef2161e219c6bb9f609381a46a7a43f4","test/checkout/quote-order-contract.test.mjs":"92ec6bc43700ff64ae2c6d83725a3f71c1c871a5d9545a228f41f452f237f1fa","test/unit/quote-order.test.mjs":"d82815c4131eb7fe5d42b83d88658bd6c3814b542203c15566848b2d4150e0c5"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm run validate:review
```
