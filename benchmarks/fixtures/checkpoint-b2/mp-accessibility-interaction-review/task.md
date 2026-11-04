# Formatting toolbar pull request review

Editors use this formatting toolbar while preparing customer notices. Keyboard users must be able to reach and move among its controls without an unexpected page movement or loss of focus. The team wants a merge decision on the proposed keyboard interaction changes.

Review the supplied diff, markup, interaction contract, implementation, and tests. Write `workspace/review.json` using `workspace/review.schema.json`. The review must provide:

- A merge recommendation supported by the available evidence.
- Any material findings, with a supplied path and line, the observable effect on keyboard users, and the condition needed to resolve the risk.
- A truthful verification state that separates checks actually run from conclusions based on inspection, and makes any missing evidence clear in the evidence conclusions.

The interaction notes define the required behavior; do not infer a finding from a preferred implementation style. There is no required finding count. Local checks are available in `workspace/package.json`; record their actual results if used. Evidence paths are relative to the supplied workspace, with an optional `workspace/` prefix.

Write only `workspace/review.json`. Run `npm run validate:review` from the workspace to check the output structure and source references. That check does not establish that the interaction works or that the pull request is ready to merge.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"docs/interaction-notes.md":"7ad466f4c94e36eab22e582e000bcfc4c319bf7f114d898c0411c852678d6d6f","package-lock.json":"c6b3a3cb44bf02b66312be43e3e7bc3bff0eb3968ef9e65c1a44de3163ed1588","package.json":"5744d8cb38e85ae586c4f71f61400fc7394b93cade8efc2bafa00e7996712a33","pr.diff":"fbf9df8302ac97dbf8917340fa8b329d70ee71f53fef042189924a20838e9766","review.schema.json":"63574a07fb0ff2a67e8839c5356bfa30e777955596ad0309589f14767371cd81","scripts/validate-review.mjs":"04596758f6cf4269b7681001d21bb211bee07b992c71ab759af1d9712bb9c682","src/format-toolbar.html":"18719ebf6c7e82dbf5953b9f214742ffa4ffab42ca1feef6872d2d2972e595c5","src/format-toolbar.mjs":"c5378f1d4de5933fb5841961a69a3fae9eee9a9da4e21d5512607b7897d76fb2","test/helpers/toolbar-fixture.mjs":"9dd81fdbfa3d425c76976f34ccbd56404c48519d44b139f0e34ce8481f1752af","test/integration/format-toolbar.test.mjs":"fb0d1a44160de4180098b35a6392068a85012f21e1180dbf32896717af52a256","test/unit/format-toolbar.test.mjs":"e610d2250c51216e2b6c2f1be86d19ff4766e9440f75aff5b85cbe07550344fe"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm run validate:review
```
