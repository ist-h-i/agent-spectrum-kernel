---
name: skill-router
description: Select the minimal relevant engineering skill workflow for a coding-agent task. Use for non-trivial, ambiguous, multi-step, design, review, investigation, or handoff requests.
---

# Skill Router

## Goal

Route the task to the smallest sufficient workflow. Do not load or perform every skill.

## Process

1. Classify the task:
   - trivial edit
   - implementation
   - design
   - investigation
   - review
   - handoff
   - architecture decision
   - long-running/multi-step task

2. Check risk:
   - user-visible behavior
   - public API or data model
   - security, privacy, performance, reliability
   - cross-module change
   - irreversible migration
   - unclear requirements
   - weak or missing tests

3. Select skills:
   - Trivial edit: no skill unless verification is needed.
   - Unfamiliar repo: `repository-orientation`.
   - Plan/design: `grill-design`.
   - Plan/design constrained by docs/domain/ADR: `grill-with-docs`.
   - New feature: `spec-driven-development`, then `test-first-verification`.
   - Multi-session work: `planning-with-files`.
   - Scope creep risk: `scope-control`.
   - Bug/investigation: `doubt-driven-development`, then `test-first-verification`.
   - Architecture decision: `adr-review`.
   - Review: `code-review-quality`, optionally `evidence-ledger`.
   - Claim validation: `evidence-ledger`.
   - End of work: `handoff-generation`.

4. State the selected workflow briefly:
   - selected skill(s)
   - why they apply
   - what is intentionally skipped

5. Continue into the first selected skill.

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “I should run every skill to be safe.” | Overloading context reduces quality. Use the smallest sufficient workflow. |
| “This is probably simple.” | Check risk, not vibes. A small change can affect public behavior. |
| “The user did not ask for a process.” | The process is only used when it reduces risk. Do not expose unnecessary ceremony. |
| “I can decide later.” | Routing is cheap; late process correction is expensive. |

## Output

```text
Selected workflow:
- Primary: ...
- Secondary: ...
- Skipped: ...
Reason:
- ...
```
