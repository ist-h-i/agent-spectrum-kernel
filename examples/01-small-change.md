# Example: Small change

## Request

```text
Change the label from “Submit” to “Save”.
```

## Workflow

Use `AGENTS.md` only.

Do not invoke `grill-design` or `spec-driven-development` unless the label has product/domain implications.

## Expected agent behavior

```text
Changed:
- Updated the button label in <file>.

Verified:
- Ran/checked <focused check if available>.

Not verified:
- <none or exact gap>.

Risks / assumptions:
- Assumed only visible label text should change.

Next:
- No follow-up required.
```
