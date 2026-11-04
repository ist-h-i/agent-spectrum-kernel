# Prepare a resumable data-migration handoff

The account platform is moving profile data to a new representation while deployed clients still use different schema versions. A paused backfill is being handed to the next operator. The handoff must preserve customer data and make it possible to continue without mistaking pending work for completed work or bypassing the rollout owner.

Use the supplied migration plan, compatibility matrix, operation and approval state, verification evidence, command inventory, and rollback runbook. Create `workspace/handoff.json` using `workspace/handoff.schema.json`. It must give the next operator:

- The actual phase, durable progress, traffic state, and conditions preventing continuation.
- An actionable next command from the supplied catalog, its mode and owner, and the evidence required to use it. Catalog IDs identify operator capabilities; the deliverable is not a runnable script.
- The conditions and role required before writes may resume, supported containment and rollback limits, and data that must be preserved.
- The state of every declared verification, evidence references, stop conditions, and unresolved questions needed for the next shift.

Include each verification ID from `workspace/state/handoff-policy.json` exactly once; order does not matter. Use supplied identifiers for commands, roles, verifications, evidence, and catalogued rollback actions. Continuation evidence references may name a supplied evidence ID or workspace-relative source path. Other condition labels may be chosen locally but must describe the supplied facts. Do not invent checks, approvals, evidence freshness limits, or resolved questions.

Do not run migration or reconciliation commands, modify the supplied evidence, claim an approval or check that has not occurred, or write outside `workspace/handoff.json`.

Validate the file structure and verification inventory from the workspace with:

```sh
npm run validate:handoff
```

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"docs/migration-plan.md":"0b23607d92c19e2be53aaf7d84e42325dce337bafb2fc1e67150a5ac103d3600","docs/rollback-runbook.md":"4cb069492547eed44e905718a3ff16c4e551fe08d6cc2e9cb9b9e06c930bd868","evidence/batch-42-verification.json":"3e72bfd2e6b0b1eec95c694d52789b2fae567bc84d4d215611f8ee8ec75558f5","handoff.schema.json":"3c7d9bf4de2ca655278c189bef7221c479336ad7db9fc86608029efb6d1022cf","operations/commands.json":"33c43ca1ec45f8c5f18e11e0e53ea30e1e95c1187e73275a641145e674a39af8","package-lock.json":"fb8961ce1a75139ebe444e732928f72b201f0d60bc773597f07d5fa6eb4c6097","package.json":"233184e58c48121ae9ff3b62f9975ff6fd8868650278692f9998a043497669d7","scripts/validate-handoff.mjs":"c1da3b49de4b21720ced6f7de2bf88fd18e5e5167fd8b0694420bd312e10d209","state/approval-state.json":"5e12d5a62c2bb5ccaa61da5b39e277e6c74588e3907fc19644ae3117d3908707","state/compatibility-matrix.json":"e8dbdc3c1677e0713d8a1203e25ab61e9bc25d8e09454075f882410ddedeebde","state/handoff-policy.json":"2af601848e25d17308c948184620b3d2a168bf14d9a4253e881e8639d63f1cbe","state/operation-state.json":"b14cae8b9327736e01f7f34557656fdb922d45eaf66379bbc4e71e47439cee6d"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && npm run validate:handoff
```
