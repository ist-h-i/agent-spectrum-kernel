# Correct the worker retry example

Operators use `docs/worker-retries.md` to understand how jobs are retried when no override is supplied. Its example has drifted from the service defaults in `config/retry-policy.json`, and the documentation check fails. The checked-in configuration is authoritative; the retry policy itself is not changing.

Correct only the guide's JSON example so it represents the current retry defaults. Keep one valid JSON example, preserve the surrounding explanation, and leave configuration and test code unchanged. No worker execution, service change or release step is requested.

Run `npm test` from this workspace and report the documentation change and actual verification result.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"config/retry-policy.json":"bd0186d9f96bf146211954f696a4bb51fa286e1089777971a057219dc98d9f3f","package.json":"5f52338838590b48ddf7f2c71f52c8eda54b1f70df1a06f9c98e07540b99aba8","test/worker-retries.test.mjs":"f8bcfadde1dd8298bf4a4a93e29a4299e3192f4e1b69890d066e1de9ee09e56f"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f docs/worker-retries.md ] && npm test
```
