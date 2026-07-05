---
description: Route and execute a scoped implementation through the AI Coding Kernel.
---

Use the installed project skills from this repository projection.

Start with `/skill-router` unless the user already named a more specific skill. For behavior changes, define a Verification Contract with `/test-first-verification`, then use `/controlled-implementation` for the edit loop.

Keep the change boundary narrow:

- classify the task and risk before editing
- read nearby repository patterns first
- state allowed and forbidden scope
- use `/risk-gate` before destructive, external, secret, production, auth, dependency, migration, billing, email, or infra-impacting actions
- verify the observable behavior before claiming completion
- use `/evidence-ledger` for correctness, readiness, safety, reliability, performance, or no-regression claims

Do not deploy, publish, release, send notifications, change secrets, or mutate production configuration from this command.

$ARGUMENTS
