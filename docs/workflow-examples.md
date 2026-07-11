# Agent Spectrum Kernel Workflow Examples

## 0. Natural work request routing

User request:

```text
このチケットを進めて
```

Workflow:

```text
operating-mode-router when the operating layer is unclear
skill-router for delivery/quality work
then the smallest selected workflow
```

Expected output shape:

Execution Envelope:
```json
{
  "schema_version": "1.0.0",
  "route": { "work_mode": "要件確認", "operating_mode": "delivery_quality", "user_facing": "既存要件とrepo根拠を確認する", "internal": { "primary": "requirement-grill", "secondary": ["domain-rule-ledger"], "next_if_resolved": "work-package-compiler" } },
  "evidence_status": { "checked": ["issue body", "relevant README/docs"], "missing": ["business decision"] },
  "stop_reason": { "status": "human_decision", "details": ["unresolved human-owned business decision remains"], "human_decision_required": ["business outcome"], "stop_if": ["business decision remains unresolved"] },
  "next_action": "stop for human decision or proceed to implementation packaging"
}
```

Expected behavior:

- Do not require the user to name `requirement-grill`, `work-package-compiler`, or any other skill.
- Keep the internal route explicit for review and debugging.
- Do not auto-run the whole chain when a human-owned decision remains.

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
test-first-verification for Verification Contract
controlled-implementation
test-first-verification for evidence
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

Implementation Contract:
- allowed/forbidden scope
- public/data impact
- implementation context
- stack overlay used
- verification contract
- stop conditions

Verification Contract:
- behavior to prove
- existing coverage
- focused test or runtime check
- commands and required evidence
- remaining unverified items
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
test-first-verification for reproduction and Verification Contract
controlled-implementation
test-first-verification for regression proof
```

Expected behavior:

- Do not assume cache is the cause.
- Generate alternative hypotheses.
- Reproduce or identify evidence.
- Add regression verification where feasible.
- Downgrade claim if reproduction is unavailable.

## 4. Requirement-to-Rule Loop

User request:

```text
Find the next change that would reduce manual business decision work without collapsing responsibility boundaries.
```

Workflow:

```text
next-best-change-finder
requirement-grill
work-package-compiler only after required business decisions are resolved
review-domain-impact during review
review-to-rule-compiler after review when rule candidates appear
domain-rule-ledger only for explicitly accepted durable rule updates
```

Expected behavior:

- Rank candidates by evidence, value, risk reduction, tractability, and verification feasibility.
- Treat candidates as hypotheses until selected or clarified.
- Produce a Requirement Contract before compiling an agent task.
- Refuse to convert unresolved business decisions into implementation scope.
- Use confirmed or verified domain rules as constraints; use hypothesis rules only for questions.

## 5. Design review / “grill me”

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

## 6. Application boundary decision

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

## 7. PR review

User request:

```text
Review this PR and decide whether it can merge.
```

Workflow:

```text
review-router
layer applicability
required gates, including review-architecture-impact, review-output-quality, and review-adversarial-risk when applicable
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

## 8. Handoff to another agent

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

## 9. Full-layer reusable intelligence extraction

User request:

```text
This review found the same missing permission-denial test again. Turn the reusable lesson into the right durable place without hiding the current PR blocker.
```

Workflow:

```text
review-router keeps the blocker in the current PR review
review-finding-compiler
verification-pattern-ledger when the reusable lesson is evidence expectation
improvement-ledger only when follow-up work needs tracking
```

Expected behavior:

- Keep current PR blockers in the review output.
- Classify evidence status and repeat pattern.
- Route domain/business rules to `review-to-rule-compiler`.
- Route implementation shape to `engineering-pattern-ledger`.
- Route verification expectation to `verification-pattern-ledger`.
- Record false-positive risk and suppression rules.
- Do not enforce hypothesis entries.

## 10. Engineering capability evaluation

User request:

```text
Evaluate whether this project has reusable engineering intelligence for verification and review.
```

Workflow:

```text
operating-mode-router -> observability_metrics -> engineering-capability-evaluation
```

Expected behavior:

- Score capability only from evidence-backed assets and outcomes.
- Separate breadth, reliability, autonomy, evidence quality, and human dependency.
- Keep `Unknown`, stale, contradicted, and insufficient-evidence areas visible.
- Do not claim human-equivalent capability or replace task-level verification/review gates.

## 11. MR/PR README generation

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

## 12. Angular stack implementation overlay

User request:

```text
Implement this Angular routed form. Use the Angular overlay only for Angular-specific constraints.
```

Workflow:

```text
spec-driven-development or controlled-implementation as selected by skill-router
angular-implementation-architecture as stack overlay
test-first-verification for Angular verification supplement
```

Expected overlay output:

```text
Angular implementation overlay:
- Angular surface: routed page, form, provider, template
- Existing Angular pattern: ...
- State owner: ...
- Provider / DI scope: ...
- Async lifecycle: ...
- Template / form impact: ...
- DOM / security impact: ...
- SSR / hydration impact: ...
- Constraints for controlled-implementation: ...
- Verification supplement for test-first-verification: ...
- Stop conditions: ...
- Evidence: ...
```

## 13. Implementation context generation

User request:

```text
Create reusable implementation context for this repository so future feature work does not rediscover stack commands and conventions.
```

Workflow:

```text
implementation-context-generation
repository-orientation for repo facts before drafting context
```

Expected output:

```text
Implementation context generation:
- Path: docs/ai/implementation-context.md
- Created or updated: created | updated
- Stack inventory: ...
- Commands found: ...
- Implementation patterns found: ...
- Test patterns found: ...
- Boundary rules found: ...
- Hypotheses needing confirmation: ...
- Unknowns: ...
- Stack overlays detected: ...
- Stop conditions: ...
- Update triggers: ...
```
