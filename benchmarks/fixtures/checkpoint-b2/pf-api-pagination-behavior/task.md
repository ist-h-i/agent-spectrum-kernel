# Update the catalog pagination client

The catalog service now uses its v2 request and response contract. Our client still behaves like the older numbered-page client: it sends the old page-size parameter and misses items when a continuation is opaque or an intermediate page is empty. Update the local collector and verify it with the supplied focused tests; extend the tests if more coverage is needed.

Read `spec/pagination-contract.md`, the nearby collector, decoder and consumer. Preserve item data, caller options, failure propagation and the existing request bound. Keep this to the collector and its tests; the fixed decoder/consumer, dependencies and service must not change. All tests inject a local request function; no network service is needed. Run the published verification command from this workspace.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"package.json":"a6440425662b1dd6d849e2f7e30863ba82dec6851ba9a0faa00de9051b7b9882","spec/pagination-contract.md":"a9d105ef7beecbff0b70ba61b5b4f4d13bfc023d39a126adf2ec76c13e2a9095","src/api-pages.mjs":"e99adf811f97c23ab75c1f86599868c7b4189121e8f2ac946bed36e776fa04e8","src/catalog-consumer.mjs":"ba4bd46de51b31f00137f306972f636ecd82045d2f903f431d702a339883c50b"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/pagination.test.mjs ] && npm test
```
