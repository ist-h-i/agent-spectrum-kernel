# Restore the local member interchange

The member export/import handoff is already on version 2, but the importer rejects the current exporter's payload. Bring the adjacent schema into agreement with `spec/member-contract.md` so the two local components can exchange member records again. Read `spec/schema-alignment-plan.md` for the local change boundary.

A current producer payload must import with its field values intact. Preserve required fields, type and nonempty-string checks, the optional boolean's default, and rejection of obsolete or unknown fields. Keep the exported APIs and invalid-payload error type unchanged.

Change only `schemas/member.schema.json` and `test/member-record.test.mjs`. Use the supplied focused regression tests and extend them if needed. The producer and consumer stay unchanged; no compatibility alias, generic validation framework, data migration, dependency or service change is requested.

Run `npm test` from this workspace and report the change and actual result.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"package.json":"4efed0d52aedcfad81aa2ea9735c6e9eb69b2ebead0fea04344c4e4e111eb77c","spec/member-contract.md":"1bd41e23d822b0c0b18c9ec96e2eff69958f5fe321f9e5778cd8d17e7b6a182e","spec/schema-alignment-plan.md":"0dc0a6fd2fa954172df56ffe36133a29c618de2349aa4b34be9a96f5ee651039","src/member-import.mjs":"23229f637aa314e5d798baf42eb32dcba56251e8dcaf0c26b9d01969756f7816","src/member-export.mjs":"bee56827d7d03d2db64102b6607136b4655b2ceb1a9a0bb3111349f8acb41bb6"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/member-record.test.mjs ] && npm test
```
