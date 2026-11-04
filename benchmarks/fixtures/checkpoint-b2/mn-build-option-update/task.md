# Release build configuration update

The server package's release build started failing after the CI image moved to Build Tool 4.2. The team still needs script maps for error reporting, without publishing map references in generated files or producing stylesheet maps. Restore a valid release configuration using `ci/release-build.log` and `docs/build-options.md`.

Change only `build.config.json`. The release profile must meet the documented option contract while the debug profile, release target and minification behavior stay unchanged. No dependency update, CI image change or release operation is requested.

From this workspace, run `npm test` and `npm run validate:build`. Report the change and the actual results of both checks; these checks validate configuration, not a compiled release artifact.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"ci/release-build.log":"897fa262a51db0844805841456332745592b3e45c8bbd5fb705c10a8c90269c9","docs/build-options.md":"de6d6845989db985b659a58f8b31f7578635e7822e474863511086f408686953","package.json":"50844c248aa736d57768a926544720b56914396bdc7b997f310897b4456aa5ed","test/build-config.test.mjs":"641fcf626c4a06509058e3d4ee49cefcd7166182f75ee26a3ab3c8d87190f6ff","scripts/validate-build-config.mjs":"884155195e0ad532a29ab1dc6122b343fea1bc6f285d54a55edd09653d447c2a"}; for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest) process.exit(41)}' && [ -f build.config.json ] && node test/build-config.test.mjs
```

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"ci/release-build.log":"897fa262a51db0844805841456332745592b3e45c8bbd5fb705c10a8c90269c9","docs/build-options.md":"de6d6845989db985b659a58f8b31f7578635e7822e474863511086f408686953","package.json":"50844c248aa736d57768a926544720b56914396bdc7b997f310897b4456aa5ed","test/build-config.test.mjs":"641fcf626c4a06509058e3d4ee49cefcd7166182f75ee26a3ab3c8d87190f6ff","scripts/validate-build-config.mjs":"884155195e0ad532a29ab1dc6122b343fea1bc6f285d54a55edd09653d447c2a"}; for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest) process.exit(41)}' && [ -f build.config.json ] && node scripts/validate-build-config.mjs
```
