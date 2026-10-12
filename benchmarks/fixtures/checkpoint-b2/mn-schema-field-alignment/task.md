# Align the member schema with the current API field

The local member exporter emits the current v2 payload, but the importer rejects that payload because the adjacent schema still uses an older field name. Align the schema with the authoritative local contract and verify the change with the supplied focused regression tests. Extend those tests if more coverage is needed.

Read `spec/member-contract.md`, `spec/schema-alignment-plan.md`, the schema and the producer/consumer. Preserve the existing validation strictness and other fields. Keep this to the schema and its tests; no generic validation framework, caller rewrite, data migration or service change is needed. Run the following command from this workspace. It first checks the fixed project files and then runs `npm test`.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"package.json":"4efed0d52aedcfad81aa2ea9735c6e9eb69b2ebead0fea04344c4e4e111eb77c","spec/member-contract.md":"1bd41e23d822b0c0b18c9ec96e2eff69958f5fe321f9e5778cd8d17e7b6a182e","spec/schema-alignment-plan.md":"2fb332652d4c7349ba8ce1cd8f9429bccbafdda54695dbb3bfbb1aef2ef83c31","src/member-import.mjs":"23229f637aa314e5d798baf42eb32dcba56251e8dcaf0c26b9d01969756f7816","src/member-export.mjs":"bee56827d7d03d2db64102b6607136b4655b2ceb1a9a0bb3111349f8acb41bb6"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/member-record.test.mjs ] && npm test
```
