# Summary latency regression investigation

Customers use the summary service to retrieve recent account activity. Following a release, the operations team reported slower responses and needs an evidence-backed explanation before choosing any corrective change. Investigate the reported regression using only the supplied incident contract, source, measurements, and replay checks.

Write `workspace/investigation.json` using `workspace/investigation.schema.json`. It must provide:

- An overall assessment of the reported regression and the strength of its causal basis.
- Competing explanations with their causal account, evidence state, confidence, and relevant supplied observations. Distinguish supported, weakened, falsified, and unresolved explanations without treating association as causal proof.
- One bounded non-production next check, the hypothesis it would test, its candidate or comparison subject, expected observations, safety boundary, and an explicit stop condition.

Causal accounts, proposed actions, candidate descriptions, expected signals, and stop conditions are your descriptions, not a supplied menu of accepted answers. For every citation, supply a workspace-relative path and line and copy the exact trimmed line into `source_excerpt`; an optional `workspace/` prefix is accepted. The cited statement must bear on the claimed explanation. Do not invent measurements for explanations outside the supplied evidence or infer causal proof merely because a supplied replay test passes.

Write only `workspace/investigation.json`. No production action is authorized. Run `npm run validate:investigation` from the workspace to check output structure and source references; this does not validate the investigation's conclusions.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"docs/investigation-contract.md":"8a3e33734a99a938ca7d9877cdba7a2aea6b5042973535f68bc7b036a0b34730","investigation.schema.json":"4ca6fd8849afbb6911e0b3ec4eb93fcb3a046b6d8b18bafe99c967ec77137682","observability/cache-samples.csv":"7297c1571180430aea2960bb3ba8cd0036129186b32ca47912910d46edcb9dea","observability/release-events.json":"cb5a2089e125a916aa8aa54b20aac7229bca4b7c919a483923336dcbb3be92ab","observability/request-windows.csv":"ad7bf355676756e65f2dcf083342f19c2fd9154d0ee4197afa2d22f1a34dd586","observability/runtime-profile.json":"c1d9fcfb5e07be1e3ca9fb99a82ca2013c441a7e533663f35f14001994a20e9f","package-lock.json":"97fc14e0c5101f36d9f2a2d8bab661f6035a048673095e85e24bb01174cdf249","package.json":"44957dce8f4188fce24c7a9821749452aab47dcc729ea42b37dded0f267aa1a8","scripts/replay-summary.mjs":"1b5857ac8ec3850c949f3b43c8bf10b1683ed8aeb51759a551a155326c2c9e7d","scripts/validate-investigation.mjs":"b76cc7ae34b82efcf598cbaf368b1d1ca07aa7a90d411826b6ce18fcedc576f9","src/cache-key.mjs":"9aceecf523cedd945f813818912fea2fa3a3599b8620caf0c45f058bd52eabc4","src/summary-replay.mjs":"4ab87839f3de6f809e53b485c6b19e0d82ea90ec3d5b3dc3b9da0890a10b4813","src/summary-service.mjs":"fdc8a4c6d57e67a01f1a91c7f9d5bc0c51d120562dbb02b29fc18400c45e4e62","test/integration/summary-replay.test.mjs":"be4e26456aab01bf0d74430a551e0bc2d9ff6142c843af9ae6d690347ec7f1d7","test/unit/cache-key.test.mjs":"6d00d1c70f6c595c6e3dcb7dd09ad8438c2802a3aa2ef8b32995c12a19853ce7"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm run validate:investigation
```
