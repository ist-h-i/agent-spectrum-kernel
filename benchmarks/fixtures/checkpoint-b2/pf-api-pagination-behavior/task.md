# Restore complete supplier catalog collection

The buying team uses a catalog export to reconcile supplier stock before preparing replenishment orders. The service has moved to its v2 contract, but the local collector no longer produces a complete export for all supported responses. Repair the collector so downstream consumers receive the service's items faithfully.

Read `spec/pagination-contract.md`, the collector, decoder, consumer and focused tests. The completed collector must use the v2 request contract, collect every continued page in order, preserve complete item data and duplicate occurrences, retain caller options and propagate failures. The existing request bound, repeated-URL rejection and decoder origin boundary must remain effective.

Change only `src/pagination.mjs` and `test/pagination.test.mjs`; extend focused coverage where needed. Preserve the supplied decoder, consumer, contract, package and dependencies. Requests are injected local doubles using fictional URLs; no service connection or installation is needed.

From the workspace, run `npm test`. Report the checks actually run and any remaining gap. Passing the public tests alone does not replace the published behavior contract.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"package.json":"a6440425662b1dd6d849e2f7e30863ba82dec6851ba9a0faa00de9051b7b9882","spec/pagination-contract.md":"b1b8f5488704c2d04f2342a3c0c6b67dc68915955612f3a85fbb4418797ed88c","src/api-pages.mjs":"e99adf811f97c23ab75c1f86599868c7b4189121e8f2ac946bed36e776fa04e8","src/catalog-consumer.mjs":"ba4bd46de51b31f00137f306972f636ecd82045d2f903f431d702a339883c50b"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/pagination.test.mjs ] && npm test
```
