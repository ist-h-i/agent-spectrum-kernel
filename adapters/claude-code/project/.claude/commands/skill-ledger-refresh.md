---
description: Refresh improvement-ledger lifecycle state and summarize debt movement.
---

Use `improvement-ledger` and the debt lifecycle contract.

For an explicit knowledge-promotion request, use `/operating-mode-router`, `/domain-rule-ledger`, and `/evidence-ledger`; promote only evidence-backed durable rules.

Do not start or delegate agents unless the request explicitly requires agent activity; report started, completed, and failed counts.

Refresh `docs/ai/improvement-ledger.md` only when the user asks for file edits. Otherwise produce a dry-run summary:

- stale candidates
- resolved candidates
- converted_to_rule items
- converted_to_check items
- accepted or wont_fix items
- metrics event candidate when adoption metrics are explicitly enabled

Keep current-PR blockers in review output. Do not hide blockers inside the ledger.

$ARGUMENTS
