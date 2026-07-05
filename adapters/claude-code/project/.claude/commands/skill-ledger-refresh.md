---
description: Refresh improvement-ledger lifecycle state and summarize debt movement.
---

Use `improvement-ledger` and the debt lifecycle contract.

Refresh `docs/ai/improvement-ledger.md` only when the user asks for file edits. Otherwise produce a dry-run summary:

- stale candidates
- resolved candidates
- converted_to_rule items
- converted_to_check items
- accepted or wont_fix items
- metrics event candidate when adoption metrics are explicitly enabled

Keep current-PR blockers in review output. Do not hide blockers inside the ledger.

$ARGUMENTS
