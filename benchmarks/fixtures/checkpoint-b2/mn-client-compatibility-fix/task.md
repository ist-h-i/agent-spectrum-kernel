# Restore preference reads on older mobile clients

The desktop application and embedded mobile clients share a saved-preference reader. Preference reads work in the current client but throw on supported older mobile clients, preventing those clients from restoring users' settings. Restore compatibility using `docs/client-support.md` and `docs/preferences.md`.

The reader must preserve the documented distinction between an own saved value and an absent or inherited field, including the supported record shapes, value types and getter behavior. Keep its exported API unchanged and do not mutate records, prototypes or runtime globals. Change only `src/preferences.mjs` and its regression tests in `test/preferences.test.mjs`.

Run `npm test` from this workspace and report the actual result and the behavior covered. The supplied checks simulate a missing runtime capability locally; no emulator download, global polyfill, release or remote service operation is requested.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"package.json":"3d1760b64967b2e6a2b8f66a73eaaccd74b8db66e4a7c58a84054261f512eee8","docs/preferences.md":"4688c1eb8e4e910c7e34cda0a07eda1d56592c34fdb342fe34893cdd19765550","docs/client-support.md":"39a117913827b19df615dc89f4af4a74f84f10d95e27fb92103aaf8efc49d87c"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/preferences.test.mjs ] && npm test
```
