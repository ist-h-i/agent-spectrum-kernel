---
name: grill-with-docs
description: Stress-test a plan against existing repository language, docs, CONTEXT files, ADRs, schemas, and domain models. Use when a design must fit an established system.
---

# Grill With Docs

## Goal

Prevent the agent and user from inventing a parallel design language that conflicts with the existing system.

## Use when

- The task touches domain terms, workflows, persistence, APIs, architecture, or states.
- Existing docs, ADRs, schemas, or context files exist.
- A plan introduces new concepts, modules, events, states, or names.
- The user asks whether a plan fits the current system.

## Do not use when

- The change is local and does not touch domain or architecture language.

## Process

1. Inspect written context.
   - README
   - docs/
   - architecture docs
   - ADRs
   - CONTEXT.md or context maps
   - API docs
   - schemas and domain model files

2. Build a small glossary.

```text
Canonical terms:
Overloaded terms:
User terms that differ from repo terms:
Missing concepts:
Stale or conflicting docs:
```

3. Challenge the plan.
   - Where does it align with existing language?
   - Where does it conflict?
   - What concept already exists under another name?
   - What new concept truly needs a name?
   - Which docs or ADRs constrain the decision?
   - Which docs would need to change if this plan is accepted?

4. Ask one question at a time only when user judgment is required.

5. Recommend the smallest doc action.
   - no doc change,
   - update existing doc,
   - add short CONTEXT note,
   - add/update/supersede ADR.

Do not create documentation just to look thorough.

## Output

```text
Doc-grounded design review:
- Relevant docs/ADRs/schemas:
- Canonical terms:
- Conflicts:
- Proposed terminology:
- Constraints from existing decisions:
- Decisions needed:
- Recommended answer:
- Documentation updates needed:
```

## Exit criteria

- The plan is either aligned with existing language or conflicts are explicit.
- New terms are justified.
- Stale docs are reported instead of ignored.
- ADR/doc updates are scoped.

## Failure modes

| Failure | Correction |
|---|---|
| Inventing clearer terminology | Existing language wins unless it is proven wrong. |
| Ignoring stale docs | Treat stale docs as a finding. |
| Writing docs before the decision is stable | Decide first, document second. |
