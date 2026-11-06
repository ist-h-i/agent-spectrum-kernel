# Add focused session-key regression coverage

The session cache uses tenant and region identifiers to select an entry. Region labels arriving with different capitalization must select the same key under `spec/session-key.md`. The implementation already meets that contract, but the existing suite does not protect the mixed-case region boundary.

Extend only `test/session-key.test.mjs` with focused coverage through the exported function that detects a future regression in this boundary. Preserve the existing checks, documented whitespace behavior and tenant identifier semantics. Do not change production code, the specification or project configuration.

Run `npm test` from this workspace. Report the actual result and explain which previously unprotected behavior the added coverage checks. A passing unchanged suite alone does not complete this test-only task.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"package.json":"9917efea8e57cb07719d5af2c2b97aaa556cdfe220279b9d2b73336501d7ca2e","spec/session-key.md":"0962415189e2a2c12a5ebff7db8d149524a7409eeb342b814251d1a0caa24bad","src/session-key.mjs":"34cbda6cafabd736e07b262a655bcbbfb92cbe6af0409803a8b2545bfa9cc510"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/session-key.test.mjs ] && npm test
```
