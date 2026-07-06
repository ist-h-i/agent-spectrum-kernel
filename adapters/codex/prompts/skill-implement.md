---
description: Route and execute a scoped implementation through the Agent Spectrum Kernel in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Start with `operating-mode-router` when the operating layer is unclear, then use `skill-router` for delivery/quality routing unless the user explicitly names a specific relevant skill.

For new behavior or cross-file work:

1. Use `spec-driven-development` to define the smallest testable scope.
2. Use `test-first-verification` to define the Verification Contract before behavior changes.
3. Use `controlled-implementation` for the edit loop.
4. Use `evidence-ledger` before final claims about correctness, readiness, reliability, safety, performance, or no regression.

Keep the change boundary narrow:

- read nearby repository patterns before editing
- state allowed and forbidden scope
- preserve public contracts unless the task explicitly changes them
- keep cleanup separate from behavior change
- use `risk-gate` before destructive, external, secret, production, auth, dependency, migration, billing, email, telemetry, or infra-impacting actions
- verify observable behavior before claiming completion

Do not deploy, publish, release, send notifications, change secrets, or mutate production configuration from this prompt.

Final output:

```text
Changed:
- ...

Verified:
- ...

Not verified:
- ...

Risks / assumptions:
- ...

Next:
- ...
```

$ARGUMENTS
