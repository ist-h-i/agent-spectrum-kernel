# Preserve the saved display preferences on first load

A user turns off compact rows, but after reloading the display preferences panel the checkbox is on again. Turning it off during the current session works. Please fix this local default-state problem and verify the change with the supplied focused regression tests. Extend those tests if more coverage is needed.

Read `spec/default-state.md` and the nearby implementation/tests. Keep the existing update/reset behavior and control output shape. Make a small change to the preference initializer and its tests, then run `npm test` from this workspace. No dependencies, service changes or release steps are needed.

Run the following command from this workspace. It first checks the fixed project files and then runs `npm test`.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"package.json":"9b6a95efc3b02d8c5ebee76a529caea4ec8f49e3f84d416f79acac775e0f80a9","spec/default-state.md":"f134c15818861177f67a599232da281d48df0d1725a7fae83d1d3bf71d20b450","src/display-controls.mjs":"cbb12c11a017555ac617a9577747b61679aed218a6098af13dc231c3b8b62dce"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/display-preferences.test.mjs ] && npm test
```
