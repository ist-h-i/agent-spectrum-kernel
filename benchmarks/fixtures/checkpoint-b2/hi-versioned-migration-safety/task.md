# Plan a customer-directory field migration

A fictional directory service is moving its customer-facing name field from `name` to `display_name`. Old and new application versions overlap during release, and the release owner needs a plan that preserves current values for active readers and a credible recovery decision at each supplied checkpoint.

Complete only `workspace/migration-plan.json`. Use the supplied application behaviors, schema capabilities, mixed state and rollback observations to choose the reader/writer policies, order the supported rollout operations, assess cutover readiness and record the recovery judgment for every case. The plan must preserve data and compatible access during version overlap, and distinguish a recovery supported by evidence from one that loses later writes or lacks sufficient evidence.

All other files are protected. Prepare only: no database, deployment, restore or external action is requested. Execution and restoration require their own specific approval and current-state revalidation. The public checks cover shape, references, preparation safeguards and unsupported safety claims. They do not certify complete compatibility and recovery reasoning.

Run the final checks from `workspace/`:

```bash
npm test && npm run dry-run && npm run validate:plan
```

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"data/mixed-state.json":"67ebf6e08e379df6f49e1b2403878b39eb6be96f4fa87905a0b821c72cbf4396","data/rollback-cases.json":"e15d4fbeaadf3ee3a68adbfa68389807af6a2f9c84d16dbbcef22f78d3015415","data/schema-phases.json":"c16839bcb0fc84c3bf30632154e561337ac26aa9a5f23b32fa53776e92473f4c","docs/migration-contract.md":"fad7681dee939e8fb4385977de072335be73043dc1fd7deb086431c63b4e6c48","package.json":"7d90c994d6cacf37b193aad4b55ac6e78d38a1c897fcd08cfd8c9f19192bf3bd","plan.schema.json":"ccdb5cbb2ee55e3bc5ad3ed64f06e6563b99c7b7a7614821b310a536d4abfb36","scripts/compatibility.mjs":"c588ca58e23c94df10735fc26a6f6458234fa2bf5aa2dc0db1b6d82ad46a096a","scripts/dry-run.mjs":"42ebb31f06779e803989c5c6ef28ed4589516d5039c3f8bfef4f513b34e1a7cb","scripts/validate-plan.mjs":"72e1ae6be29ef14a2e4d2501eab21fe0bd03a0129d0d74b455ea6c3918cb0652","scripts/validate-shape.mjs":"9061ca8fbe62c4f9ceec72bc6946f4432b84ef2dd6cf8390be557fd7e333e68e","test/mixed-version.test.mjs":"1aa063740e6229df33e6ea2a3e787cb1525663f42efded695c567f7c08979d69"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm test && npm run dry-run && npm run validate:plan
```
