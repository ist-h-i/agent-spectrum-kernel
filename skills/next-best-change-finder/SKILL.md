---
name: next-best-change-finder
description: Inspect repository evidence and durable context to propose high-value next change candidates without authorizing implementation.
---

# Next Best Change Finder

## Goal

Find high-value next change candidates from repository evidence, durable context, and recent feedback.

This is candidate generation, not implementation authorization. Candidates remain hypotheses until selected by a human or clarified through `requirement-grill`.

## Use when

- The user wants to know what to improve next.
- A repo has review context, implementation context, improvement ledger, or domain rule ledger entries that may indicate high-value work.
- Recent reviews, issues, or repeated corrections suggest candidate changes.
- The goal is to reduce operational or decision burden without collapsing responsibility boundaries.

## Do not use when

- The user already selected a concrete change and wants implementation.
- The candidate has unresolved business meaning and the user asks for an executable task.
- The request is product prioritization with no repository evidence.
- The only evidence is generic code smell discovery with no user/business workflow connection.

## Process

1. Inspect evidence.
   - Repository orientation output or direct repo inspection.
   - README/docs/ADRs/schemas/tests/CI.
   - `docs/ai/review-context.md` when initialized.
   - `docs/ai/implementation-context.md` when initialized.
   - `docs/ai/improvement-ledger.md` when active.
   - `docs/ai/domain-rule-ledger.md` when active.
   - Recent review findings or issues when available.

2. Treat templates safely.
   - `template` context or ledger files are not project evidence.
   - Stale or contradicted domain rules cannot be used as confirmed value signals.
   - Missing context is an evidence gap, not a reason to invent priority.

3. Generate candidates.

```text
Change Candidate:
- Candidate:
- Evidence:
- Expected value:
- Affected user/business workflow:
- Domain rules involved:
- Risk:
- Confidence:
- What would falsify this candidate:
- Recommended next route:
  - requirement-grill
  - work-package-compiler
  - reject
  - needs human decision
```

4. Rank candidates by:
   - expected user/business value,
   - risk reduction,
   - implementation tractability,
   - evidence strength,
   - verification feasibility,
   - fit with current domain rules and project context,
   - cost of delay or recurring pain.

5. Route conservatively.
   - Default route is `requirement-grill` when business meaning is unresolved.
   - Use `work-package-compiler` only when requirements are already confirmed.
   - Do not create implementation tasks or GitHub issues unless explicitly requested.

## Output

```text
Next change candidates:
- Candidate:
- Evidence:
- Expected value:
- Affected user/business workflow:
- Domain rules involved:
- Risk:
- Confidence:
- What would falsify this candidate:
- Recommended next route:

Ranking rationale:
- ...

Not selected:
- ...
```

## Exit criteria

- Each candidate has evidence and falsification conditions.
- Business value is tied to an affected workflow or explicitly marked `Unknown`.
- Candidates are routed, not auto-authorized.
- Template/stale context is not treated as fact.

## Failure modes

| Failure | Correction |
|---|---|
| Treating repo smell as business value | Name the affected workflow or mark value as `Unknown`. |
| Producing implementation scope directly | Route through `requirement-grill` or `work-package-compiler`. |
| Ignoring falsification | Add what evidence would reject the candidate. |
| Treating templates as evidence | Mark context as missing or insufficient evidence. |
