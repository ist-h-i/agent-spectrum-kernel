# Preserve the saved display preferences on first load

A user turns off compact rows in the display preferences panel, but after reloading the checkbox is on again. Turning it off during the current session works. Fix initialization so users' saved boolean choices survive the first load, using `spec/default-state.md` as the contract.

For both settings, saved booleans must win over defaults; missing or invalid saved values must use the documented defaults. Return fresh state with exactly the two boolean settings, without changing the saved object or shared defaults. Preserve the existing update/reset behavior and checkbox descriptor shape.

Change only `src/display-preferences.mjs` and `test/display-preferences.test.mjs`. Use the supplied focused regression tests and extend them if needed. Inputs are already decoded objects; no storage adapter, dependency, service or release change is requested.

Run `npm test` from this workspace and report the change and actual result.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"package.json":"9b6a95efc3b02d8c5ebee76a529caea4ec8f49e3f84d416f79acac775e0f80a9","spec/default-state.md":"f134c15818861177f67a599232da281d48df0d1725a7fae83d1d3bf71d20b450","src/display-controls.mjs":"cbb12c11a017555ac617a9577747b61679aed218a6098af13dc231c3b8b62dce"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/display-preferences.test.mjs ] && npm test
```
