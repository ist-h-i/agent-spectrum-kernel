---
description: Investigate a bug, regression, performance issue, or unknown root cause in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Start with `operating-mode-router` when the operating layer is unclear, then use `skill-router`. For bug, regression, performance, reliability, or unknown-root-cause work, use `doubt-driven-development`.

Investigation requirements:

- reproduce or falsify the reported behavior when feasible
- define a Verification Contract with `test-first-verification` before or alongside the fix path
- separate Verified, Supported, Hypothesis, Unknown, and Falsified statements
- inspect relevant repo code, tests, docs, scripts, and logs before changing behavior
- keep cleanup separate from the root-cause fix unless required
- stop for `risk-gate` before destructive, external, production, auth, secret, dependency, migration, billing, email, telemetry, or infra-impacting actions

If a fix is in scope, use `controlled-implementation` and verify the regression proof. End with evidence, remaining unknowns, and the next narrow verification step.

Do not include raw prompts, secrets, customer data, personal data, full command output, or full file contents.

$ARGUMENTS
