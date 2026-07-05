---
description: Refresh improvement-ledger lifecycle state and summarize debt movement.
---

# Ledger Refresh

Use `improvement-ledger` and `docs/debt-lifecycle-contract.md`.

Default to dry-run unless the user explicitly asks to edit the ledger. Summarize:

- stale candidates,
- resolved candidates,
- converted_to_rule items,
- converted_to_check items,
- accepted or wont_fix items,
- metrics event candidate when adoption metrics are explicitly enabled.

Keep current-PR blockers in review required fixes. Do not hide blockers inside the ledger.

$ARGUMENTS
