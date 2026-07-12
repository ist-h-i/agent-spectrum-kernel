# Example: New feature

## Request

```text
Add CSV export for the task list.
```

## Workflow

Use:

```text
spec-driven-development → work-package-compiler when packaging is needed → test-first-verification for a reusable Verification Contract → controlled-implementation → test-first-verification for evidence
```

## Expected first response

```text
Spec SPEC-CSV:
- Upstream refs: REQ-CSV when present
- Observable behavior delta:
- Acceptance criteria:

Work Package WP-CSV:
- Upstream refs: SPEC-CSV
- Allowed scope:
- Forbidden scope:
- Ordered implementation tasks:
- Dependencies:
- Stop conditions:
- Expected evidence:

Verification Contract VER-CSV:
- Upstream refs: SPEC-CSV, WP-CSV
- Behavior proof obligations:
- Focused checks:
- Required evidence:
- Insufficient-evidence conditions:
- Completion evidence:

Implementation Contract IMPL-CSV:
- Upstream refs: WP-CSV, VER-CSV
- Change class:
- Implementation-only decisions:
- Actual change boundary:
- Verification attempted:
- Evidence references:
- Remaining limitations:
- Handoff state:
```

Do not copy unchanged business context, acceptance criteria, scope, or proof obligations into downstream artifacts. Reference their IDs; use an explicit delta when a value changes.
