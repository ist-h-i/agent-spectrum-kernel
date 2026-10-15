---
name: spec-driven-development
description: Define observable behavior and acceptance criteria, or establish a language-independent executable-spec test method for new projects, including writing conventions, a specification index, AI context retrieval, and verification selection.
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
- A new project needs tests as durable specification assets for developers and AI.
- The user asks to establish test writing conventions, a specification index, context retrieval, or verification selection.

## Do not use when

- The task is a trivial localized edit.
- A current Spec already exists and its acceptance criteria remain unchanged, unless establishing or consuming the executable-spec method below.

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

For method setup, the four references and their entry points are available, examples are checked, and registration versus project initialization is distinguished. For behavior-definition work:

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
