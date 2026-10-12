# Evolve the customer record contract

Complete the v1-to-v2 schema evolution described in workspace/spec/evolution-contract.md. Preserve compatibility for old records/readers and implement an idempotent JSON migration plan with exact snapshot rollback. The supplied local tests exercise both versions; data is fictional and no real database or deployment is involved.

Change only workspace/schemas/customer-v2.schema.json and workspace/migrations/v1-v2.plan.json. Keep the supplied public evidence and checks. Run the exact final validation invocation below.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"data/legacy-customers.json":"298d9873a63a3f17e606a07ff896a399e515d5ba93cbb89b54cd7bc0898402ac","package.json":"032ca46f0b73388a59c8773f531ba7374cdc49e8d14a9e85d307688dd081f832","schemas/customer-v1.schema.json":"76670a9124ad3181ec9c517bc112e632fd2b1b9a0a6e8c7c20bac31b92357dd4","spec/evolution-contract.md":"cdceb75aeb4dc35cf1905f811e54a4f462db1c7e6edeeb85ca8d94615ac0565c","src/readers.mjs":"c051968124ab7a6538c89ffcedb1b87fe579f75b52918a568544d504181c0671","src/schema-contract.mjs":"462eac564ffd72f9b8f5d024292bd81d1e0a1dfc0c50b5c7283002a798524f9e","test/schema-evolution.test.mjs":"abeab224657b551f588934da805a5dacc15346156028971cb9fbead110c65bb1"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/schema-evolution.test.mjs ] && npm test
```
