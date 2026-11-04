# Investigate inconsistent storefront build results

A release coordinator needs a defensible explanation for inconsistent cached build outcomes before choosing a CI change. The supplied configuration, history and local model describe the storefront's artifact-build boundary. Determine what these observations establish, compare a plausible competing explanation, and recommend a bounded intervention that accounts for both build correctness and useful cache reuse.

Create only `investigation.json`, following `investigation.schema.json` and `docs/investigation-contract.md`. Include executed experiment options and complete observations, an evidence-linked causal comparison, a competing explanation with its limits, predicted observations for the recommendation, and justified confidence. Distinguish a modeled result from an observation of a real CI service; do not infer incident frequency from these cases.

Preserve every supplied workspace file. The history and model are fictional deterministic local fixtures. No CI configuration change, deployment, installation or service call is requested. The reproducer's supported options are documented in the investigation contract; select experiments that support your claims.

From the workspace, run `npm test`, the local reproducer as needed, and `npm run validate-report` after writing the report. Record what was actually run. Public checks validate tool/report structure; they do not certify the causal explanation.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"ci/build-config.json":"dea1af75bc003425d77b45f3375602e9bde3e811d3aa9ed601ef5d935d03b942","ci/build-history.log":"4288f4f83a1c905ce14aa3dc93a64a4e6620373d904e6b3512d84da67e30f271","ci/scenarios.json":"b16010300c28f0bf0dd0e083e2c032b1c855e553117d741cf7ba74b39d30829d","docs/investigation-contract.md":"ba8b371bddb2e52e773438dc18c3de295fd01f56852252de9137df3820254f11","investigation.schema.json":"23b2da0e485d964192af7f1b3fc738234f78d1fd59db1577d55ea28d1aace03b","package.json":"10537ac134a2957fecb7b30753992caeacd2d76e16de3810b960df6610b890b2","scripts/reproduce-cache.mjs":"2efab731082f3adf6f086580c29d87427cfdc9d000ce18ac328773fec083a75b","scripts/validate-report.mjs":"97d3a9238a8061e866f91ce14c3c8256968dea9db5b1bac0da460dc6d4a4fca8","src/cache-model.mjs":"3a73cfed43492a3f40e51f59e5d8ed0c4d9c25465019ef4674ae807afce56d86","test/cache-observation.test.mjs":"85a00bcd43efcb002d7874c1106b556232a07550e762684252f4ce7e9e89c71f","test/report-structure.test.mjs":"d7daf7abc069f718a7ace0f1b947fd7674130d1b5e582dc5588cfd9609d8aef5"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm test && npm run validate-report
```
