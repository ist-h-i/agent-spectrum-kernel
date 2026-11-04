# Inbox filter pull request review

Support agents use an inbox list and detail pane to triage incoming messages. They switch filters while keeping useful thread history. The team needs a merge decision on a pull request that changes filtering and selection state, without disrupting which message the agent is viewing.

Review the supplied diff, state contract, implementation, and tests. Write `workspace/review.json` using `workspace/review.schema.json`. The review must provide:

- A merge recommendation grounded in the supplied state contract and evidence.
- Any material findings, with supplied paths and lines, the observable effect on inbox use, and the condition needed to resolve the risk.
- A truthful verification state that identifies checks actually run, their results, and any remaining uncertainty about the rendered state.

Judge intended behavior from the state contract rather than assuming every retained value is a defect. There is no required finding count. Local check names are in `workspace/package.json`. Evidence paths are relative to the supplied workspace, with an optional `workspace/` prefix.

Write only `workspace/review.json`. Run `npm run validate:review` from the workspace to check the output structure and source references. Do not change the reviewed source or tests; output validation does not establish a correct user interaction.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"docs/state-contract.md":"ab05bd78bb495c3c9b5aead02696f28bdb0c9241b8301915536d0605bc813333","package-lock.json":"67318586eecc2a88f2766fb5b92c04503069cb0a64af7bf9ca7068d0fa17324e","package.json":"d4f5f9db28b7b1e36e5ec077d0be8653a8744e0333f979648344ab22b47bc3ba","pr.diff":"65d7b06f14d4f57be54623d1c763faf292cfec8762d6abfe41d8f41d14d1ae74","review.schema.json":"bfdeb5af4a7e3df68fc9dd85b6c92e1cd0308c6225aa3abc0d4035a2ad6ec3b1","scripts/validate-review.mjs":"04596758f6cf4269b7681001d21bb211bee07b992c71ab759af1d9712bb9c682","src/inbox-state.mjs":"394e26cbb243520b85593676a8ad91f3e7baab1040f24c3af18f2686bc0f02b5","src/inbox-view.mjs":"d4b432b88e32ed139c9f9b69b982639b1d6889ebbb85d8e5b96acafeaddefb25","test/helpers/inbox-fixture.mjs":"7f4e7bb58e69ec68ff75d505a8219e667bcbbbcf464b1548e3f92be3dffef096","test/integration/inbox-view.test.mjs":"a1abc20ed5db8e3b0a7e8f4d428a8357c6dcd7e4ad0d7adec76955ab305baee3","test/unit/inbox-state.test.mjs":"4c95430c7a3f609a9c1b0e83c54b7f1b4da42c8979dd0c95a47897e01a79ef84"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm run validate:review
```
