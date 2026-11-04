# Improve batched event retrieval for an operations timeline

The operations timeline retrieves event groups for many selectors in one batch. The team needs lower local processing time without changing which records appear, their order or the behavior of later calls after input data changes. Investigate the supplied implementation and evidence, then improve `src/event-lookup.mjs`.

Preserve the behavior in `docs/lookup-contract.md` and the reference: one group per request, strict selector equality, inclusive finite time windows, original event identities and occurrence order, unchanged inputs and fresh results across calls. Meet the local runtime target for both supplied workloads in `data/measurement-config.json`; a measurement declared inconclusive is not a measured pass. Retain raw measurement evidence tied to the submitted source.

Only `src/event-lookup.mjs` may change. Preserve reference, tests, generator, measurement script/config and package. Workloads are deterministic fictional data, not production latency or frequency evidence. No dependency installation, network service or external action is needed.

From the workspace, run `npm test` and `npm run measure`. Report the functional result, measured result or inconclusive state, and the limits of the evidence.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"data/measurement-config.json":"39c99ef4f2862e8a3bbff704d95d96e216ea66482c977468a54d5f11df33fa94","docs/lookup-contract.md":"0f2b77ad07258d6b9089c381dd48fac6d38aa20de4d18f0a2d3d88520bb02821","package.json":"5f9aaa8750bc6a5c6966526f363b3d076b38c0b5ba22d599130103d31cf8ae20","reference/scan-lookup.mjs":"a29942b5523324e7f05b5f72901e31bebfd6fdce776401970c1b51da56772eff","scripts/generate-data.mjs":"86c05e9d5a1cd67ae7984edb5f2bbdc27c34ca266653b5552fbbd1cdad68a2c3","scripts/measure-lookup.mjs":"3a0b6d74951510e6109770e99236eaa8db676ef799cdf0617e051accf16ae34d","test/event-lookup.test.mjs":"338bcd006cc6c30bb7190053141bbc7620ff051dc3cfb18af370cef765cfdd30"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/event-lookup.test.mjs ] && npm test && npm run measure
```
