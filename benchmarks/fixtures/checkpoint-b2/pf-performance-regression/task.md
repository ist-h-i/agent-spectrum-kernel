# Diagnose repeated batched event lookup slowdown

Investigate the local event lookup implementation and supplied functional and runtime evidence. Make the smallest request-scoped improvement in workspace/src/event-lookup.mjs that preserves the behavior in docs/lookup-contract.md and the reference. Verify the repeatable local runtime target across both supplied workloads and preserve the functional boundaries.

All workloads are fictional local data. They do not establish production latency, impact or occurrence frequency. Only src/event-lookup.mjs may change; preserve all other supplied files. No dependency installation or service action is required. Use the exact final validation invocation below.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"data/measurement-config.json":"39c99ef4f2862e8a3bbff704d95d96e216ea66482c977468a54d5f11df33fa94","docs/lookup-contract.md":"cfd9bdc853c8220ab187029b983557c68b28783c9c089ca6c7ab14706286107d","package.json":"5f9aaa8750bc6a5c6966526f363b3d076b38c0b5ba22d599130103d31cf8ae20","reference/scan-lookup.mjs":"a29942b5523324e7f05b5f72901e31bebfd6fdce776401970c1b51da56772eff","scripts/generate-data.mjs":"86c05e9d5a1cd67ae7984edb5f2bbdc27c34ca266653b5552fbbd1cdad68a2c3","scripts/measure-lookup.mjs":"b88d5c0ff8fadafa2ad1c16c02d2faff3a8079d94ce096dcb51b55e5d4000c3a","test/event-lookup.test.mjs":"338bcd006cc6c30bb7190053141bbc7620ff051dc3cfb18af370cef765cfdd30"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/event-lookup.test.mjs ] && npm test && npm run measure
```
