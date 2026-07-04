# Example: Prevention rule feedback

## Request

```text
Several review findings repeat across PRs. Decide which ones should become rules, validation checks, context entries, or no action.
```

## Workflow

Use:

```text
improvement-ledger prevention-rule feedback -> evidence-ledger if the conversion claim needs evidence classification
```

## Input

```text
- IMP-0002: repeated stale manifest count references in docs. Evidence: two PR reviews and one failing fixture.
- IMP-0003: one reviewer disliked a variable name. Evidence: one subjective comment, no impact.
- IMP-0004: agents repeatedly edit generated files in Project A. Evidence: three review comments in that project.
```

## Expected output

```text
Prevention-rule feedback:

Finding:
- Stale manifest count references recur in maintained docs.

Repeat pattern:
- repeated

Prevention target:
- validation script

Proposed rule or check:
- Add or keep a fixture that fails when maintained docs reference a skill count different from manifest.json.

Why this target:
- The pattern is mechanically detectable and should not rely on every reviewer remembering it.

Evidence:
- Verified: two PR reviews and one failing fixture.

Scope:
- validation_only

Decision:
- convert

Finding:
- Reviewer disliked a local variable name.

Repeat pattern:
- one-off

Prevention target:
- no prevention needed

Proposed rule or check:
- none

Why this target:
- No repeated pattern, objective impact, or durable rule value.

Evidence:
- Supported only by one subjective review comment.

Scope:
- review_only

Decision:
- reject

Finding:
- Agents repeatedly edit generated files in Project A.

Repeat pattern:
- repeated

Prevention target:
- project overlay

Proposed rule or check:
- Project A overlay should name generated paths, regeneration command, and stop condition before manual edits.

Why this target:
- The rule is project-specific and should not be dumped into generic AGENTS.md.

Evidence:
- Verified: three Project A review comments.

Scope:
- project_specific

Decision:
- convert
```

Choose the narrowest effective target: project overlay for local policy, `SKILL.md` or checklist for reusable workflow behavior, validation/lint/test/CI for executable checks, implementation or review context for reusable observed facts, and `AGENTS.md` only for always-on rules.
