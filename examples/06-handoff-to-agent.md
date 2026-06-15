# Example: Handoff to another agent

## Request

```text
Create the next Codex task from this partial implementation.
```

## Workflow

Use:

```text
handoff-generation → evidence-ledger
```

## Expected output

```text
Task:
Finish CSV export escaping and tests.

Context:
The export UI and basic CSV generation are implemented. Current gap is standards-compliant escaping and regression coverage.

Allowed scope:
- src/export/csv.ts
- src/export/csv.test.ts

Forbidden scope:
- UI redesign
- dependency changes
- unrelated date/filter behavior

Expected output:
- Correct quote escaping.
- Regression tests for comma, quote, newline, and empty value.

Verification:
- npm test -- csv
- npm run typecheck

Do not:
- Change the export API shape unless tests prove current API cannot support the fix.

Stop condition:
- Stop if escaping requires changing persisted export settings or public API contracts.
```
