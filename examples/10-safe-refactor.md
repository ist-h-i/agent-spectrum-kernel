# Example: Safe refactor

## Request

```text
Implement the approved refactor candidate from IMP-0007: split stale-count scanning into named helpers. Preserve validation behavior.
```

## Workflow

Use:

```text
refactor-implementation -> test-first-verification for regression proof
application-boundary-architecture first if responsibility, dependency direction, public contract, schema, UI behavior, or ownership boundaries may move
improvement-ledger only for follow-up debt or prevention candidates
```

## Expected first response

```text
Refactor objective:
- Approved candidate: IMP-0007
- Source: improvement ledger
- Files: scripts/validate-repo.mjs and focused validation fixtures
- Objective: split stale-count scanning into named helpers without changing detection behavior

Behavior preservation contract:
- Must not change: CLI arguments, report path, manifest path checks, skill section checks, stale phrase semantics, exit codes, stdout/stderr shape except for existing report text regenerated from the same data.

Allowed scope:
- scripts/validate-repo.mjs
- scripts/test-validate-repo.mjs only for regression coverage
- docs/validation-report.md only after regeneration

Forbidden scope:
- dependency changes
- manifest structure changes
- unrelated docs cleanup
- new stale phrase policy not covered by IMP-0007
- public CLI contract changes

Boundary decision:
- No boundary change if helpers stay inside scripts/validate-repo.mjs.
- Use application-boundary-architecture first if the refactor moves validation policy into a new module or package boundary.

Verification contract:
- Existing behavior to preserve: current repository validation passes.
- Regression to prevent: stale count fixtures still fail when counts drift and pass when counts match.
- Commands:
  - node scripts/test-validate-repo.mjs
  - node scripts/validate-repo.mjs
```

## Ambiguous candidate handling

If the request says only:

```text
Refactor validation code from the ledger.
```

Expected response:

```text
Candidate exists but scope is ambiguous.
Smallest safe target:
- Refactor only stale-count scanning helpers in scripts/validate-repo.mjs.
- Preserve CLI behavior and existing validation output.
- Verify with node scripts/test-validate-repo.mjs and node scripts/validate-repo.mjs.

Stop condition:
- Do not edit until this target is authorized, or provide the concrete ledger ID/files/objective.
```

Safe refactor does not rediscover debt and does not hide behavior changes inside cleanup.
