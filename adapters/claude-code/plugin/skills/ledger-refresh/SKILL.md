---
description: Refresh improvement-ledger lifecycle state and summarize debt movement.
---

# Ledger Refresh

Use `improvement-ledger` and `docs/debt-lifecycle-contract.md`.

Read `${CLAUDE_PLUGIN_ROOT}/contracts/claim-evidence-status-contract.md` and `${CLAUDE_PLUGIN_ROOT}/schemas/claim-evidence-status.schema.json`. Apply claim status inline by default. Apply `/ai-skills:evidence-ledger` only when an observed closed trigger, such as an actual `stable_claim_ids` requirement, selects `formal_ledger`; installation alone is not activation.

Default to dry-run unless the user explicitly asks to edit the ledger. Summarize:

- stale candidates,
- resolved candidates,
- converted_to_rule items,
- converted_to_check items,
- accepted or wont_fix items,
- metrics event candidate when adoption metrics are explicitly enabled.

Keep current-PR blockers in review Blocking evidence or detailed Required fixes. Do not hide blockers inside the ledger.

$ARGUMENTS
