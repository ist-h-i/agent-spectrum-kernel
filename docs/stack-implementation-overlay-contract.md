# Stack Implementation Overlay Contract

Use this contract for stack-specific implementation skills such as Angular, React, Python, Java, or similar runtime/framework overlays.

Stack implementation overlays are optional supplements to the generic workflow. They are selected only after `skills/skill-router/SKILL.md` has selected the generic workflow, and they feed stack-specific constraints into `controlled-implementation` and verification supplements into `test-first-verification`.

They must not replace `skill-router`, `controlled-implementation`, or `test-first-verification`.

## Terms

- Project overlay: Repository-specific rules, commands, domain language, safety policy, and local conventions. Use `docs/project-overlay-template.md` as the template.

- Stack overlay: A stack-specific implementation skill or rule set that applies only when the current task touches a matching framework, runtime, package ecosystem, or toolchain.

- Implementation context: Durable, evidence-labeled repository implementation context in `docs/ai/implementation-context.md`. It records stack inventory, commands, implementation patterns, boundaries, verification hints, and overlay hooks. It is not task progress.

- Review context: Durable, evidence-labeled repository review context in `docs/ai/review-context.md`. It records consumers, output contracts, critical workflows, known issues, accepted risks, and review noise-control rules. It does not make implementation decisions.

## Required Contract Shape

Every stack implementation overlay must define the following fields.

```yaml
name:
stack:
applies_when:
do_not_use_when:
requires_context:
reads:
  - docs/ai/implementation-context.md
  - AGENTS.project.md or equivalent project overlay
  - nearby files/tests
outputs:
  - stack surface
  - existing pattern
  - constraints for controlled-implementation
  - verification supplement for test-first-verification
  - stop conditions
must_not:
  - replace generic workflow
  - make final merge decision
  - force stack-specific architecture globally
  - introduce layers only by preference
```

## Field Requirements

- `name`: Canonical skill or overlay name.

- `stack`: The framework, runtime, language, package ecosystem, or toolchain covered by the overlay.

- `applies_when`: Observable stack signals required before using the overlay, such as files, dependencies, config, templates, test types, generated artifacts, or nearby code patterns.

- `do_not_use_when`: Conditions where generic workflow is enough or another overlay owns the concern.

- `requires_context`: Required project or implementation context before the overlay can safely add constraints. Missing context should become a stop condition or an explicit `Unknown`, not an invented rule.

- `reads`: Sources the overlay must inspect before giving constraints. At minimum, read implementation context, project overlay rules when present, and nearby files/tests.

- `outputs`: The bounded output the generic workflow may consume:

  - stack surface: which files, APIs, templates, build/test tools, or runtime behavior are stack-specific in this task,
  - existing pattern: local conventions observed in nearby code/tests,
  - constraints for `controlled-implementation`: stack-specific boundaries, public APIs, lifecycle rules, generated-file limits, and forbidden changes,
  - verification supplement for `test-first-verification`: focused stack commands, fixtures, runtime/manual checks, or negative cases,
  - stop conditions: stack-specific uncertainty, missing context, unsafe generated-file edits, broad architecture impact, or verification gaps.

- `must_not`: Hard limits that keep the overlay from becoming a replacement workflow or a global architecture mandate.

## Selection Order

Use this order for implementation tasks:

```text
skill-router selects the generic workflow
-> project overlay is considered when repository-specific rules exist
-> stack implementation overlay is considered when stack signals apply
-> controlled-implementation receives implementation constraints
-> test-first-verification receives verification supplements
```

The generic routing table must stay stack-agnostic. Do not add Angular, React, Python, Java, or other stack overlays to the generic `skill-router` table one by one.

## Required Principles

- Generic workflow selection happens first through `skill-router`.
- Stack overlays are selected only after the generic workflow is chosen.
- Stack overlays supplement `controlled-implementation` and `test-first-verification`; they do not replace them.
- Stack overlays may add implementation constraints and verification supplements.
- Stack overlays are optional and project/stack-signal driven.
- Stack overlays must not be added to the generic routing table one by one.
- Stack overlays must not force framework-specific architecture by default.
- Stack overlays must not make final merge decisions. Review and merge readiness remain review workflow responsibilities.
- Stack overlays must not introduce layers, services, adapters, state mechanisms, or architecture guards only by preference.

## Minimal Output Format

When a stack overlay is used, it should produce this bounded handoff to the generic implementation workflow:

```text
Stack overlay:
- Name:
- Stack:
- Stack surface:
- Existing pattern:
- Constraints for controlled-implementation:
- Verification supplement for test-first-verification:
- Stop conditions:
- Evidence:
```

## Acceptance Checklist

A stack implementation overlay is acceptable when:

- it can be skipped safely when no matching stack signal exists,
- it reads repository evidence before adding stack constraints,
- it distinguishes local observed patterns from generic stack preferences,
- it feeds constraints into `controlled-implementation`,
- it feeds verification supplements into `test-first-verification`,
- it keeps `skill-router`, `controlled-implementation`, and `test-first-verification` as the generic workflow backbone,
- it does not encode stack-specific architecture as a global default.
