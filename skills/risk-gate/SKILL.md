---
name: risk-gate
description: Gate destructive, irreversible, production-facing, credential-sensitive, or externally visible actions. Use before migrations, deploys, dependency upgrades, auth/security changes, data deletion, secret handling, global commands, or release actions.
---

# Risk Gate

## Goal

Prevent an AI agent from taking actions whose damage cannot be contained by a normal code review.

## Use when

The task may involve:
- data deletion or irreversible file operations,
- database migrations or destructive scripts,
- production deploy, publish, release, or external notifications,
- force push, history rewrite, branch deletion, or remote ref changes,
- authentication, authorization, billing, payment, email, or permission behavior,
- secrets, credentials, tokens, keys, `.env` files, or environment variables,
- dependency installation/upgrade with broad transitive impact,
- infrastructure or production configuration,
- commands that modify global machine state.

## Do not use when

- The action is purely local, reversible, and inside the requested code scope.

## Process

1. Classify the risk.

```text
Action:
Risk type:
Potential impact:
Reversibility:
External visibility:
Approval required: yes | no
```

2. Prefer a safe alternative.

Examples:
- dry run instead of execution,
- migration plan instead of migration run,
- local test environment instead of production,
- diff generation instead of applying changes,
- documented command instead of running it,
- dependency proposal instead of installation.

3. Define preconditions.
   - backup/snapshot,
   - environment confirmation,
   - rollback plan,
   - owner approval,
   - test evidence,
   - monitoring/logging plan.

4. Stop unless approval is explicit for the specific action.

5. If approved, execute only the approved action and record evidence.

## Output

```text
Risk gate:
- Action:
- Risk type:
- Potential impact:
- Reversibility:
- Safer alternative:
- Preconditions:
- Approval needed:
- Decision: proceed | needs approval | blocked | propose safer path
```

## Exit criteria

- The exact risky action is named.
- Approval requirement is explicit.
- Safer alternative is considered.
- No risky action is executed without specific approval.

## Failure modes

| Failure | Correction |
|---|---|
| Treating local terminal access as permission | Access is not approval. |
| Running “safe-looking” destructive commands | Classify impact before execution. |
| Hiding risk in implementation details | Surface the action and approval need. |
| Broad approval assumed | Approval must match the specific action. |
