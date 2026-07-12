---
name: work-package-compiler
description: Convert confirmed Requirement, Spec, or design artifacts into an agent-ready Work Package with executable scope, dependencies, stop conditions, and evidence expectations.
---

# Work Package Compiler

## Goal

Convert confirmed upstream contracts into an agent-ready Work Package without replaying their rationale or behavior prose.

This is a transformation skill. It does not make business decisions and must route back to `requirement-grill` when required decisions are unresolved.

## Use when

- A Requirement Contract is available and business decisions are sufficiently resolved.
- A human wants an executable task for another agent or future session.
- Scope, non-goals, verification, risk gates, and review gates need to be packaged together.
- Domain rules from `docs/ai/domain-rule-ledger.md` should be applied as constraints.

## Do not use when

- User intent, desired outcome, or business decision boundary is still unclear.
- The task needs technical design stress testing before it can be safely implemented.
- The user asked for implementation now and no packaging handoff is needed.
- The package would hide risk gates or unresolved decisions inside a prompt.

## Process

1. Read `docs/lifecycle-artifact-contract.md` and verify inputs.
   - Requirement Contract from `requirement-grill` or equivalent approved spec.
   - Relevant repo facts and project overlay.
   - Domain rules from `docs/ai/domain-rule-ledger.md` when present.
   - Review/implementation context when present.
   - Engineering pattern, verification pattern, and architecture decision memory ledgers when present and relevant.
   - Verification policy and commands when available.

2. Check blockers before compiling.
   - If `Open blockers` include unresolved business decisions, route to `requirement-grill`.
   - If technical design choices are unresolved, route to `grill-design`.
   - If risk gates require approval, expose them; do not bury them in the agent prompt.

3. Keep evidence status visible.
   - Mark target files/modules as `Verified`, `Supported`, `Hypothesis`, or `Unknown`.
   - Do not invent target files when repo evidence is missing.
   - Use `Human-confirmed` and `Verified` domain rules as constraints.
   - Use `Supported` domain rules as cautions.
   - Use `Hypothesis` domain rules only as questions or warnings.
   - Use `Verified` and `Human-confirmed` engineering, verification, and architecture memory entries only when their scope matches the Work Package.
   - Treat `template`, stale, archived, missing, or hypothesis ledger entries as insufficient evidence for constraints.

4. Produce a Work Package that owns only the executable change boundary.

```text
Work Package:
- Artifact ID:
- Artifact type: work_package
- Upstream refs:
- Allowed scope:
- Forbidden scope:
- Ordered implementation tasks:
- Dependencies:
- Stop conditions:
- Expected implementation and verification evidence:

Conditional fields, omit when irrelevant:
- Likely files/modules with evidence status:
- Required review or risk gates:
- Applicable memory or rule IDs:
- Deltas to upstream scope or acceptance conditions:
```

5. Confirm execution readiness.
   - The package is executable only when `Open blockers` has no unresolved business decisions.
   - Required review gates must include `review-domain-impact` when domain rules or business behavior are involved.
   - The user-facing next action must be a work action, not only the name of the next skill.

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md` for route, evidence, stop reason, and next action. This skill emits the Work Package below; it does not repeat the envelope fields.

```text
Work Package:
- Artifact ID:
- Artifact type: work_package
- Upstream refs:
- Allowed scope:
- Forbidden scope:
- Ordered implementation tasks:
- Dependencies:
- Stop conditions:
- Expected implementation and verification evidence:

Conditional fields, omit when irrelevant:
- Likely files/modules with evidence status:
- Required review or risk gates:
- Applicable memory or rule IDs:
- Deltas: target ref / field / previous / new / reason / decision evidence:

Route:
- executable | requirement-grill | grill-design | needs human decision
```

## Exit criteria

- The Work Package is independently executable or explicitly blocked.
- Business assumptions are not converted into implementation scope.
- Verification and review gates are named.
- Domain rules are applied according to evidence status.
- The reviewer can tell what must not be touched.
- Requirement and Spec content is inherited by reference instead of copied.

## Failure modes

| Failure | Correction |
|---|---|
| Making the business decision during packaging | Route back to `requirement-grill`. |
| Hiding risk gates in the prompt | List them in `Risk gates`. |
| Inventing target files | Mark scope as `Hypothesis` or `Unknown`. |
| Skipping domain review | Add `review-domain-impact` when business behavior or domain rules are involved. |
