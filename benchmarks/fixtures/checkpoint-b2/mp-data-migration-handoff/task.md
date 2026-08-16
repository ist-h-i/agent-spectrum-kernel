# Prepare a resumable data-migration handoff

The staged account-schema migration is paused during a mixed-version rollout. Inspect the supplied plan, compatibility matrix, operation state, approval state, verification evidence, command inventory, and rollback runbook.

Create `workspace/handoff.json` that gives the next operator an executable and truthful continuation point. It must distinguish completed work from pending checks, identify the safe next action and its owner, preserve the approval boundary, record rollback limits, and retain the evidence and open questions needed to continue.

Do not run migration or reconciliation commands, modify the supplied evidence, claim an approval or check that has not occurred, or write outside `workspace/handoff.json`.

Validate the file with:

```sh
npm run validate:handoff
```
