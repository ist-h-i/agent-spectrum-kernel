---
name: spec-driven-development
description: Use test strategy to choose ownership, delivery order and release scope before design is fixed; define observable acceptance criteria, establish an executable-spec test method, or visualize specifications and unit-test behavior as scenarios for human review, preserving source IDs and evidence boundaries.
---

# Spec-Driven Development

## Goal

Use an observable difference between plausible plans to inform a project decision, or turn an already stable Requirement Contract into an observable behavior delta before work packaging or implementation. Do not let a test decide an unresolved business promise.

## Use when

- A test strategy must shape an unresolved requirement, architecture boundary, delivery sequence or release scope.
- The request changes user-visible or caller-visible behavior.
- The implementation touches multiple files/modules.
- Acceptance criteria are missing.
- Edge cases are unclear.
- Migration, compatibility, or rollout may matter.
- A new project needs tests as durable specification assets for developers and AI.
- The user asks to establish test writing conventions, a specification index, context retrieval, or verification selection.
- The user asks to animate a specification before implementation or compare test expectations and observed execution for human review.

## Do not use when

- The task is a trivial localized edit.
- A current Spec already exists and its acceptance criteria remain unchanged, unless a structural decision is still open or the project is establishing or consuming the executable-spec method below.

## When strategy must guide a decision before implementation

For an explicit strategy request, or a material open decision on an adopting project, use [decision-led test strategy](references/decision-led-test-strategy.md). Start before the requirement or architecture is fixed: pick a situation where two plausible plans lead to different outcomes, identify who can decide the promise and what observation distinguishes the plans, then use the answer to keep or change ownership, work order or release scope. If a business choice is open, return it to its owner; use `requirement-grill` only if selected. Do not emit accepted business expectations or compile dependent implementation. Check each downstream capability before invoking it. If unavailable, name the missing handoff and decision in work terms; continue independent work without inventing that skill’s procedure. Use the existing design, Work Package and verification artifacts at their normal points; a strategy discussion alone neither requires project setup nor authorizes implementation or release.

[Confirmed quote reissue](references/quote-reissue-decision.md) is the end-to-end worked example. The [local reservation example](references/examples/domain-context.md) shows a different decision: what one public operation can prove and why a concurrency or persistence claim would require another boundary.

## Executable-spec method for new projects

For an explicit method setup request, read [the setup workflow](references/executable-spec-workflow.md) first. Establish the project conventions and one representative behavior; do not invent business decisions or migrate an existing suite wholesale. This method is language-independent, developer/AI-facing, and opt-in per project. Ordinary behavior requests still use the process below.

Load only the reference needed for the current step:

| Work | Reference |
|---|---|
| Write or change a specification test; distinguish test lifetimes | [Writing conventions](references/spec-writing-conventions.md) |
| Build, refresh, or question a specification index | [Index contract](references/spec-index.md) |
| Determine what the AI must read before changing code | [Context retrieval](references/context-retrieval.md) |
| Select checks and expand verification after a change | [Verification selection](references/verification-selection.md) |
| Initialize project files or inspect language examples | [Templates and examples](references/project-templates.md) |
| Preview a specification or visually compare test expectations and execution | [Scenario visual review](references/scenario-visual-review.md) |

For an explicit scenario visualization request, read the scenario reference directly; do not require a full method setup first. Keep the scenario as a derived view of existing acceptance items. Separate intended behavior, reached assertions, and observed execution; preserve missing evidence and human review responsibility. A rendered animation never grants approval or supplies missing tests.

Keep business rationale in its existing Requirement/domain context, observable acceptance in ordinary test code or a referenced non-executable acceptance item, architectural reasons in current ADRs, and execution obligations/results in the existing verification/evidence artifacts. The index is a derived navigation view, never another authority or proof of completeness. Test metadata reuses lifecycle artifact/item IDs and revisions; it does not introduce a second spec identity system.

On adopted projects, carry the project profile reference through the existing Work Package/Implementation context. `controlled-implementation`, `refactor-implementation`, and `test-first-verification` consume it only when applicable. Do not add another always-on workflow, mandatory report, test framework, or proof-path selector. Do not claim registration, installation, execution, or effectiveness from source files alone.

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

For strategy work, report the actual decision (or the blocked choice and its owner), the distinguishing evidence, the resulting change or justified non-change in architecture/sequence/scope, and what remains unverified. Use the existing Issue, Requirement, ADR, Work Package or release record that owns each fact. Do not create another mandatory document.

For method setup only, report the conventions/templates created, their verified availability, and any project-specific setup gaps instead of inventing a business Spec. A reusable skill package can be complete while a project's generator, CI, and domain decisions remain unconfigured; state the boundary explicitly.

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

For strategy work, the owner can trace an unresolved choice to its evidence, project consequence and revisit condition; creating more tests or recording an already decided plan is not a demonstrated project effect. For method setup or scenario visualization, the applicable references and their entry points are available, examples are checked, and registration versus project initialization is distinguished. For behavior-definition work:

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
