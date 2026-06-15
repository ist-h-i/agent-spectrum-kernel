---
name: grill-with-docs
description: Stress-test a plan against existing repository language, docs, CONTEXT files, and ADRs. Use when a design must fit an established domain model or architecture.
---

# Grill With Docs

## Goal

Prevent the agent and user from inventing a parallel design language that conflicts with the existing system.

## When to use

Use when:
- The task touches domain terms, architecture, workflows, or persistence.
- There are existing docs, ADRs, or CONTEXT files.
- A plan introduces new concepts, modules, events, states, or APIs.
- The user asks whether a plan fits the existing system.

## Process

1. Inspect existing written context:
   - README
   - docs/
   - architecture docs
   - ADRs
   - CONTEXT.md or context maps
   - API docs
   - schema or domain model files

2. Build a small glossary:
   - existing canonical terms
   - overloaded terms
   - terms the user used differently
   - missing concepts

3. Challenge the plan:
   - Where does it align with existing terms?
   - Where does it conflict?
   - What concept already exists under another name?
   - What new concept truly needs a name?
   - Which ADR constrains the decision?

4. Ask one question at a time when user judgment is required.

5. Update or propose documentation only after the decision crystallizes:
   - CONTEXT.md for terminology/domain facts
   - ADR for architectural decisions and consequences
   - README/docs for operational usage

Do not create documentation just to look thorough.

## Output

```text
Doc-grounded design review:
- Existing terms:
- Conflicts:
- Proposed canonical terms:
- Relevant ADRs/docs:
- Decisions needed:
- Recommended answer:
- Documentation updates needed:
```

## Anti-rationalization

| Excuse | Rebuttal |
|---|---|
| “The new term is clearer.” | Clear to whom? Existing system language wins unless it is wrong. |
| “No ADR is needed.” | If the decision is hard to reverse or cross-cutting, record it. |
| “Docs are stale.” | Treat stale docs as a finding; do not silently ignore them. |
