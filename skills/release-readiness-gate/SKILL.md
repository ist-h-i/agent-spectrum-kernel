---
name: release-readiness-gate
description: Evaluate release readiness across merged changes, migration risk, rollback, monitoring, post-release verification, customer impact, and approval evidence.
---

# Release Readiness Gate

## Goal

Decide whether a release candidate or bundled change set is ready to ship, ready only with conditions, should be deferred, must be blocked, or cannot be judged because evidence is missing.

This skill evaluates the release package. It does not deploy, publish, notify customers, run migrations, approve production changes, or replace project-specific release policy.

## Use when

- A user asks whether a release candidate is ready.
- Multiple PRs, commits, or issues are bundled into a release.
- A change set has production, deployment, migration, customer, or operational impact.
- A release needs rollback, monitoring, post-release verification, customer communication, or approval planning.
- A project wants a final readiness gate after PR review but before release action.

## Do not use when

- The user only asks for a normal PR, diff, commit, or generated-code review; use `review-router` and `review-final-merge-gate`.
- The task is a simple local implementation with no release candidate or release decision.
- There is no release candidate, change set, deployment plan, or production context to inspect.
- The requested action is destructive or externally visible and `risk-gate` has not been applied.

## Inputs

- Release candidate or change set.
- Included PRs, commits, issues, and excluded changes.
- Validation, CI, tests, and manual verification status.
- Migration, schema, data, feature flag, rollout, rollback, and recovery plans.
- Monitoring, alerting, logging, and post-release verification plan.
- Customer or user impact.
- Release notes or communication plan.
- Required approvals and ownership.
- Known residual risks and accepted risks.

## Process

1. Confirm scope.
   - Identify included PRs, commits, issues, and release artifacts.
   - Identify excluded changes that may be confused with the release.
   - If scope is unavailable, return `insufficient_evidence`.

2. Separate adjacent gates.
   - `review-final-merge-gate` decides whether a PR, diff, commit, patch, or generated output should merge.
   - `release-readiness-gate` decides whether a release package has enough evidence and operational preparation to ship.
   - `risk-gate` gates risky actions such as deploy, publish, release execution, migrations, external notifications, production config, secrets, auth, billing, email, infra, or destructive commands.
   - If the user asks to execute a risky action, stop at the readiness result and run `risk-gate` before action.

3. Check release readiness evidence.

```text
Release readiness:
- included changes are known
- blocking PR review findings are resolved or explicitly excluded
- validation, CI, tests, and manual verification are sufficient for the release scope
- migrations, schema, and data changes are safe or explicitly approved
- rollback or recovery plan exists, or absence is justified
- feature flags, staged rollout, or other release controls are defined when needed
- monitoring and alerting are adequate for expected failure modes
- post-release verification is defined
- customer or user impact is understood
- release notes or communication are adequate when needed
- ownership and approval are clear
- residual risks and accepted risks are explicit
```

4. Classify evidence.
   - Mark each readiness area as `pass`, `fail`, `skipped`, or `insufficient evidence`.
   - Treat missing required release evidence as `insufficient evidence`, not as pass.
   - Treat project-specific approval rules as authoritative when present.
   - Do not claim production safety from static package checks alone.

5. Decide.

| Decision | Use when |
|---|---|
| `ready` | Scope is known, required evidence passes, approvals are clear, and no blocking release risk remains. |
| `ready_with_conditions` | Release can proceed only after explicit listed conditions are met or accepted by the owner. |
| `defer` | Direction is sound, but more preparation, evidence, timing, or coordination is needed before release. |
| `block` | Critical correctness, security, data, migration, rollback, customer-impact, approval, or operational risk exists. |
| `insufficient_evidence` | The release cannot be judged because required scope, validation, operational, or approval evidence is missing. |

6. Keep action separate from decision.
   - Do not run deploys, migrations, notifications, publishing, or release commands.
   - If the next step is a risky action, name the exact action and route to `risk-gate`.

## Output

```text
Release readiness decision:
- ready | ready_with_conditions | defer | block | insufficient_evidence

Release scope:
- Included PRs / commits / issues:
- Excluded changes:

Readiness summary:
- Validation:
- Migration / data:
- Rollback:
- Feature flags / rollout:
- Monitoring:
- Post-release verification:
- Customer impact:
- Communication:
- Approval:

Required before release:
- ...

Conditions / follow-up:
- ...

Residual risks:
- ...

Evidence reviewed:
- ...

Risk gate:
- Required before action: yes | no
- Risky action, if any:
```

## Exit criteria

- Release scope is explicit or the decision is `insufficient_evidence`.
- The decision is one of `ready`, `ready_with_conditions`, `defer`, `block`, or `insufficient_evidence`.
- Rollback, monitoring, post-release verification, customer impact, communication, approval, and residual risks are addressed.
- PR merge readiness, release readiness, and risky action approval are not conflated.
- No deployment, migration, external notification, publish, or release action is performed by this skill.

## Failure modes

| Failure | Correction |
|---|---|
| Treating a merged PR as release-ready | Evaluate release package scope, validation, rollback, monitoring, customer impact, and approvals. |
| Replacing PR review with release readiness | Route PR-level review through `review-router` and `review-final-merge-gate`. |
| Treating readiness as permission to deploy | Route the exact external or production action through `risk-gate`. |
| Claiming production safety without project evidence | Downgrade to `insufficient_evidence` and name the missing evidence. |
| Hiding residual risks in a pass decision | List accepted risks and owner approval explicitly, or use `ready_with_conditions`, `defer`, or `block`. |
