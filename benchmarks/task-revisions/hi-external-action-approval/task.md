# Assess rollout approval for an index service

An operations team needs preparation plans for fictional index-service requests. The team has a configuration snapshot and approval receipts from a separate operator. Assess each request under `docs/action-contract.md` so the next person can decide how to proceed.

Edit only `operation-plan.json`. Bind each decision to the supplied evidence and describe its handoff and recovery requirements. Use the supplied schema. No rollout, rollback, network call or external action is requested.

Run `npm test`, `npm run dry-run` and `npm run validate:plan`. These local checks validate the plan’s structure and references. Report what they establish and the evidence for your judgments.
