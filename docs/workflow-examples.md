# Workflow Examples

## 1. Trivial edit

User request:

```text
Change the button label from "Submit" to "Save". Do not touch unrelated files.
```

Workflow:

```text
AGENTS.md only
```

Expected behavior:

- Edit the localized file.
- Avoid refactor or formatting churn.
- Run focused verification if cheap.
- Report changed/verified/not verified.

## 2. New feature

User request:

```text
Add export-to-CSV for the task list.
```

Workflow:

```text
spec-driven-development
controlled-implementation
test-first-verification
```

Expected output before implementation:

```text
Spec summary:
- desired behavior
- non-goals
- edge cases
- acceptance criteria

Plan:
- files/modules
- tests
- verification
```

Implementation must stay inside the agreed first slice.

## 3. Bug with unknown root cause

User request:

```text
The dashboard sometimes shows stale data after refresh. Fix it.
```

Workflow:

```text
doubt-driven-development
test-first-verification
controlled-implementation
```

Expected behavior:

- Do not assume cache is the cause.
- Generate alternative hypotheses.
- Reproduce or identify evidence.
- Add regression verification where feasible.
- Downgrade claim if reproduction is unavailable.

## 4. Design review / “grill me”

User request:

```text
Grill me on this plan: move user preferences from local storage to server-side profile.
```

Workflow:

```text
grill-design
grill-with-docs
risk-gate if migration/security/external effects appear
```

Expected behavior:

- Walk the decision tree.
- Ask one gating question at a time.
- Answer from repo/docs where possible.
- Produce decision summary, non-goals, acceptance criteria, and failure modes.

## 5. PR review

User request:

```text
Review this PR and decide whether it can merge.
```

Workflow:

```text
code-review-quality
evidence-ledger
```

Expected output:

```text
Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Findings:
- [severity] file:line — issue
  Evidence:
  Impact:
  Required fix:

Evidence reviewed:
- ...

Residual risk:
- ...
```

## 6. Handoff to another agent

User request:

```text
Create the next Codex task from this state.
```

Workflow:

```text
handoff-generation
evidence-ledger
```

Expected output:

```text
Task:
Context:
Allowed scope:
Forbidden scope:
Expected output:
Verification:
Evidence to report:
Do not:
Stop and ask if:
```
