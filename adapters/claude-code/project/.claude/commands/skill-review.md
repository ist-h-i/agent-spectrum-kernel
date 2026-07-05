---
description: Run the AI Coding Kernel review flow for the current PR or diff.
---

Use the installed project skills from this repository projection.

Start with `/review-router` to decide applicable review layers. Run only the required gates. End with `/review-final-merge-gate` style output:

- decision: `approve`, `approve with comments`, `request changes`, `block`, or `insufficient evidence`
- layer summary
- required fixes
- suggestions
- improvement-ledger candidates when applicable
- evidence reviewed
- residual risk

Keep current-PR blockers separate from non-blocking improvement-ledger candidates. Do not publish metrics externally.

$ARGUMENTS
