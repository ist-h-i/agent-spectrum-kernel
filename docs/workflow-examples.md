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
test-first-verification for reproduction
controlled-implementation
test-first-verification for regression proof
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

## 5. Application boundary decision

User request:

```text
This feature fetches account settings, updates local workflow state, and maps API errors. Decide where the facade/usecase/repository/mapper boundaries should live.
```

Workflow:

```text
application-boundary-architecture
adr-review if hard-to-reverse or record-worthy
grill-with-docs if docs/domain/ADR terms matter
```

Expected behavior:

- Inspect touched files, direct imports, nearby tests, public APIs, data access patterns, and error handling.
- Decide the smallest boundary that separates ownership, side effects, DTO/error trust boundaries, and async lifetime.
- Avoid adding pass-through layers that name no real policy.
- Report boundary decision, violations, smallest compatible change, and verification.

## 6. PR review

User request:

```text
Review this PR and decide whether it can merge.
```

Workflow:

```text
review-router
layer applicability
required gates, including review-architecture-impact when architecture impact may exist
review-final-merge-gate
```

Expected output:

```text
Layer applicability:
- Domain:
  status: required | skipped | insufficient evidence
  reason:
  gate:
- Architecture:
  status: required | skipped | insufficient evidence
  reason:
  gate:
- ...

Review route:
- required gates
- skipped gates

Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Layer summary:
- Domain: pass | fail | skipped | insufficient evidence - evidence/reason
- Architecture: pass | fail | skipped | insufficient evidence - evidence/reason
- Design: pass | fail | skipped | insufficient evidence - evidence/reason
- Logic: pass | fail | skipped | insufficient evidence - evidence/reason
- Output quality: pass | fail | skipped | insufficient evidence - evidence/reason
- Test / verification: pass | fail | skipped | insufficient evidence - evidence/reason
- Style / maintainability: pass | fail | skipped | insufficient evidence - evidence/reason
- Mechanical: pass | fail | skipped | insufficient evidence - evidence/reason
- Adversarial risk: pass | fail | skipped | insufficient evidence - evidence/reason
- Risk: pass | fail | skipped | insufficient evidence - evidence/reason
- Evidence: pass | fail | skipped | insufficient evidence - evidence/reason

Required fixes:
- [severity] file:line — issue, evidence, required fix

Suggestions:
- ...

Evidence reviewed:
- ...

Residual risk:
- ...
```

## 7. Handoff to another agent

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

## 8. MR/PR README generation

User request:

```text
Create a PR README that explains this change for human review and future AI reuse.
```

Workflow:

```text
mr-readme-generation
adr-review if hard-to-reverse architecture decisions appear
review-router only if a merge decision is requested
```

Expected output:

```text
MR/PR README:
- Path: docs/pr/<branch-or-pr>.md
- Created or updated: created
- Evidence reviewed: diff, changed files, issue/PR description, nearby docs/tests
- Evidence gaps: ...
- ADR status: none | new ADR candidate | existing ADR update candidate
- Review decision emitted: no
- Follow-up skills: ...
```
