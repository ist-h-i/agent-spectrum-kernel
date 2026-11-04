# Introduce customer notes without disrupting older readers

Customer-support agents are adopting a consistent contact-note field while older customer-record consumers remain in use. Complete the v2 schema and local migration plan so both generations can read the same records and a rejected rollout can recover the exact original data.

Follow `spec/evolution-contract.md`. Existing accepted records, explicit notes and unrelated fields must survive. The current reader must provide the specified missing-note view without rewriting source data. The transition must populate only absent values, remain idempotent, reject invalid input without partial mutation, and restore the exact input snapshot on rollback.

Change only `schemas/customer-v2.schema.json` and `migrations/v1-v2.plan.json`. Preserve the v1 schema, fixed engine/readers, data, tests, package and contract. These are fictional JSON records and an in-memory plan interpreter; do not run a database migration or deployment.

From the workspace, run `npm test` and report the observed result and any unverified requirement. The local engine's supported schema and plan interfaces are documented in the contract.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"data/legacy-customers.json":"298d9873a63a3f17e606a07ff896a399e515d5ba93cbb89b54cd7bc0898402ac","package.json":"032ca46f0b73388a59c8773f531ba7374cdc49e8d14a9e85d307688dd081f832","schemas/customer-v1.schema.json":"76670a9124ad3181ec9c517bc112e632fd2b1b9a0a6e8c7c20bac31b92357dd4","spec/evolution-contract.md":"a1eb5adb21d054b74999d117927ecde61e723a402001dad0775ffc922df80d74","src/readers.mjs":"c051968124ab7a6538c89ffcedb1b87fe579f75b52918a568544d504181c0671","src/schema-contract.mjs":"08df8a61eaa1ed6ad2fccc5d14311cd7013108fcf25db99863cba3d431953b9a","test/schema-evolution.test.mjs":"abeab224657b551f588934da805a5dacc15346156028971cb9fbead110c65bb1"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/schema-evolution.test.mjs ] && npm test
```
