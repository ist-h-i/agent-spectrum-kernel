---
name: spec-driven-development
description: Define the observable behavior delta and acceptance criteria for a feature or behavior request without recreating upstream business decisions or downstream execution plans.
---

# Spec-Driven Development

## Goal

Turn a stable Requirement Contract or behavior request into an observable behavior delta before work packaging or implementation.

## Use when

- The request changes user-visible or caller-visible behavior.
- The implementation touches multiple files/modules.
- Acceptance criteria are missing.
- Edge cases are unclear.
- Migration, compatibility, or rollout may matter.

## Do not use when

- The task is a trivial localized edit.
- A current Spec already exists and its acceptance criteria remain unchanged.

## Process

1. Read `docs/lifecycle-artifact-contract.md` and inspect the current behavior plus any upstream Requirement or design artifact. If acceptance or behavior must be mapped to a later claim, use `docs/lifecycle-traceability-contract.md` and assign stable item IDs without copying upstream content.

2. Draft the Spec at the smallest useful fidelity.

```text
Spec:
- Artifact ID:
- Artifact type: spec
- Upstream refs:
- Observable behavior delta:
- Acceptance criteria:

Conditional fields, omit when irrelevant:
- Trace behavior / acceptance IDs:
- Inputs / outputs:
- State changes:
- Error / edge cases:
- Compatibility constraints:
- Observable security, privacy, or performance constraints:
- Deltas to upstream assumptions or acceptance conditions:
```

3. Validate the Spec.
   - Are acceptance criteria observable?
   - Are edge cases represented?
   - Is there a smallest deliverable slice?
   - What would falsify success?
   - Which assumptions are still unresolved?
   - Does every changed upstream assumption or acceptance condition have an explicit delta?
   - Does every Requirement-owned delta have authoritative decision evidence?

4. Route executable scope to `work-package-compiler` and proof obligations to `test-first-verification`. Do not embed their fields in the Spec.

5. Stop before implementation if behavior or acceptance criteria remain unresolved.
   - Present the next action in work terms. Use skill names only in the internal route or advanced/debug notes.

## Output

Use the shared `Execution Envelope` from `docs/execution-envelope-contract.md` for route, evidence, stop reason, and next action. This skill emits the spec artifact below; it does not repeat the envelope fields.

```text
Spec:
- Artifact ID:
- Artifact type: spec
- Upstream refs:
- Observable behavior delta:
- Acceptance criteria:

Conditional fields, omit when irrelevant:
- Trace behavior / acceptance IDs:
- Inputs / outputs:
- State changes:
- Error / edge cases:
- Compatibility constraints:
- Observable constraints:
- Deltas: target ref / field / previous / new / reason / decision evidence:
```

## Exit criteria

- Acceptance criteria are testable.
- Observable behavior is separated from business rationale and executable task scope.
- Unchanged Requirement values are inherited by reference.
- The next route is Work Package compilation, Verification Contract definition, or a human decision.

## Failure modes

| Failure | Correction |
|---|---|
| Treating the prompt as the spec | Extract acceptance criteria. |
| Listing implementation tasks | Route executable packaging to `work-package-compiler`. |
| Over-specifying trivial work | Use kernel only. |
| Hiding a changed assumption | Emit an explicit delta or stop for the decision owner. |
